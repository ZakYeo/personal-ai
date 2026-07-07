# Voice Audio Fixtures

These files are committed smoke-test fixtures for the desktop voice runtime.

- `hey-jarvis.wav` says: `Hey Jarvis`
- `list-my-alarms.wav` says: `List my alarms`
- `list-my-alarms-24khz-mono-s16le.pcm` says: `List my alarms`

They are intentionally stored in the repository so the desktop voice smoke test
does not depend on live text-to-speech generation before it can reproduce the
voice runtime path. The smoke test may still use live speech-to-text APIs.

The raw PCM fixture is mono signed 16-bit little-endian audio at 24 kHz. It is
the command-audio stream format expected by the OpenAI realtime transcription
adapter.
