import { execFile } from "node:child_process";
import { promisify } from "node:util";

// cspell:ignore CUDA cuda
const execFileAsync = promisify(execFile);

describe("openwakeword-listener.py", () => {
  // cspell:ignore kwargs Popen popen
  it("selects the explicit PulseAudio source on WSLg and suppresses only the unavailable CUDA provider warning", async () => {
    const harness = String.raw`
import importlib.util
import pathlib
import warnings

repo_root = pathlib.Path.cwd()
listener_path = repo_root / "scripts" / "openwakeword-listener.py"
spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

assert listener.select_rec_command(None).startswith("rec -q ")
assert listener.select_rec_command("unix:/mnt/wslg/PulseServer").startswith(
    "sox -q -t pulseaudio default "
)

listener.suppress_unavailable_cuda_provider_warning(["CPUExecutionProvider"])
with warnings.catch_warnings(record=True) as caught:
    warnings.warn(
        "Specified provider 'CUDAExecutionProvider' is not in available provider names."
        "Available providers: 'AzureExecutionProvider, CPUExecutionProvider'",
        UserWarning,
    )
assert caught == []
`;

    await expect(
      execFileAsync("python3", ["-B", "-c", harness], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("drains recorder stderr and reaps a recorder that ignores termination", async () => {
    const harness = String.raw`
import importlib.util
import pathlib
import subprocess

repo_root = pathlib.Path.cwd()
listener_path = repo_root / "scripts" / "openwakeword-listener.py"
spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

events = []

class FakeStdout:
    def read(self, _size):
        return b"\1\0"

class FakeProcess:
    stdout = FakeStdout()

    def poll(self):
        return None

    def terminate(self):
        events.append("terminate")

    def wait(self, timeout=None):
        events.append(("wait", timeout))
        if events.count(("wait", 1.0)) == 1:
            raise subprocess.TimeoutExpired("rec", timeout)
        return 0

    def kill(self):
        events.append("kill")

def fake_popen(*args, **kwargs):
    assert kwargs["stdout"] is subprocess.PIPE
    assert kwargs["stderr"] is None
    return FakeProcess()

listener.subprocess.Popen = fake_popen
frames = listener.audio_frames("fake-rec", 80)
assert next(frames) == b"\1\0"
frames.close()
assert events == ["terminate", ("wait", 1.0), "kill", ("wait", 1.0)]
`;

    await expect(
      execFileAsync("python3", ["-B", "-c", harness], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("tolerates the recorder exiting between the poll and terminate calls", async () => {
    const harness = String.raw`
import importlib.util
import pathlib
import subprocess

repo_root = pathlib.Path.cwd()
listener_path = repo_root / "scripts" / "openwakeword-listener.py"
spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

events = []

class FakeStdout:
    def read(self, _size):
        return b"\1\0"

class FakeProcess:
    stdout = FakeStdout()

    def poll(self):
        return None

    def terminate(self):
        events.append("terminate")
        raise ProcessLookupError()

    def wait(self, timeout=None):
        events.append(("wait", timeout))
        return 0

    def kill(self):
        raise AssertionError("an exited recorder must not be killed")

def fake_popen(*args, **kwargs):
    return FakeProcess()

listener.subprocess.Popen = fake_popen
frames = listener.audio_frames("fake-rec", 80)
assert next(frames) == b"\1\0"
frames.close()
assert events == ["terminate", ("wait", 1.0)]
`;

    await expect(
      execFileAsync("python3", ["-B", "-c", harness], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("tolerates the recorder exiting between the timed wait and kill calls", async () => {
    const harness = String.raw`
import importlib.util
import pathlib
import subprocess

repo_root = pathlib.Path.cwd()
listener_path = repo_root / "scripts" / "openwakeword-listener.py"
spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

events = []

class FakeStdout:
    def read(self, _size):
        return b"\1\0"

class FakeProcess:
    stdout = FakeStdout()

    def poll(self):
        return None

    def terminate(self):
        events.append("terminate")

    def wait(self, timeout=None):
        events.append(("wait", timeout))
        if events.count(("wait", 1.0)) == 1:
            raise subprocess.TimeoutExpired("rec", timeout)
        return 0

    def kill(self):
        events.append("kill")
        raise ProcessLookupError()

def fake_popen(*args, **kwargs):
    return FakeProcess()

listener.subprocess.Popen = fake_popen
frames = listener.audio_frames("fake-rec", 80)
assert next(frames) == b"\1\0"
frames.close()
assert events == ["terminate", ("wait", 1.0), "kill", ("wait", 1.0)]
`;

    await expect(
      execFileAsync("python3", ["-B", "-c", harness], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("bounds the post-kill reap and preserves a primary recorder failure", async () => {
    const harness = String.raw`
import contextlib
import importlib.util
import io
import pathlib
import subprocess

repo_root = pathlib.Path.cwd()
listener_path = repo_root / "scripts" / "openwakeword-listener.py"
spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

events = []

class FakeStdout:
    def read(self, _size):
        raise ValueError("primary recorder read failure")

class FakeProcess:
    stdout = FakeStdout()

    def poll(self):
        return None

    def terminate(self):
        events.append("terminate")

    def wait(self, timeout=None):
        events.append(("wait", timeout))
        raise subprocess.TimeoutExpired("rec", timeout)

    def kill(self):
        events.append("kill")

listener.subprocess.Popen = lambda *args, **kwargs: FakeProcess()
stderr = io.StringIO()
try:
    with contextlib.redirect_stderr(stderr):
        next(listener.audio_frames("fake-rec", 80))
except ValueError as error:
    assert str(error) == "primary recorder read failure"
else:
    raise AssertionError("the primary recorder failure must be preserved")

assert events == ["terminate", ("wait", 1.0), "kill", ("wait", 1.0)]
assert "did not exit after SIGKILL" in stderr.getvalue()
`;

    await expect(
      execFileAsync("python3", ["-B", "-c", harness], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("loads the normalized pretrained model path and emits the configured wake phrase", async () => {
    const harness = String.raw`
import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import types

repo_root = pathlib.Path.cwd()
listener_path = repo_root / "scripts" / "openwakeword-listener.py"

openwakeword = types.ModuleType("openwakeword")
openwakeword.models = {
    "hey_jarvis": {
        "model_path": "/models/hey_jarvis_v0.1.onnx",
    },
}

model_module = types.ModuleType("openwakeword.model")
created_model_paths = []
converted_frames = []

numpy = types.ModuleType("numpy")
numpy.int16 = "int16"

def frombuffer(frame, dtype):
    converted = {"frame": frame, "dtype": dtype}
    converted_frames.append(converted)
    return converted

numpy.frombuffer = frombuffer
sys.modules["numpy"] = numpy

class Model:
    def __init__(self, wakeword_model_paths=[]):
        created_model_paths.extend(wakeword_model_paths)

    def predict(self, frame):
        assert frame == {"frame": b"\1\0\2\0", "dtype": "int16"}
        return {"hey_jarvis_v0.1": 0.9}

model_module.Model = Model
onnxruntime = types.ModuleType("onnxruntime")
onnxruntime.get_available_providers = lambda: ["CPUExecutionProvider"]
sys.modules["onnxruntime"] = onnxruntime
sys.modules["openwakeword"] = openwakeword
sys.modules["openwakeword.model"] = model_module

spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

def fake_audio_frames(rec_command, frame_ms):
    yield b"\1\0\2\0"

listener.audio_frames = fake_audio_frames
sys.argv = ["openwakeword-listener.py", "--model", "hey jarvis"]

stdout = io.StringIO()
with contextlib.redirect_stdout(stdout):
    status = listener.main()

assert status == 0
assert created_model_paths == ["/models/hey_jarvis_v0.1.onnx"]
assert converted_frames == [{"frame": b"\1\0\2\0", "dtype": "int16"}]
event = json.loads(stdout.getvalue())
assert event == {"type": "wake", "phrase": "hey jarvis", "score": 0.9}
`;

    await expect(
      execFileAsync("python3", ["-B", "-c", harness], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({
      stderr: "",
    });
  });
});
