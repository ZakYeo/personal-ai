# Personal Voice Benchmark Corpus

`personal-phrases.json` assigns every spoken phrase a stable ID and one or more
capability coverage tags. `personal-recordings.json` records only accepted,
consented WAV files.

Capture defaults to active phrases without an accepted recording. Adding a
capability therefore adds new phrase IDs without invalidating earlier audio.
Never change the text behind an ID that already has a recording: retire that
phrase and add a new versioned ID instead.

The capture entry point selects explicit PulseAudio devices when
`PULSE_SERVER` is present, as required by WSLg systems without `/dev/snd`.
Otherwise it uses the host's configured SoX recording and playback defaults.

Accepted recordings become permanent Git history. Phrase text must remain free
of real names, appointments, messages, credentials, or other private facts.
Downloaded models, rejected takes, and staging recordings do not belong here.
