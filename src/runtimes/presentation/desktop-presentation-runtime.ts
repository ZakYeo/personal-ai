import { randomUUID } from "node:crypto";
import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantPresentationProjection } from "../../ports/presentation.js";
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
  readonly createInstanceId?: () => string;
  readonly env: Record<string, string | undefined>;
  readonly io?: VoiceRuntimeIo;
  readonly now: () => Date;
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
    publish: (event) => eventStream.publish(event),
  });
  const projectionStream = createPresentationProjectionStream();
  let baseProjection = projectionStream.snapshot();
  let activity: AssistantPresentationProjection["activity"] = [];
  let interactions: AssistantPresentationProjection["interactions"] = [];
  let sources: AssistantPresentationProjection["sources"] = [];
  let timeZone = "UTC";
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
        baseProjection = await readPresentationProjection({
          config: context.config,
          now: options.now(),
          reportFailure: (error) => logRuntimeFailure(error, options.io ?? {}),
          services: context.services,
        });
        publishProjection();
      }
      const port = parsePresentationPort(
        options.env.PERSONAL_AI_PRESENTATION_PORT,
      );
      server = await (options.startServer ?? startPresentationWebSocketServer)({
        eventStream,
        handleControl: createPresentationControlHandler({
          assistant,
          eventStream,
          ...(options.io ? { io: options.io } : {}),
          presentation,
        }),
        port,
        projectionStream,
        token,
      });
    },
    async stop() {
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
