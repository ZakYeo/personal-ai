import { loadPresentationConnectionConfig } from "./tauri-presentation-config.js";

describe("Tauri presentation configuration", () => {
  it("parses the narrow command response without exposing environment access", async () => {
    await expect(
      loadPresentationConnectionConfig({
        invokeCommand: () =>
          Promise.resolve({
            endpoint: "ws://127.0.0.1:43118",
            token: "a-secure-presentation-token-with-32-characters",
          }),
        isTauriRuntime: () => true,
      }),
    ).resolves.toEqual({
      endpoint: "ws://127.0.0.1:43118",
      token: "a-secure-presentation-token-with-32-characters",
    });
  });

  it("rejects extra fields from the native boundary", async () => {
    await expect(
      loadPresentationConnectionConfig({
        invokeCommand: () =>
          Promise.resolve({
            diagnostics: "private",
            endpoint: "ws://127.0.0.1:43118",
            token: "a-secure-presentation-token-with-32-characters",
          }),
        isTauriRuntime: () => true,
      }),
    ).rejects.toThrow("configuration is invalid");
  });
});
