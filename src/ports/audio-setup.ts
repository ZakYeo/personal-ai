export interface AudioSetupDevice {
  readonly id: string;
  readonly label: string;
}

/** Local-only, five-second, 24 kHz mono signed 16-bit PCM setup audio. */
export interface AudioSetupPort {
  listInputs(): Promise<readonly AudioSetupDevice[]>;
  capture(deviceId: string, signal: AbortSignal): AsyncIterable<Uint8Array>;
  play(chunks: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<void>;
}
