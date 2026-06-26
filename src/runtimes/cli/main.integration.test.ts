import { main } from "./main.js";

describe("personal-ai ask CLI", () => {
  it("prints the calendar response", async () => {
    const { io, stdout, stderr } = createIo();

    await expect(
      main(
        [
          "ask",
          "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
        ],
        io,
      ),
    ).resolves.toBe(0);
    expect(stdout).toEqual(["The upcoming wedding is on 2026-09-12.\n"]);
    expect(stderr).toEqual([]);
  });

  it("prints the messaging draft response", async () => {
    const { io, stdout } = createIo();

    await expect(
      main(
        ["ask", "Hey Jarvis, can you respond to that WhatsApp message for me?"],
        io,
      ),
    ).resolves.toBe(0);
    expect(stdout).toEqual([
      'Drafted a whatsapp reply: "Thanks for the message. I will take a look and get back to you shortly."\n',
    ]);
  });

  it("prints the alarm creation response with a fixed clock", async () => {
    const { io, stdout } = createIo({
      PERSONAL_AI_FIXED_NOW: "2026-06-26T09:00:00.000Z",
    });

    await expect(
      main(["ask", "Hey Jarvis, set an alarm to ping me in 10 minutes."], io),
    ).resolves.toBe(0);
    expect(stdout).toEqual([
      "Alarm set for 2026-06-26T09:10:00.000Z (ping me).\n",
    ]);
  });

  it("prints the empty alarm list response", async () => {
    const { io, stdout } = createIo();

    await expect(main(["ask", "Hey Jarvis, list my alarms"], io)).resolves.toBe(
      0,
    );
    expect(stdout).toEqual(["There are no alarms set.\n"]);
  });

  it("returns usage for invalid input", async () => {
    const { io, stdout, stderr } = createIo();

    await expect(main(["ask"], io)).resolves.toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      'Usage: personal-ai ask [--config path/to/config.json] "command text"\n',
    ]);
  });
});

function createIo(env: NodeJS.ProcessEnv = {}): {
  io: Parameters<typeof main>[1];
  stderr: string[];
  stdout: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      env,
      stdout: createWriter(stdout),
      stderr: createWriter(stderr),
    },
    stdout,
    stderr,
  };
}

function createWriter(writes: string[]): Pick<NodeJS.WriteStream, "write"> {
  return {
    write: (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  };
}
