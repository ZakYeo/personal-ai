import type { PresentationControl } from "../../../../src/presentation-contract.js";

export interface DesktopHost {
  initialize(): Promise<void>;
  isAutostartEnabled(): Promise<boolean>;
  openSource(url: string): Promise<void>;
  sendControl(control: PresentationControl): Promise<void>;
  setAutostart(enabled: boolean): Promise<void>;
  setPushToTalkShortcut(shortcut?: string): Promise<void>;
}
