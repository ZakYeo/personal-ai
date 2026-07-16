# Raspberry Pi Operations

This guide deploys the built `pi-service` runtime as a long-running systemd
service. The service runs as the locked-down `personal-ai` account, reads
operator-owned configuration from `/etc/personal-ai`, runs application files
from `/opt/personal-ai`, and keeps durable alarm state under
`/var/lib/personal-ai`.

The committed unit and config are examples. Review audio device names, commands,
and provider choices on the target Pi before enabling the service.
The command-based OpenAI STT/TTS fallbacks call
`scripts/openai-audio-command.sh`; it reads `OPENAI_API_KEY` from the service
environment and supplies the authorization header to curl through a private file
descriptor so the credential is not exposed in curl's process arguments.
Text-to-speech content is likewise sent over stdin rather than appearing in the
helper's process arguments.

The configured Pi voice service also runs the neutral alarm scheduler against
the exact persistent store used by alarm commands. Due alarms are spoken through
the configured synthesis and audio-output adapters, repeat once after 60 seconds
when unacknowledged, and stop after acknowledgement or dismissal. After restart,
alarms overdue by no more than 15 minutes are delivered; older untouched alarms
are recorded as missed. Delivery is claimed durably before audio output so a
restart does not replay a completed final attempt.
The service also removes terminal alarm history older than 30 days at startup
and daily. Cleanup uses the same serialized persistent store, retains active
alarms, and turns failures into the same orderly non-zero service exit used by
other fatal background tasks.

## Device prerequisites

Install Node.js 22 or later, npm 10 or later, Python virtual-environment support,
SoX, curl, and jq using the Raspberry Pi OS package and Node installation method
you trust. Confirm these commands before continuing:

```bash
/usr/bin/node --version
npm --version
python3 --version
rec --version
play --version
curl --version
jq --version
```

The committed unit invokes `/usr/bin/node`. If the trusted system installation
puts Node elsewhere, update `ExecStart` in the local unit before installing it
and keep the final absolute path under static review.

Create a non-login service account. The systemd unit adds the process to the
`audio` supplementary group while it runs.

```bash
sudo useradd --system --user-group --home-dir /var/lib/personal-ai --no-create-home --shell /usr/sbin/nologin personal-ai
```

## Build and install

From a clean checkout on the Pi, validate and build an immutable release before
atomically selecting it through the `/opt/personal-ai` symlink:

```bash
npm ci
npm run check
npm run build
release_id="$(git rev-parse --verify HEAD)"
release_dir="/opt/personal-ai-releases/$release_id"
sudo install -d -o root -g root -m 0755 /opt/personal-ai-releases
sudo test ! -e "$release_dir"
staging_dir="$(sudo mktemp -d "/opt/personal-ai-releases/.staging.$release_id.XXXXXX")"
trap 'if [ -n "$staging_dir" ]; then sudo rm -rf "$staging_dir"; fi' EXIT
sudo cp -a dist package.json package-lock.json scripts "$staging_dir/"
sudo npm ci --omit=dev --prefix "$staging_dir"
sudo "$staging_dir/scripts/setup-openwakeword-venv.sh"
sudo test -x "$staging_dir/.venv/bin/python"
sudo test -f "$staging_dir/dist/runtimes/cli/main.js"
sudo mv -T "$staging_dir" "$release_dir"
staging_dir=""
sudo ln -sfn "$release_dir" /opt/personal-ai.next
sudo mv -Tf /opt/personal-ai.next /opt/personal-ai
```

Install the operator-owned config and environment directories. The example uses
the persistent alarm path created by the unit's `StateDirectory=personal-ai`
setting.

```bash
sudo install -d -o root -g personal-ai -m 0750 /etc/personal-ai
sudo install -o root -g personal-ai -m 0640 config/pi-voice-openai.example.json /etc/personal-ai/config.json
sudo install -o root -g root -m 0644 deploy/systemd/personal-ai.service /etc/systemd/system/personal-ai.service
```

Create `/etc/personal-ai/environment` as root with mode `0640`, owned by
`root:personal-ai`. Put provider credentials there as plain systemd environment
assignments; never add that file to the repository. For example, the OpenAI
configuration requires an `OPENAI_API_KEY` assignment. The unit treats this
file as a required startup precondition so a missing credential file fails
visibly instead of entering an application restart loop.

```bash
sudo install -o root -g personal-ai -m 0640 /dev/null /etc/personal-ai/environment
sudoedit /etc/personal-ai/environment
sudoedit /etc/personal-ai/config.json
```

Check the final files and unit without starting audio capture:

```bash
sudo systemd-analyze verify /etc/systemd/system/personal-ai.service
sudo -u personal-ai test -r /etc/personal-ai/config.json
sudo -u personal-ai test -r /etc/personal-ai/environment
```

## Start and operate

