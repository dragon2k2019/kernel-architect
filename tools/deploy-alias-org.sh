#!/usr/bin/env bash
# =============================================================================
# Deploy / Alias Kernel Architect to https://kernel-architect-game.github.io/
# =============================================================================
# Why this works:
# GitHub Pages prohibits using *.github.io domains inside a CNAME file.
# Instead, <org>.github.io domains are served automatically from a free GitHub
# Organization named `kernel-architect-game` with a repository named
# `kernel-architect-game.github.io`.
#
# Prerequisites (takes ~30 seconds in browser):
# 1. Create free GitHub Org `kernel-architect-game`:
#    https://github.com/account/organizations/new
# 2. Create public repo `kernel-architect-game.github.io` inside that org:
#    https://github.com/organizations/kernel-architect-game/repositories/new
# 3. Run:
#    bash tools/deploy-alias-org.sh
# =============================================================================

set -euo pipefail

ALIAS_ORG="kernel-architect-game"
ALIAS_REPO="kernel-architect-game.github.io"
REMOTE_URL="${1:-https://github.com/${ALIAS_ORG}/${ALIAS_REPO}.git}"

echo "==> Building standalone HTML5 bundle (dist/index.html)..."
npm run build

cp dist/index.html index.html
cp dist/index.html docs/index.html
touch .nojekyll docs/.nojekyll

if git remote get-url alias-org >/dev/null 2>&1; then
  git remote set-url alias-org "$REMOTE_URL"
else
  git remote add alias-org "$REMOTE_URL"
fi

echo "==> Pushing main branch to ${REMOTE_URL}..."
git push -u alias-org main:main --force

echo ""
echo "✓ Deployed! GitHub Pages for <org>.github.io repositories activates automatically."
echo "✓ Your aliased root URL is live at: https://kernel-architect-game.github.io/"
