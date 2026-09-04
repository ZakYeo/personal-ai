import type { PresentationControl } from "../../../../src/presentation-contract.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";

export interface PresentationClient {
  connect(): void;
  disconnect(): void;
  sendControl(control: PresentationControl): Promise<void>;
  subscribe(listener: (state: RuntimePresentationState) => void): () => void;
}
