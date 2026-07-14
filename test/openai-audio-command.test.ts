import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("OpenAI audio command helper", () => {
  it("passes credentials through a private file descriptor instead of argv", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-audio-command-"),
    );
    const curlPath = join(directory, "curl");
    const argsPath = join(directory, "args");
    const headerPath = join(directory, "header");
    const secret = "test-secret-not-for-argv";
    await writeFile(
      curlPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$AUDIT_ARGS"\ncat <&3 > "$AUDIT_HEADER"\nprintf transcript\n',
    );
    await chmod(curlPath, 0o755);

    await execFileAsync(
      "/bin/sh",
      [
        join(process.cwd(), "scripts", "openai-audio-command.sh"),
        "transcribe",
        "capture.wav",
      ],
      {
        env: {
          AUDIT_ARGS: argsPath,
          AUDIT_HEADER: headerPath,
          OPENAI_API_KEY: secret,
          PATH: `${directory}:/usr/bin:/bin`,
        },
      },
    );

    expect(await readFile(argsPath, "utf8")).not.toContain(secret);
    expect(await readFile(headerPath, "utf8")).toBe(
      `Authorization: Bearer ${secret}\n`,
    );
  });
});
