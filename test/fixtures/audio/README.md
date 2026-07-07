# Voice Audio Fixtures

These files are committed smoke-test fixtures for the desktop voice runtime.

- `hey-jarvis.wav` says: `Hey Jarvis`
- `list-my-alarms.wav` says: `List my alarms`

They are intentionally stored in the repository so the desktop voice smoke test
does not depend on live text-to-speech generation before it can reproduce the
voice runtime path. The smoke test may still use live speech-to-text APIs.
