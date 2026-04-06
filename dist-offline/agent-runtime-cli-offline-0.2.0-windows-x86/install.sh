#!/usr/bin/env sh

set -eu

PROJECT_NAME="agent-runtime-cli"
BIN_NAME="agent-cli"
INSTALL_ROOT="${AGENT_RUNTIME_CLI_HOME:-$HOME/.agent-runtime-cli}"
INSTALL_DIR="${INSTALL_ROOT}/offline/current"
LINK_DIR="${HOME}/.local/bin"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PACKAGE_ROOT="${SCRIPT_DIR}"
APP_SOURCE_DIR="${PACKAGE_ROOT}/app"
BUNDLED_BUN_PATH="${PACKAGE_ROOT}/bun/bin/bun"

color() {
  code="$1"
  shift
  if [ -t 1 ]; then
    printf '\033[%sm%s\033[0m\n' "$code" "$*"
  else
    printf '%s\n' "$*"
  fi
}

info() {
  color "1;34" "$*"
}

warn() {
  color "1;33" "$*"
}

err() {
  color "1;31" "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

usage() {
  cat <<'EOF'
Usage:
  sh install-offline.sh

Environment:
  AGENT_RUNTIME_CLI_HOME   Install root, default ~/.agent-runtime-cli
EOF
}

ensure_bundle_layout() {
  if [ ! -d "$APP_SOURCE_DIR" ]; then
    err "Offline bundle is missing app/ directory: $APP_SOURCE_DIR"
    exit 1
  fi

  if [ ! -f "${APP_SOURCE_DIR}/package.json" ]; then
    err "Offline bundle is incomplete: ${APP_SOURCE_DIR}/package.json not found"
    exit 1
  fi
}

copy_tree() {
  src="$1"
  dst="$2"
  mkdir -p "$dst"
  cp -R "$src"/. "$dst"/
}

install_runtime() {
  mkdir -p "$INSTALL_DIR" "$LINK_DIR"
  rm -rf "$INSTALL_DIR/app" "$INSTALL_DIR/bun"
  copy_tree "$APP_SOURCE_DIR" "$INSTALL_DIR/app"

  if [ -x "$BUNDLED_BUN_PATH" ]; then
    mkdir -p "$INSTALL_DIR/bun/bin"
    cp "$BUNDLED_BUN_PATH" "$INSTALL_DIR/bun/bin/bun"
    chmod 755 "$INSTALL_DIR/bun/bin/bun"
  fi
}

write_launcher() {
  launcher_path="${INSTALL_DIR}/${BIN_NAME}"
  cat >"$launcher_path" <<'EOF'
#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="${SCRIPT_DIR}/app"
BUNDLED_BUN="${SCRIPT_DIR}/bun/bin/bun"

if [ -x "$BUNDLED_BUN" ]; then
  exec "$BUNDLED_BUN" run "${APP_DIR}/src/agent-cli.tsx" "$@"
fi

if command -v bun >/dev/null 2>&1; then
  exec bun run "${APP_DIR}/src/agent-cli.tsx" "$@"
fi

if command -v node >/dev/null 2>&1; then
  exec node --import tsx "${APP_DIR}/src/agent-cli.tsx" "$@"
fi

printf '%s\n' "agent-runtime-cli requires Bun. Reinstall with a bundle that includes bun, or install bun first." >&2
exit 1
EOF
  chmod 755 "$launcher_path"
  ln -sf "$launcher_path" "${LINK_DIR}/${BIN_NAME}"
}

print_path_hint() {
  case ":${PATH}:" in
    *":${LINK_DIR}:"*) return 0 ;;
  esac

  warn ""
  warn "${LINK_DIR} is not in your PATH."
  warn "Add this to your shell profile:"
  printf '\n'
  printf '  export PATH="%s:$PATH"\n' "$LINK_DIR"
  printf '\n'
}

main() {
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
  fi

  ensure_bundle_layout
  install_runtime
  write_launcher

  info ""
  info "${PROJECT_NAME} offline bundle installed successfully."
  info "Run:"
  printf '\n'
  printf '  %s\n' "$BIN_NAME"
  printf '\n'
  print_path_hint
}

main "$@"
