# Personal Voice Benchmark Corpus

`personal-phrases.json` assigns every spoken phrase a stable ID and one or more
capability coverage tags. `personal-recordings.json` records only accepted,
consented WAV files.

Capture defaults to active phrases without an accepted recording. Adding a
capability therefore adds new phrase IDs without invalidating earlier audio.
Never change the text behind an ID that already has a recording: retire that
phrase and add a new versioned ID instead.

Accepted recordings become permanent Git history. Phrase text must remain free
of real names, appointments, messages, credentials, or other private facts.
Downloaded models, rejected takes, and staging recordings do not belong here.
