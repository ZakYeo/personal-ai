const { main } = await import("../dist/runtimes/cli/main.js");

const stdout = [];
const stderr = [];

const exitCode = await main(
  [
    "ask",
    "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
  ],
  {
    env: {},
    stdout: {
      write: (chunk) => {
        stdout.push(String(chunk));
        return true;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr.push(String(chunk));
        return true;
      },
    },
  },
);

const expectedOutput = "The upcoming wedding is on 2026-09-12.\n";
const actualOutput = stdout.join("");

if (exitCode !== 0 || actualOutput !== expectedOutput || stderr.length > 0) {
  throw new Error(
    [
      "Unexpected personal-ai built bin behavior.",
      `Exit code: ${exitCode}`,
      `Expected stdout: ${expectedOutput}`,
      `Actual stdout: ${actualOutput}`,
      `Actual stderr: ${stderr.join("")}`,
    ].join("\n"),
  );
}
