#!/bin/sh
set -eu

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY is not set" >&2
  exit 2
fi

request_with_auth() {
  curl --header @/dev/fd/3 "$@" 3<<EOF
Authorization: Bearer ${OPENAI_API_KEY}
EOF
}

case "${1:-}" in
  transcribe)
    if [ "$#" -ne 2 ]; then
      echo "Usage: openai-audio-command.sh transcribe input-file" >&2
      exit 2
    fi

    request_with_auth \
      --fail \
      --silent \
      --show-error \
      --request POST \
      --url https://api.openai.com/v1/audio/transcriptions \
      --form "file=@$2" \
      --form model=gpt-4o-transcribe \
      --form response_format=text
    ;;
  speak)
    if [ "$#" -ne 2 ]; then
      echo "Usage: openai-audio-command.sh speak output-file" >&2
      exit 2
    fi

    jq -Rs \
      '{model:"gpt-4o-mini-tts", voice:"marin", input:., instructions:"Speak in a warm, natural British English voice. Sound calm and conversational, with varied intonation and brief natural pauses. Avoid an announcer-like cadence. Read the supplied text exactly; do not add or omit words.", response_format:"wav"}' |
      request_with_auth \
        --fail \
        --silent \
        --show-error \
        --url https://api.openai.com/v1/audio/speech \
        --header "Content-Type: application/json" \
        --data-binary @- \
        --output "$2"
    ;;
  *)
    echo "Usage: openai-audio-command.sh transcribe|speak arguments..." >&2
    exit 2
    ;;
esac
