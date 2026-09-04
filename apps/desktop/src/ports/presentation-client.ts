import type {
  PresentationControl,
  PresentationControlResult,
} from "../../../../src/presentation-contract.js";
import type { RuntimePresentationState } from "../model/desktop-state.js";

export interface PresentationClient {
  connect(): void;
  disconnect(): void;
  sendControl(control: PresentationControl): Promise<PresentationControlResult>;
  subscribe(listener: (state: RuntimePresentationState) => void): () => void;
}
