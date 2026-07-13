#!/usr/bin/env python3
"""Emit JSON wake events from openWakeWord microphone predictions."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
import time
from typing import Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="hey jarvis")
    parser.add_argument("--threshold", default=0.5, type=float)
    parser.add_argument("--cooldown-ms", default=1500, type=int)
    parser.add_argument("--frame-ms", default=80, type=int)
    parser.add_argument(
        "--rec-command",
        default="rec -q -r 16000 -c 1 -b 16 -e signed-integer -t raw -",
    )
    parser.add_argument("--startup-check", action="store_true")
    return parser.parse_args()


def audio_frames(rec_command: str, frame_ms: int) -> Iterable[bytes]:
    frame_bytes = int(16000 * 2 * (frame_ms / 1000))
    process = subprocess.Popen(
        shlex.split(rec_command),
        stdout=subprocess.PIPE,
        stderr=None,
    )

    if process.stdout is None:
        raise RuntimeError("rec command did not provide stdout")

    try:
        while True:
            frame = process.stdout.read(frame_bytes)
            if not frame:
                raise RuntimeError("rec command stopped producing audio")

            yield frame
    finally:
        if process.poll() is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                process.wait()


def pcm16_samples(frame: bytes):
    if len(frame) % 2 != 0:
        raise ValueError("Audio frame must contain whole 16-bit PCM samples")

    import numpy as np

    return np.frombuffer(frame, dtype=np.int16)


def prediction_score(predictions: dict[str, float], model_key: str) -> float:
    if model_key in predictions:
        return float(predictions[model_key])

    if len(predictions) == 1:
        return float(next(iter(predictions.values())))

    versioned_model_key = f"{model_key}_"
    for key, score in predictions.items():
        if key.startswith(versioned_model_key):
            return float(score)

    return 0.0


def main() -> int:
    args = parse_args()

    import openwakeword
    from openwakeword.model import Model

    model_key = args.model.replace(" ", "_")
    model_config = openwakeword.models.get(model_key)
    if not model_config:
        supported_models = ", ".join(sorted(openwakeword.models.keys()))
        raise ValueError(
            f'Unknown openWakeWord model "{args.model}". '
            f"Supported models: {supported_models}"
        )

    model = Model(wakeword_model_paths=[model_config["model_path"]])
    if args.startup_check:
        return 0

    cooldown_seconds = args.cooldown_ms / 1000
    last_activation = 0.0

    for frame in audio_frames(args.rec_command, args.frame_ms):
        predictions = model.predict(pcm16_samples(frame))
        score = prediction_score(predictions, model_key)
        now = time.monotonic()

        if score >= args.threshold and now - last_activation >= cooldown_seconds:
            last_activation = now
            print(
                json.dumps(
                    {
                        "type": "wake",
                        "phrase": args.model,
                        "score": score,
                    }
                ),
                flush=True,
            )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        raise SystemExit(1)
