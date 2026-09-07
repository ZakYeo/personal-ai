import { createPulseAudioSetup } from "./pulse-audio-setup.js";

describe("local microphone setup adapter", () => {
  it("validates devices, excludes monitor sources, and admits only discovered input IDs", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        {
          name: "input.one",
          description: "USB microphone",
          monitor_source: "",
        },
        {
          name: "output.monitor",
          description: "Speaker monitor",
          monitor_source: "output",
        },
      ]),
      stdoutTruncated: false,
      stderr: "",
      stderrTruncated: false,
    });
    const read = vi.fn().mockReturnValue({ chunks: [] });
    const audio = createPulseAudioSetup({
      run,
      read,
      write: vi.fn(),
      environment: {},
    });
    expect(await audio.listInputs()).toEqual([
      { id: "input.one", label: "USB microphone" },
    ]);
    const signal = new AbortController().signal;
    expect(() => audio.capture("invented", signal)).toThrow("not selected");
    audio.capture("input.one", signal);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "sox",
        signal,
        timeoutMs: 8_000,
        args: [
          "-q",
          "-t",
          "pulseaudio",
          "input.one",
          "-r",
          "24000",
          "-c",
          "1",
          "-b",
          "16",
          "-e",
          "signed-integer",
          "-t",
          "raw",
          "-",
          "trim",
          "0",
          "5",
        ],
      }),
    );
  });

  it.each([
    "{}",
    '[{"name":"one","description":9,"monitor_of_sink":null}]',
    '[{"name":"one","description":"Mic","monitor_of_sink":null},{"name":"one","description":"Mic","monitor_of_sink":null}]',
  ])("rejects malformed device data %s", async (stdout) => {
    const audio = createPulseAudioSetup({
      run: vi.fn().mockResolvedValue({ stdout, stdoutTruncated: false }),
      read: vi.fn(),
      write: vi.fn(),
      environment: {},
    });
    await expect(audio.listInputs()).rejects.toThrow();
  });
});
