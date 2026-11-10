#!/usr/bin/env bash
# Fails unless every non-merge commit in BASE..HEAD carries a Signed-off-by line.
set -euo pipefail

base=${1:?usage: dco.sh BASE_SHA}
bad=0
for sha in $(git rev-list --no-merges "$base"..HEAD); do
  if ! git show -s --format=%B "$sha" | grep -qE '^Signed-off-by: .+ <.+@.+>$'; then
    echo "missing Signed-off-by: $(git show -s --format='%h %s' "$sha")"
    bad=1
  fi
done
if ((bad)); then
  echo "Sign off with 'git commit -s' (or 'git rebase --signoff'); see CONTRIBUTING.md."
  exit 1
fi
