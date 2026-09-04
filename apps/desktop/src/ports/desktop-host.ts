import type { PresentationControl } from "../../../../src/presentation-contract.js";

export interface DesktopHost {
  openSource(url: string): Promise<void>;
  sendControl(control: PresentationControl): Promise<void>;
}
