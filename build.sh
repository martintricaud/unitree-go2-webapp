#!/usr/bin/env bash
# build.sh — builds the unitree-go2 app for distribution
# Usage: ./build.sh vN [--skip-frontend] [--release]
#   Builds dist-app/vN/unitree-go2-vN.app, replacing any earlier build of vN.
#   --release also writes dist-app/vN/unitree-go2-vN-mac.zip, holding the app and READ-ME-FIRST.txt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/unitree-go2-gui"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV="$BACKEND_DIR/venv"
# PyInstaller's work files and its intermediate output; only the .app leaves this folder.
WORK_DIR="$SCRIPT_DIR/.pyinstaller-build"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
error() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ── argument parsing ──────────────────────────────────────────────────────────
VERSION=""
SKIP_FRONTEND=false
RELEASE=false
for arg in "$@"; do
  case "$arg" in
    --skip-frontend) SKIP_FRONTEND=true ;;
    --release)       RELEASE=true ;;
    v[0-9]*)         VERSION="$arg" ;;
    *)               error "Unknown argument: $arg. Usage: ./build.sh vN [--skip-frontend] [--release]" ;;
  esac
done
[[ "$VERSION" =~ ^v[0-9]+$ ]] || error "Give the version as the first argument, for example: ./build.sh v4"

NAME="unitree-go2-$VERSION"
DIST_DIR="$SCRIPT_DIR/dist-app/$VERSION"

# ── dependency checks ─────────────────────────────────────────────────────────
info "Checking dependencies..."

command -v node  >/dev/null 2>&1 || error "node not found. Install via Homebrew or volta."
command -v npm   >/dev/null 2>&1 || error "npm not found."
[[ -f "$VENV/bin/python" ]]      || error "Python venv not found at $VENV. See the README, section 1, option B."
[[ -f "$VENV/bin/pyinstaller" ]] || error "pyinstaller not found in venv. Run: $VENV/bin/pip install pyinstaller"
[[ -f "$SCRIPT_DIR/unitree-go2.spec" ]] || error "unitree-go2.spec not found."
[[ -f "$SCRIPT_DIR/READ-ME-FIRST.txt" ]] || error "READ-ME-FIRST.txt not found."

# ── frontend build ────────────────────────────────────────────────────────────
if [[ "$SKIP_FRONTEND" == false ]]; then
  info "Building frontend..."
  cd "$FRONTEND_DIR"
  npm install --silent
  npm run build
  cd "$SCRIPT_DIR"
  info "Frontend built → $FRONTEND_DIR/dist"
else
  warn "Skipping frontend build (--skip-frontend)"
  [[ -d "$FRONTEND_DIR/dist" ]] || error "No dist/ folder found and --skip-frontend was set."
fi

# ── pyinstaller build ─────────────────────────────────────────────────────────
info "Packaging $NAME with PyInstaller..."
cd "$BACKEND_DIR"

GO2_VERSION="$VERSION" "$VENV/bin/pyinstaller" \
  --distpath "$WORK_DIR/dist" \
  --workpath "$WORK_DIR" \
  --noconfirm \
  "$SCRIPT_DIR/unitree-go2.spec"

cd "$SCRIPT_DIR"

BUILT_APP="$WORK_DIR/dist/$NAME.app"
[[ -d "$BUILT_APP" ]] || error "Build finished but $BUILT_APP was not found. Check PyInstaller output above."

APP_PATH="$DIST_DIR/$NAME.app"
mkdir -p "$DIST_DIR"
rm -rf "$APP_PATH"
mv "$BUILT_APP" "$APP_PATH"
info "App bundle → $APP_PATH"

# ── release zip ───────────────────────────────────────────────────────────────
if [[ "$RELEASE" == true ]]; then
  info "Packaging the release zip..."
  STAGE="$WORK_DIR/release/$NAME"
  rm -rf "$WORK_DIR/release"
  mkdir -p "$STAGE"
  ditto "$APP_PATH" "$STAGE/$NAME.app"
  sed "s/{{VERSION}}/$VERSION/g" "$SCRIPT_DIR/READ-ME-FIRST.txt" > "$STAGE/READ-ME-FIRST.txt"
  ZIP_PATH="$DIST_DIR/$NAME-mac.zip"
  rm -f "$ZIP_PATH"
  # ditto keeps the app's permissions, and its embedded signature. Without extended attributes
  # and resource forks it adds no __MACOSX folder and no ._ files, unlike Finder's Compress.
  ditto -c -k --norsrc --noextattr --keepParent "$STAGE" "$ZIP_PATH"
  rm -rf "$WORK_DIR/release"
  info "Release zip → $ZIP_PATH"
fi

info "Done."
