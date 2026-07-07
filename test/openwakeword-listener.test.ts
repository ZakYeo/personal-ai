import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("openwakeword-listener.py", () => {
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

class Model:
    def __init__(self, wakeword_model_paths=[]):
        created_model_paths.extend(wakeword_model_paths)

    def predict(self, frame):
        return {"hey_jarvis": 0.9}

model_module.Model = Model
sys.modules["openwakeword"] = openwakeword
sys.modules["openwakeword.model"] = model_module

spec = importlib.util.spec_from_file_location("openwakeword_listener", listener_path)
listener = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listener)

def fake_audio_frames(rec_command, frame_ms):
    yield b"\0" * 2560

listener.audio_frames = fake_audio_frames
sys.argv = ["openwakeword-listener.py", "--model", "hey jarvis"]

stdout = io.StringIO()
with contextlib.redirect_stdout(stdout):
    status = listener.main()

assert status == 0
assert created_model_paths == ["/models/hey_jarvis_v0.1.onnx"]
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
