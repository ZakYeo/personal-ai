/** Internal delivery receipt; never expose it to providers or human projections. */
export interface ResponsePresentationReceipt {
  record(): Promise<void>;
}
