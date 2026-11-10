#!/usr/bin/env bash
# Tags the next semver on main and pushes it; the tag triggers the release workflow.
set -euo pipefail

type=${1:?usage: release.sh patch|minor|major}
git fetch -q --tags origin
last=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)
IFS=. read -r major minor patch <<<"${last#v}"
major=${major:-0} minor=${minor:-0} patch=${patch:-0}
case $type in
major) next=$((major + 1)).0.0 ;;
minor) next=$major.$((minor + 1)).0 ;;
patch) next=$major.$minor.$((patch + 1)) ;;
*) echo "TYPE must be patch, minor or major" >&2; exit 1 ;;
esac
[[ -n $next ]] || { echo "empty version" >&2; exit 1; }
if git ls-remote --exit-code --tags origin "refs/tags/v$next" >/dev/null 2>&1; then
  echo "v$next already exists on origin" >&2
  exit 1
fi
[[ $(git rev-parse HEAD) == "$(git rev-parse origin/main)" ]] || { echo "HEAD is not origin/main" >&2; exit 1; }
git tag -s -m "v$next" "v$next" 2>/dev/null || git tag -a -m "v$next" "v$next"
git push origin "v$next"
echo "pushed v$next"
