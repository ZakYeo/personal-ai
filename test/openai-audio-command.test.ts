import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { runCommand } from "../src/adapters/desktop/process-runner.js";

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

  it("passes synthesized assistant text through stdin instead of argv", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-audio-command-"),
    );
    const curlPath = join(directory, "curl");
    const jqPath = join(directory, "jq");
    const curlArgsPath = join(directory, "curl-args");
    const jqArgsPath = join(directory, "jq-args");
    const jqInputPath = join(directory, "jq-input");
    const privateText = "Private calendar appointment with Dr Smith";
    await writeFile(
      jqPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$AUDIT_JQ_ARGS"\ncat > "$AUDIT_JQ_INPUT"\nprintf \'{}\'\n',
    );
    await writeFile(
      curlPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$AUDIT_CURL_ARGS"\ncat >/dev/null\ncat <&3 >/dev/null\n',
    );
    await Promise.all([chmod(curlPath, 0o755), chmod(jqPath, 0o755)]);

    await runCommand({
      args: [
        join(process.cwd(), "scripts", "openai-audio-command.sh"),
        "speak",
        join(directory, "speech.wav"),
      ],
      command: "/bin/sh",
      environment: {
        AUDIT_CURL_ARGS: curlArgsPath,
        AUDIT_JQ_ARGS: jqArgsPath,
        AUDIT_JQ_INPUT: jqInputPath,
        OPENAI_API_KEY: "test-key",
        PATH: `${directory}:/usr/bin:/bin`,
      },
      stdin: privateText,
    });

    expect(await readFile(jqInputPath, "utf8")).toBe(privateText);
    expect(await readFile(jqArgsPath, "utf8")).not.toContain(privateText);
    expect(await readFile(curlArgsPath, "utf8")).not.toContain(privateText);
  });
});
