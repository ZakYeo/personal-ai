import type { ResponsePresentationReceipt } from "../ports/response-presentation.js";

/** Duplicate delivery acknowledgements share the original durable operation. */
export function createResponsePresentationReceipt(
  record: () => Promise<void>,
): ResponsePresentationReceipt {
  let recorded: Promise<void> | undefined;
  return Object.freeze({
    record: () => (recorded ??= Promise.resolve().then(record)),
  });
}
