type ParsedRealtimeEvent =
  | {
      type: "conversation.item.input_audio_transcription.completed";
      transcript?: string;
    }
  | {
      type: "conversation.item.input_audio_transcription.delta";
      delta: string;
    }
  | {
      type: "error";
      event: Record<string, unknown>;
    }
  | {
      type: "ignored";
    };

export function parseRealtimeTranscriptionEvent(
  messageEvent: unknown,
): ParsedRealtimeEvent {
  const event = parseRealtimeEvent(messageEvent);

  if (event.type === "error") {
    return {
      event,
      type: "error",
    };
  }

  if (event.type === "conversation.item.input_audio_transcription.delta") {
    return {
      delta: parseStringField(event, "delta"),
      type: "conversation.item.input_audio_transcription.delta",
    };
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const transcript = parseOptionalStringField(event, "transcript");

    return {
      ...(transcript === undefined ? {} : { transcript }),
      type: "conversation.item.input_audio_transcription.completed",
    };
  }

  return {
    type: "ignored",
  };
}

function parseRealtimeEvent(messageEvent: unknown): Record<string, unknown> {
  if (!isRecord(messageEvent) || typeof messageEvent.data !== "string") {
    throw new Error("Realtime transcription event must include string data.");
  }

  const parsed = JSON.parse(messageEvent.data) as unknown;

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new Error("Realtime transcription event type must be a string.");
  }

  return parsed;
}

function parseStringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];

  if (typeof field !== "string") {
    throw new Error(`Realtime transcription event ${key} must be a string.`);
  }

  return field;
}

function parseOptionalStringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "string") {
    throw new Error(`Realtime transcription event ${key} must be a string.`);
  }

  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
