# Local Voice Benchmark

`artifacts.json` is the reviewed allowlist for third-party benchmark inputs. It
records exact upstream revisions, HTTPS provenance, byte counts, SHA-256
digests, licenses, and applicable CPU architectures. Model weights and engine
packages are never committed to this repository.

The repository does not download, install, extract, import, or execute these
artifacts. An operator may place separately reviewed files in a private cache
and verify them without network access:

```bash
npm run benchmark:voice:verify-artifacts -- \
  --manifest benchmarks/voice/artifacts.json \
  --cache .voice-benchmark/artifacts \
  --architecture x64
```

Use `arm64` on the Raspberry Pi. Verification streams each applicable file,
checks both its byte count and SHA-256 digest, and fails closed on missing,
mismatched, malformed, or empty architecture selections. A matching checksum
proves identity, not safety; artifact review and execution isolation remain
operator responsibilities.

The allowlist intentionally contains only files with an independently
published SHA-256. The Piper voice JSON and sherpa Vocos file did not expose a
published SHA-256 through their upstream metadata, so they are not allowlisted
and their candidates cannot run yet. No file was downloaded to fill that gap.
The whisper.cpp engine remains a pinned source build rather than a binary that
has not been reviewed. These omissions must produce a no-go result unless an
operator later supplies and independently establishes the missing provenance.

The fixed candidate matrix is:

| Operation | Engine                                                          | Model                                | Current preparation state                                        |
| --------- | --------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| STT       | whisper.cpp v1.8.6 (`23ee03506a91ac3d3f0071b40e66a430eebdfa1d`) | `base.en`                            | Model allowlisted; reviewed source build required                |
| STT       | whisper.cpp v1.8.6 (`23ee03506a91ac3d3f0071b40e66a430eebdfa1d`) | `small.en`                           | Model allowlisted; reviewed source build required                |
| STT       | sherpa-onnx v1.13.4                                             | streaming Zipformer English 20M int8 | Engine and model allowlisted                                     |
| TTS       | Piper v1.4.2                                                    | `en_GB-alba-medium`                  | Engine and model allowlisted; voice JSON checksum unresolved     |
| TTS       | sherpa-onnx v1.13.4                                             | Matcha LJSpeech with Vocos           | Engine and acoustic model allowlisted; Vocos checksum unresolved |

The reference set remains LibriSpeech `dev-clean` under CC BY 4.0, but upstream
publishes MD5 rather than SHA-256 for that archive. It is therefore not yet
allowlisted. Personal recordings and reference clips are separate from this
third-party artifact cache and remain governed by their corpus manifests.