Load, enable, and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now personal-ai.service
```

Inspect health and recent logs:

```bash
systemctl status personal-ai.service
journalctl -u personal-ai.service -n 100 --no-pager
journalctl -u personal-ai.service -f
```

The service writes human-facing progress to stdout and internal diagnostics to
stderr; systemd captures both in the journal. Provider credentials and raw
adapter output must not be logged. After changing config or environment values,
restart and inspect the journal:

```bash
sudo systemctl restart personal-ai.service
journalctl -u personal-ai.service -n 100 --no-pager
```

To stop or disable it:

```bash
sudo systemctl stop personal-ai.service
sudo systemctl disable personal-ai.service
```

## Upgrade and rollback

Keep `/etc/personal-ai` and `/var/lib/personal-ai` outside release replacement so
upgrades do not overwrite credentials, machine-specific config, or alarms. In
one administrative shell, record the current immutable release, build and
validate the checkout as above, assemble a new versioned release completely,
then atomically replace the stable symlink:

```bash
previous_release="$(readlink -f /opt/personal-ai)"
release_id="$(git rev-parse --verify HEAD)"
release_dir="/opt/personal-ai-releases/$release_id"
sudo test ! -e "$release_dir"
staging_dir="$(sudo mktemp -d "/opt/personal-ai-releases/.staging.$release_id.XXXXXX")"
trap 'if [ -n "$staging_dir" ]; then sudo rm -rf "$staging_dir"; fi' EXIT
sudo cp -a dist package.json package-lock.json scripts "$staging_dir/"
sudo npm ci --omit=dev --prefix "$staging_dir"
sudo "$staging_dir/scripts/setup-openwakeword-venv.sh"
sudo test -x "$staging_dir/.venv/bin/python"
sudo test -f "$staging_dir/dist/runtimes/cli/main.js"
sudo mv -T "$staging_dir" "$release_dir"
staging_dir=""
sudo systemctl stop personal-ai.service
sudo ln -sfn "$release_dir" /opt/personal-ai.next
sudo mv -Tf /opt/personal-ai.next /opt/personal-ai
sudo systemctl start personal-ai.service
systemctl status personal-ai.service
```

If startup validation or the hardware check fails, use the recorded absolute
`previous_release` from that same shell. Verify it still exists, then atomically
select it without touching config or state. Repeating this process never nests
one release directory inside another:

```bash
sudo systemctl stop personal-ai.service
sudo test -f "$previous_release/dist/runtimes/cli/main.js"
sudo ln -sfn "$previous_release" /opt/personal-ai.rollback
sudo mv -Tf /opt/personal-ai.rollback /opt/personal-ai
sudo systemctl start personal-ai.service
journalctl -u personal-ai.service -n 100 --no-pager
```

Remove old release directories only after the replacement has run successfully
for an operator-chosen observation period.

## Validation layers

`npm run check` validates the static unit, config parsing, runtime composition,
and deterministic service behavior without network or Pi hardware.

`npm run test:e2e:openai:pi` is an opt-in live-provider smoke. It uses live
OpenAI intent routing through Pi service composition, confirms an alarm,
advances it to its due time, delivers it through injected output adapters,
acknowledges it, checks durable lifecycle state, lists it, and verifies clean
service shutdown. It does not validate microphone, speaker, ALSA, SoX,
wake-word, or other audio hardware.

`npm run smoke:pi:qemu -- --config path/to/pi-config.json --image
path/to/raspios.img --kernel path/to/kernel8.img --dtb path/to/pi.dtb` prints a
QEMU command using operator-supplied artifacts. Add `--run` only when you intend
to spawn QEMU. QEMU validates boot and command wiring; it does not validate real
Pi audio hardware or provider credentials.

The final device check is intentionally manual: confirm wake activation,
capture, transcription, confirmation follow-up, speech output, alarm persistence
across `systemctl restart`, delivery of a due alarm, its one-minute repeat when
unacknowledged, acknowledgement or dismissal, and graceful shutdown on the
actual Pi.

Future local STT and TTS providers are gated by Spike 12 rather than added to
this deployment path speculatively. That benchmark must record the exact Pi
model and operating system, latency, command accuracy or intelligibility,
memory, CPU, model size, licenses, checksums, startup, and shutdown behavior.
On the Pi with the deployment microphone selected, run
`npm run benchmark:voice:capture -- --speaker primary` to capture only missing
core personal corpus phrases; add `--all` to include missing extended phrases.
Review every playback carefully: consent promotes the accepted audio into
permanent repository history. Existing stable phrase IDs are never rerecorded
merely because a new capability adds new phrases.
Capture stops after and retains one second of trailing silence; a rejected take
is rerecorded against the same immutable phrase ID.
Third-party benchmark models and engines are not downloaded by repository
tooling. If an operator separately reviews and supplies them, run the committed
allowlist verification with `--architecture arm64`; missing or mismatched files
must prevent the Pi benchmark from starting. Apply the supply-chain rules in
`docs/03-boundaries-and-rules.md`: official immutable upstreams, 30-day
cooling-off, SHA-256 and byte-count verification, link/traversal-safe archive
inspection, private versioned extraction, no credentials, and offline use.
Python runtime wheels must also be explicit allowlist entries from immutable
official PyPI file URLs and installed with indexes and dependency resolution
disabled; PyPI is not an approved model or engine source.
Normal installation continues to use explicit command or streaming provider
configuration until Milestones 13 and 14 select and document first-class local
adapters.
