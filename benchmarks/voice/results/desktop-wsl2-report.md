# Desktop WSL2 Local Voice Benchmark

Run date: 2026-07-17. Device: 13th Gen Intel(R) Core(TM) i9-13950HX, x64, Linux linux 6.18.33.2-microsoft-standard-WSL2.

## Outcome

This is a desktop-only, partial acceptance run. No candidate is eligible for selection: every candidate has a measured hard failure or execution failure, and the run did not independently prove network isolation, installed size, shutdown latency, thermal state, or Raspberry Pi fitness. Raspberry Pi measurements remain deferred because no Pi was available.

| Candidate                    |                          Correctness | P95 measured latency | P95 RTF | Peak RSS | Outcome                                |
| ---------------------------- | -----------------------------------: | -------------------: | ------: | -------: | -------------------------------------- |
| piper-alba-medium            |   Ratings skipped after hard failure |             1,130 ms |   0.343 |   241 MB | No-go: batch-ready latency, RTF        |
| sherpa-amy-low               |   Ratings skipped after hard failure |             1,470 ms |   0.428 |   176 MB | No-go: batch-ready latency, RTF        |
| sherpa-zipformer-en-20m-int8 |  0/22 exact; 60.4% mean personal WER |               114 ms |   0.336 |    97 MB | No-go: accuracy, 12 execution failures |
| whisper-base-en              | 10/22 exact; 22.0% mean personal WER |             1,240 ms |   0.644 |   297 MB | No-go: accuracy, latency, RTF          |
| whisper-small-en             | 13/22 exact; 11.2% mean personal WER |             4,360 ms |   2.228 |   786 MB | No-go: accuracy, latency, RTF          |

Each sample used one excluded warm-up and three measured repetitions. STT latency is offline process completion after reported model startup, not post-speech streaming finalization. TTS latency is conservative batch-ready WAV completion, not first streaming audio. The minimal child environment is recorded, but it is not evidence of network isolation. Shutdown was not measured and is therefore unavailable rather than zero. WSL2 thermal telemetry, installed-size accounting, and a provenance-compliant LibriSpeech reference corpus were also unavailable.

Subjective TTS ratings were not collected because both TTS candidates failed the measured hard performance gate. Raw measurements are committed in `desktop-wsl2.json`; generated audio, timing files, engines, and models remain private ignored artifacts.
