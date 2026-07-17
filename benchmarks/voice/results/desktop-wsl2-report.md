# Desktop WSL2 Local Voice Benchmark

Run date: 2026-07-17. Device: 13th Gen Intel Core i9-13950HX, x64,
Linux 6.18.33.2 under WSL2, with approximately 30.6 GB available memory.

## Outcome

No STT or TTS candidate passed the committed desktop gates. No provisional
provider is selected. Raspberry Pi measurements were not run because no Pi was
available, and nothing in these results establishes Pi fitness.

| Candidate                 |                               Correctness |             P95 latency | P95 RTF | Peak RSS | Outcome                     |
| ------------------------- | ----------------------------------------: | ----------------------: | ------: | -------: | --------------------------- |
| whisper.cpp `base.en`     |      10/22 exact; 22.0% mean personal WER |          1,180 ms final |   0.630 |   297 MB | No-go: accuracy and latency |
| whisper.cpp `small.en`    |      13/22 exact; 11.2% mean personal WER |          4,130 ms final |   2.205 |   787 MB | No-go: accuracy and latency |
| sherpa Zipformer 20M int8 |       0/22 exact; 49.4% mean personal WER |            107 ms final |   0.325 |    97 MB | No-go: accuracy and RTF     |
| Piper Alba medium         | Listening not required after hard failure | 1,140 ms first playable |   0.348 |   240 MB | No-go: latency and RTF      |
| sherpa Amy low            | Listening not required after hard failure | 1,540 ms first playable |   0.432 |   176 MB | No-go: latency and RTF      |

All candidates ran without network access, with minimal environments, one
excluded warm-up, and three isolated measured repetitions per sample. WSL2 did
not expose meaningful device thermal-throttling telemetry, so that field is
recorded as unavailable. Batch TTS first-audio is the time until the generated
WAV became playable; neither tested command exposed streaming audio.

The LibriSpeech reference archive remains unavailable under the repository's
SHA-256 provenance policy. This does not change the no-go: every STT candidate
already failed the personal-command exact-match gate, and at least one further
hard performance gate.

Raw measurements are committed in `desktop-wsl2.json`. Generated WAVs,
per-process timing files, engine installations, and model files remain in the
ignored private benchmark directory.
