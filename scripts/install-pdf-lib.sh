#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
curl -L "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js" -o "$DIR/../vendor/pdf-lib.min.js"
echo "Saved vendor/pdf-lib.min.js. Reload the extension at chrome://extensions."
