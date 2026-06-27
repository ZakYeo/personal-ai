import {
  createAbortingFetchStub,
  createFailingCommandScript,
  createFetchStub,
  createMissingProviderCredentialEnv,
  createProviderCredentialEnv,
  createProviderTransportFailureFetchStub,
  createShellCommand,
  createSuccessfulCommandScript,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
  voiceAdapterContractFixtures,
} from "./adapter-contract.js";

describe("adapter contract test support", () => {
  it("creates deterministic provider fetch responses", async () => {
    const fetch = createFetchStub(jsonResponse({ ok: true }));
    const response = await fetch("https://provider.test");

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("https://provider.test");
  });

  it("creates provider error responses with diagnostics", async () => {
    const response = providerErrorResponse(429, { error: "quota" });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(429);
    await expect(response.text()).resolves.toBe('{"error":"quota"}');
  });

  it("creates provider credential environments", () => {
    expect(createProviderCredentialEnv("PROVIDER_API_KEY", "secret")).toEqual({
      PROVIDER_API_KEY: "secret",
    });
    expect(createMissingProviderCredentialEnv()).toEqual({});
  });

  it("creates malformed provider JSON responses", async () => {
    const response = malformedJsonResponse("{not-json");

    expect(response.ok).toBe(true);
    await expect(response.text()).resolves.toBe("{not-json");
  });

  it("creates provider transport failure fetch stubs", async () => {
    const error = new TypeError("network unavailable");
    const fetch = createProviderTransportFailureFetchStub(error);

    await expect(fetch("https://provider.test")).rejects.toBe(error);
  });

  it("creates aborting fetch stubs", async () => {
    const fetch = createAbortingFetchStub();
    const controller = new AbortController();
    const request = fetch("https://provider.test", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("creates command and voice adapter fixtures", () => {
    expect(createShellCommand("printf ok")).toEqual({
      args: ["-c", "printf ok", "sh"],
      command: "/bin/sh",
    });
    expect(createSuccessfulCommandScript("out", "err")).toBe(
      "printf '%s' \"out\"; printf '%s' \"err\" >&2",
    );
    expect(createFailingCommandScript("failed", 7)).toBe(
      "printf '%s' \"failed\" >&2; exit 7",
    );
    expect(voiceAdapterContractFixtures.transcription.text).toContain(
      "Hey Jarvis",
    );
  });
});
