#!/usr/bin/env bash
# Run the live checks inside the backend container. Needs a FRESH database (they create users/projects):
#   podman-compose down -v && podman-compose up -d && scripts/live-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENGINE=${ENGINE:-podman}
CONTAINER=${CONTAINER:-monolith_backend}
export MSYS_NO_PATHCONV=1
for f in smoke_security smoke_tasks_search; do
  "$ENGINE" cp "backend/tests/live/$f.py" "$CONTAINER:/tmp/$f.py"
  echo "=== $f ==="
  "$ENGINE" exec "$CONTAINER" python "/tmp/$f.py"
done
