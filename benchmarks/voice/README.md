# Local Voice Benchmark

`artifacts.json` is the reviewed allowlist for third-party benchmark inputs. It
records exact upstream revisions, HTTPS provenance, byte counts, SHA-256
digests, licenses, and applicable CPU architectures. Model weights and engine
packages are never committed to this repository.

Repository tooling does not implicitly download, update, install, extract,
import, or execute these artifacts. An operator may explicitly acquire reviewed
files into the ignored private cache and verify them without network access:

```bash
npm run benchmark:voice:verify-artifacts -- \
  --manifest benchmarks/voice/artifacts.json \
  --cache .voice-benchmark/artifacts \
  --architecture x64
```

Use `arm64` on the Raspberry Pi. Verification streams each applicable file,
checks both its byte count and SHA-256 digest, and fails closed on missing,
mismatched, cooling-off, malformed, or empty architecture selections. The
manifest enforces a minimum 30-day cooling-off period. Models and engines are
accepted only from their official `github.com` or `huggingface.co` projects.
Exact Python runtime dependencies may additionally use immutable
`files.pythonhosted.org` wheel URLs recorded by official PyPI release metadata;
that exception never applies to model or engine payloads. A matching checksum
proves identity, not safety; artifact review and execution isolation remain
operator responsibilities.

Executable and model artifacts require an upstream-published SHA-256 and byte
count. Piper's small, human-readable JSON companion is pinned to the same
immutable voice revision, inspected as data, and locked to the SHA-256 observed
during its reviewed acquisition. The whisper.cpp engine remains a build from
the signed v1.8.6 source commit rather than an upstream package that is not
available for Linux.

Python installation uses only the allowlisted wheel files with dependency
resolution and indexes disabled (`--no-index --no-deps`) inside a new private
virtual environment. Transitive dependencies must be explicit manifest entries;
the package manager is never allowed to choose or fetch them.

Before extraction or installation, archives must be checked for absolute paths,
parent traversal, hard links, and symbolic links. Extraction goes to a new
private directory and must not overwrite an existing installation. Engines run
offline with no credentials, a minimal environment, and only the filesystem
access needed for benchmark inputs and outputs. There are no implicit upgrades:
every version change requires a new review, cooling-off period, manifest update,
and checksum verification.

The fixed candidate matrix is:

| Operation | Engine                                                          | Model                                | Current preparation state                           |
| --------- | --------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| STT       | whisper.cpp v1.8.6 (`23ee03506a91ac3d3f0071b40e66a430eebdfa1d`) | `base.en`                            | Model allowlisted; reviewed source build required   |
| STT       | whisper.cpp v1.8.6 (`23ee03506a91ac3d3f0071b40e66a430eebdfa1d`) | `small.en`                           | Model allowlisted; reviewed source build required   |
| STT       | sherpa-onnx v1.13.2                                             | streaming Zipformer English 20M int8 | Engine and model verified                           |
| TTS       | Piper v1.4.2                                                    | `en_GB-alba-medium`                  | Engine, model, and inspected configuration verified |
| TTS       | sherpa-onnx v1.13.2                                             | `vits-piper-en_US-amy-low`           | Engine and model verified                           |

The reference set remains LibriSpeech `dev-clean` under CC BY 4.0, but upstream
publishes MD5 rather than SHA-256 for that archive. It is therefore not yet
allowlisted. Personal recordings and reference clips are separate from this
third-party artifact cache and remain governed by their corpus manifests.

The benchmark is resumable in bounded candidate chunks:

```bash
npm run benchmark:voice:run -- \
  --candidate whisper-base-en --start 0 --count 4 \
  --output .voice-benchmark/results/desktop-wsl2/chunks/whisper-base-en-0.json
npm run benchmark:voice:aggregate
npm run benchmark:voice:report
```

The 2026-07-17 WSL2 run produced an explicit desktop-only partial no-go; see
`results/desktop-wsl2-report.md`. The report is generated from validated raw
results and calls out every unavailable acceptance measurement. No Raspberry Pi
measurements, independent proof of network isolation, or production adapter
selection are claimed.

## Milestone 19 responsiveness evidence

Copy `responsiveness-template.json` to a private measurement file. Its three
example rows are synthetic and cannot pass device acceptance. Replace them with
actual measurements and set `evidence` to `device` only for a measured run. Record
the host, OS, microphone, headphones/speakers, selected providers, local/remote
processing, and input isolation. Keep transcripts, request bodies, credentials,
and recording contents out of this content-free report format.

```bash
npm run --silent benchmark:voice:responsiveness -- --input /tmp/my-responsiveness.json
```

The command reads at most one MiB, validates every field, rejects duplicate sample
IDs, and prints a JSON report. Exit 0 means the supplied device measurements meet
these gates, exit 2 means failed or incomplete evidence, and exit 1 means invalid
input or a report failure. It does not record audio, invoke providers, or certify
how measurements were collected.

Collect at least thirty samples each for simple commands, spoken stop, and
replacement barge-in per host/audio setup. Each group must include quiet,
background-noise, and back-to-back scenarios. Enable concurrent capture only with
the documented `voice.bargeIn` setting and actual headphones or echo cancellation.
Count incorrect responses, cleanup failures, false wakes, and duplicate actions;
do not drop failed trials from the file. These failures prevent a passing report.

Use synchronized audio/video or equivalent measurement to identify actual user
utterance end, visible wake feedback, first useful answer audio, and assistant
silence. Filler is not useful answer audio. Correlate the runtime's recognized
interruption timestamp with that recording; report acoustic user-stop-to-silence
separately so recognition delay remains visible. For replacement samples, the
stop fields measure the interruption caused by that replacement request.

| Measurement                                     | Unchanged acceptance target       |
| ----------------------------------------------- | --------------------------------- |
| Detected wake to visible local feedback         | Every measured value under 150 ms |
| Recognized interruption to acoustic silence     | Every measured value under 300 ms |
| User utterance end to first useful answer audio | p95 under 1500 ms                 |

The report includes nearest-rank p50/p95, maximum, and sample counts. Record first
transcript timing even when it precedes utterance end and is negative. Omit an
unmeasured metric; never fill it with zero. Optional `softwareStopToCleanupMs`
comes from runtime events and cannot replace acoustic silence measurements.
Missing required acoustic measurements or scenario coverage remain incomplete.
No physical acceptance run has been collected for Milestone 19 yet.

A device harness can inject `timing: { nowMs, onEvent }` into
`runDesktopVoiceServiceRuntime` (or the shared configured service). `nowMs` is an
optional monotonic clock; `onEvent` receives a frozen event name, `monotonicMs`,
`startedAtMs`, and `offsetMs` immediately at each first software event, including
`stop_recognized`, `barge_in_recognized`, and `output_stopped`. Correlate that clock
with the external recording rather than treating output submission as acoustic
onset. Observer failures cannot interrupt an assistant action, and the ordinary
event snapshot remains available even if the observer fails. Measurement is
disabled by default and no observer receives transcript or provider content.
