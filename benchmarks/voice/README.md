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
manifest enforces a minimum 30-day cooling-off period and accepts artifact URLs
only from `github.com` and `huggingface.co`. A matching checksum proves identity,
not safety; artifact review and execution isolation remain operator
responsibilities.

Executable and model artifacts require an upstream-published SHA-256 and byte
count. Piper's small, human-readable JSON companion is pinned to the same
immutable voice revision, inspected as data, and locked to the SHA-256 observed
during its reviewed acquisition. The whisper.cpp engine remains a build from
the signed v1.8.6 source commit rather than an upstream package that is not
available for Linux.

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

The reference set remains LibriSpeech `dev-clean` under CC BY 4.0, but upstream
publishes MD5 rather than SHA-256 for that archive. It is therefore not yet
allowlisted. Personal recordings and reference clips are separate from this
third-party artifact cache and remain governed by their corpus manifests.
