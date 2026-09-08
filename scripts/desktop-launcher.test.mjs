import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { spawn } from "node:child_process";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { launchDesktop } from "./desktop-launcher.mjs";
import { checkDesktopDependencies } from "./desktop-dependencies.mjs";

function harness() {
  const signals = new EventEmitter();
  const children = [];
  const stopped = [];
  const messages = [];
  return {
    children,
    stopped,
    signals,
    messages,
    options: {
      env: { PERSONAL_AI_PRESENTATION_PORT: "43119" },
      signals,
      spawnChild: (name, env) => {
        const child = new EventEmitter();
        children.push({ name, env, child });
        return child;
      },
      stopChild: (child, signal) => {
        stopped.push(signal);
        child.emit("exit", 0, signal);
      },
      write: (message) => messages.push(message),
      shutdownMs: 10,
    },
  };
}

test("starts both with a fresh shared token without changing the parent environment", async () => {
  const h = harness();
  const done = launchDesktop(h.options);
  assert.deepEqual(
    h.children.map(({ name }) => name),
    ["start", "desktop:tauri:dev"],
  );
  const token = h.children[0].env.PERSONAL_AI_PRESENTATION_TOKEN;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(h.children[1].env.PERSONAL_AI_PRESENTATION_TOKEN, token);
  assert.equal(h.children[1].env.PERSONAL_AI_PRESENTATION_PORT, "43119");
  assert.equal(h.options.env.PERSONAL_AI_PRESENTATION_TOKEN, undefined);
  h.signals.emit("SIGINT");
  assert.equal(await done, 130);
  assert.deepEqual(h.stopped, ["SIGTERM", "SIGTERM", "SIGKILL", "SIGKILL"]);
  assert.equal(h.signals.listenerCount("SIGINT"), 0);
  assert.ok(!h.messages.join("").includes(token));
});

test("a child failure stops its companion and preserves the exit code", async () => {
  const h = harness();
  const done = launchDesktop(h.options);
  h.children[1].child.emit("exit", 7, null);
  assert.equal(await done, 7);
  assert.ok(h.stopped.length > 0);
});

test("a spawn error stops the already started service", async () => {
  const h = harness();
  const done = launchDesktop(h.options);
  h.children[1].child.emit("error", new Error("spawn failed"));
  assert.equal(await done, 1);
  assert.ok(h.stopped.length > 0);
});

test("shutdown escalates when a child ignores termination", async () => {
  const h = harness();
  h.options.stopChild = (_child, signal) => h.stopped.push(signal);
  const done = launchDesktop(h.options);
  h.signals.emit("SIGTERM");
  assert.equal(await done, 143);
  assert.deepEqual(h.stopped, ["SIGTERM", "SIGTERM", "SIGKILL", "SIGKILL"]);
});

test("missing Linux libraries give an actionable prerequisite error", () => {
  assert.throws(
    () => checkDesktopDependencies("linux", () => ({ status: 1 })),
    /sudo apt install.*libwebkit2gtk-4.1-dev/s,
  );
  assert.doesNotThrow(() =>
    checkDesktopDependencies("linux", () => ({ status: 0 })),
  );
  assert.doesNotThrow(() =>
    checkDesktopDependencies("win32", () => {
      throw new Error("must not probe");
    }),
  );
});

test("a synchronous spawn failure cleans up the first child", async () => {
  const h = harness();
  const spawn = h.options.spawnChild;
  h.options.spawnChild = (name, env) => {
    if (name === "desktop:tauri:dev") throw new Error("spawn failed");
    return spawn(name, env);
  };
  assert.equal(await launchDesktop(h.options), 1);
  assert.equal(h.children.length, 1);
  assert.deepEqual(h.stopped, ["SIGTERM", "SIGKILL"]);
});

test("normal UI exit stops the service and each session gets a new token", async () => {
  const tokens = [];
  for (let index = 0; index < 2; index++) {
    const h = harness();
    const done = launchDesktop(h.options);
    tokens.push(h.children[0].env.PERSONAL_AI_PRESENTATION_TOKEN);
    h.children[1].child.emit("exit", 0, null);
    assert.equal(await done, 0);
    assert.deepEqual(h.stopped, ["SIGTERM", "SIGTERM", "SIGKILL", "SIGKILL"]);
  }
  assert.notEqual(tokens[0], tokens[1]);
});

test(
  "real child processes receive the same token and stop together",
  { timeout: 5000 },
  async () => {
    const signals = new EventEmitter();
    const children = [];
    const ready = [];
    const done = launchDesktop({
      env: {},
      signals,
      write: () => {},
      shutdownMs: 100,
      spawnChild: (_name, env) => {
        const child = spawn(
          process.execPath,
          [
            "--eval",
            "process.send(process.env.PERSONAL_AI_PRESENTATION_TOKEN); setInterval(() => {}, 1000);",
          ],
          {
            env,
            stdio: ["ignore", "ignore", "ignore", "ipc"],
          },
        );
        children.push(child);
        ready.push(once(child, "message"));
        return child;
      },
      stopChild: (child, signal) => child.kill(signal),
    });
    try {
      const [[serviceToken], [uiToken]] = await Promise.all(ready);
      assert.match(serviceToken, /^[a-f0-9]{64}$/);
      assert.equal(uiToken, serviceToken);
      children[1].kill("SIGTERM");
      assert.equal(await done, 1);
      assert.ok(children.every((child) => child.signalCode === "SIGTERM"));
    } finally {
      signals.emit("SIGTERM");
      for (const child of children) child.kill("SIGKILL");
      await done;
    }
  },
);

test("npm parent exit does not cut short the descendants' cleanup grace", async () => {
  const h = harness();
  h.options.shutdownMs = 50;
  const done = launchDesktop(h.options);
  h.signals.emit("SIGINT");
  await setImmediate();
  assert.deepEqual(h.stopped, ["SIGTERM", "SIGTERM"]);
  assert.equal(await done, 130);
});

test("falls back to system pkg-config and returns its selection for Cargo", () => {
  const env = { PATH: "/custom/bin:/usr/bin" };
  const selected = checkDesktopDependencies(
    "linux",
    (command, _args, options) => {
      assert.equal(options.env.PATH, env.PATH);
      return { status: command === "/usr/bin/pkg-config" ? 0 : 1 };
    },
    env,
  );
  assert.equal(selected.PKG_CONFIG, "/usr/bin/pkg-config");
  assert.equal(env.PKG_CONFIG, undefined);
});

test("respects an explicit pkg-config override without silently replacing it", () => {
  const commands = [];
  assert.throws(
    () =>
      checkDesktopDependencies(
        "linux",
        (command) => {
          commands.push(command);
          return { status: 1 };
        },
        { PKG_CONFIG: "/custom/pkg-config" },
      ),
    /\/custom\/pkg-config/,
  );
  assert.ok(commands.every((command) => command === "/custom/pkg-config"));
});
