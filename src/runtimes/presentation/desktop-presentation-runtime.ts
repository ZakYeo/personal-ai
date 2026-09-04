import { randomUUID } from "node:crypto";
import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantPresentationProjection } from "../../ports/presentation.js";
import { createProfilePresentationControl } from "../../application/profile-presentation-control.js";
import { logRuntimeFailure } from "../human-boundary.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import type { RuntimeServiceRegistry } from "../runtime-service-registry.js";
import type { VoiceRuntimeIo } from "../voice/voice-runtime-io.js";
import { createAssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import { createPresentationControlHandler } from "./presentation-control-handler.js";
import {
  createPresentationInteractionCoordinator,
  type PresentationInteractionCoordinator,
} from "./presentation-interaction-coordinator.js";
import {
  startPresentationWebSocketServer,
  type PresentationWebSocketServer,
} from "./presentation-websocket-server.js";
import { createPresentationProjectionStream } from "./presentation-projection-stream.js";
import { readPresentationProjection } from "./presentation-projection-reader.js";
import { profileStoreService } from "../profile-runtime-services.js";

type PresentationServerStarterOptions = Parameters<
  typeof startPresentationWebSocketServer
>[0];

interface DesktopPresentationRuntime {
  readonly presentation?: PresentationInteractionCoordinator;
  start(
    assistant: Assistant,
    context?: {
      readonly config: LoadedRuntimeConfig;
      readonly services: RuntimeServiceRegistry;
    },
  ): Promise<void>;
  stop(): Promise<void>;
}

interface DesktopPresentationStartContext {
  readonly config: LoadedRuntimeConfig;
  readonly services: RuntimeServiceRegistry;
}

export function createDesktopPresentationRuntime(options: {
  readonly clearRefreshTimer?: (timer: NodeJS.Timeout) => void;
  readonly createInstanceId?: () => string;
  readonly env: Record<string, string | undefined>;
  readonly io?: VoiceRuntimeIo;
  readonly now: () => Date;
  readonly projectionRefreshIntervalMs?: number;
  readonly readProjection?: typeof readPresentationProjection;
  readonly setRefreshTimer?: (
    callback: () => void,
    milliseconds: number,
  ) => NodeJS.Timeout;
  readonly startServer?: (
    options: PresentationServerStarterOptions,
  ) => Promise<PresentationWebSocketServer>;
}): DesktopPresentationRuntime {
  const token = options.env.PERSONAL_AI_PRESENTATION_TOKEN;
  if (token === undefined) return disabledRuntime;

  const instanceId = (options.createInstanceId ?? randomUUID)();
  const eventStream = createAssistantRuntimeEventStream({
    instanceId,
    now: options.now,
    onListenerError: (error) => logRuntimeFailure(error, options.io ?? {}),
  });
  let interactionSequence = 0;
  const presentation = createPresentationInteractionCoordinator({
    createInteractionId: () => {
      interactionSequence += 1;
      return `${instanceId}-${interactionSequence}`;
    },
    publish: eventStream.publish.bind(eventStream),
  });
  const projectionStream = createPresentationProjectionStream();
  let baseProjection = projectionStream.snapshot();
  let activity: AssistantPresentationProjection["activity"] = [];
  let interactions: AssistantPresentationProjection["interactions"] = [];
  let sources: AssistantPresentationProjection["sources"] = [];
  let timeZone = "UTC";
  let refreshProjection: (() => Promise<void>) | undefined;
  let refreshQueue = Promise.resolve();
  let refreshTimer: NodeJS.Timeout | undefined;
  eventStream.subscribe((event) => {
    if (event.type === "response_ready") sources = event.citations ?? [];
    if (event.type !== "completed" && event.type !== "safe_failure") return;
    const interaction = eventStream.snapshot().interaction;
    activity = [
      {
        occurredAt: renderActivityTime(event.occurredAt, timeZone),
        summary:
          event.type === "completed"
            ? "Assistant request completed"
            : "Assistant request failed safely",
      },
      ...activity,
    ].slice(0, 100);
    if (interaction?.response) {
      interactions = [
        {
          id: interaction.id,
          request: interaction.transcript,
          response: interaction.response.text,
        },
        ...interactions.filter((item) => item.id !== interaction.id),
      ].slice(0, 50);
    }
    publishProjection();
    void enqueueProjectionRefresh();
  });
  let server: PresentationWebSocketServer | undefined;
  let startAttempted = false;

  return Object.freeze({
    presentation,
    async start(
      assistant: Assistant,
      context?: DesktopPresentationStartContext,
    ) {
      if (startAttempted) return;
      startAttempted = true;
      if (context) {
        timeZone = context.config.assistant.timeZone;
        refreshProjection = () =>
          (options.readProjection ?? readPresentationProjection)({
            config: context.config,
            now: options.now(),
            reportFailure: (error) =>
              logRuntimeFailure(error, options.io ?? {}),
            services: context.services,
          }).then((projection) => {
            baseProjection = projection;
            publishProjection();
          });
        await enqueueProjectionRefresh();
        refreshTimer = (options.setRefreshTimer ?? setInterval)(
          () => void enqueueProjectionRefresh(),
          options.projectionRefreshIntervalMs ?? 30_000,
        );
        refreshTimer.unref();
      }
      const port = parsePresentationPort(
        options.env.PERSONAL_AI_PRESENTATION_PORT,
      );
      const profileStore = context?.services.get(profileStoreService);
      server = await (options.startServer ?? startPresentationWebSocketServer)({
        eventStream,
        handleControl: createPresentationControlHandler({
          assistant,
          eventStream,
          ...(options.io ? { io: options.io } : {}),
          presentation,
          ...(profileStore
            ? {
                profileControl: createProfilePresentationControl({
                  now: options.now,
                  store: profileStore,
                }),
              }
            : {}),
        }),
        port,
        projectionStream,
        reportFailure: (error) => logRuntimeFailure(error, options.io ?? {}),
        token,
      });
    },
    async stop() {
      if (refreshTimer) {
        (options.clearRefreshTimer ?? clearInterval)(refreshTimer);
        refreshTimer = undefined;
      }
      await refreshQueue;
      await server?.stop();
    },
  });

  function publishProjection(): void {
    projectionStream.update({
      ...baseProjection,
      activity,
      interactions,
      sources,
    });
  }

  function enqueueProjectionRefresh(): Promise<void> {
    if (!refreshProjection) return refreshQueue;
    refreshQueue = refreshQueue
      .then(refreshProjection)
      .catch((error) => logRuntimeFailure(error, options.io ?? {}));
    return refreshQueue;
  }
}

const disabledRuntime: DesktopPresentationRuntime = Object.freeze({
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
});

function parsePresentationPort(value: string | undefined): number {
  if (value === undefined) return 43_118;
  if (!/^\d{1,5}$/.test(value)) {
    throw new Error(
      "Presentation port must be an integer from 1 through 65535.",
    );
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      "Presentation port must be an integer from 1 through 65535.",
    );
  }
  return port;
}

function renderActivityTime(value: string, timeZone: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
