export interface ProcessControl {
  kill(pid: number, signal: NodeJS.Signals): void;
  platform: string;
}
