// ruleid: desktop-view-no-implementation-import, desktop-model-no-framework-import, desktop-repository-import-through-contract-only, desktop-view-model-no-implementation-import
import { connect } from "../apps/desktop/src/infrastructure/socket.js";
// ruleid: desktop-view-model-no-implementation-import, desktop-model-no-framework-import, desktop-view-no-implementation-import
import { openUrl } from "@tauri-apps/plugin-opener";
// ruleid: desktop-model-no-framework-import
import { useState } from "react";
// ruleid: desktop-infrastructure-no-view-import, desktop-model-no-framework-import, desktop-repository-import-through-contract-only
import { AppView } from "../apps/desktop/src/views/AppView.js";
// ruleid: desktop-repository-import-through-contract-only, desktop-view-model-no-implementation-import, desktop-view-no-implementation-import
import type { Assistant } from "../src/core/assistant/index.js";
// ok: desktop-repository-import-through-contract-only
import type { AssistantRuntimeEvent } from "../src/presentation-contract.js";

export function unsafeRequest(): void {
  // ruleid: desktop-browser-api-outside-infrastructure
  void fetch("https://example.com");
  // ruleid: desktop-browser-api-outside-infrastructure
  void new BroadcastChannel("unsafe");
  // ruleid: desktop-browser-api-outside-infrastructure
  void JSON.parse("{}");
}

export function UnsafeMarkup() {
  const html = { __html: "unsafe" };
  // ruleid: desktop-no-dangerous-html
  return <div dangerouslySetInnerHTML={html} />;
}

export function UnsafeLink({ url }: { readonly url: string }) {
  // ruleid: desktop-no-dynamic-external-anchor
  return <a href={url}>Open</a>;
}

export function unsafeAssertions(value: unknown): void {
  // ruleid: desktop-no-double-assertion, desktop-no-any-assertion
  void (value as any);
  // ruleid: desktop-no-double-assertion
  void (value as unknown as string);
}

export function unsafeRuntime(io: {
  presentation?: { publish(event: unknown): void };
}): void {
  // ruleid: runtime-presentation-publish-only-from-coordinator
  io.presentation?.publish({ type: "wake_listening" });
  const eventStream = io.presentation;
  // ruleid: runtime-presentation-publish-only-from-coordinator
  eventStream?.publish({ type: "wake_listening" });
  const publisher = io.presentation;
  // ruleid: runtime-presentation-publish-only-from-coordinator
  publisher.publish({ type: "wake_listening" });
}

export function safeExamples(request: () => void): void {
  // ok: desktop-browser-api-outside-infrastructure
  request();
  // ok: desktop-no-dangerous-html
  void (<div>Safe text</div>);
  // ok: desktop-no-dynamic-external-anchor
  void (<button>Open</button>);
}

void connect;
void openUrl;
void useState;
void AppView;
const assistant: Assistant | undefined = undefined;
const event: AssistantRuntimeEvent | undefined = undefined;
void assistant;
void event;
