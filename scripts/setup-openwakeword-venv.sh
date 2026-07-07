#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv_path="${OPENWAKEWORD_VENV:-"$repo_root/.venv"}"
python_command="${PYTHON:-python3}"

if ! command -v "$python_command" >/dev/null 2>&1; then
  echo "Python command not found: $python_command" >&2
  echo "Install Python 3 or rerun with PYTHON=/path/to/python3." >&2
  exit 1
fi

"$python_command" -m venv "$venv_path"
"$venv_path/bin/python" -m pip install --upgrade pip
"$venv_path/bin/python" -m pip install openwakeword
"$venv_path/bin/python" "$repo_root/scripts/openwakeword-listener.py" --startup-check

echo "OpenWakeWord venv is ready at $venv_path"

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  # shellcheck source=/dev/null
  source "$venv_path/bin/activate"
  echo "Activated OpenWakeWord venv."
else
  echo "Activate it in your shell with:"
  echo "  source \"$venv_path/bin/activate\""
fi
