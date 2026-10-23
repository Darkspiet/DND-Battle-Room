#!/usr/bin/env bash
set -euo pipefail
# Existing npm entry point uses the same installer as the public release.
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/install.sh" "$@"
