#!/usr/bin/env sh

set -eu

PROJECT_NAME="agent-runtime-cli"
BIN_NAME="agent-cli"
VERSION="$(
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1
)"
HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_RAW="$(uname -m)"

case "$ARCH_RAW" in
  x86_64|amd64) HOST_ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    printf '%s\n' "Unsupported architecture: $ARCH_RAW" >&2
    exit 1
    ;;
esac

OUTPUT_ROOT="${OUTPUT_ROOT:-dist-offline}"
BUNDLE_BUN="${BUNDLE_BUN:-1}"
BUN_SOURCE="${BUN_SOURCE:-${HOME}/.bun/bin/bun}"

if [ "${ARCH:-}" = "arm64" ]; then
  HOST_ARCH="arm64"
fi

default_target() {
  printf '%s-%s\n' "$HOST_OS" "$HOST_ARCH"
}

usage() {
  cat <<'EOF'
Usage:
  sh scripts/package-offline.sh
  sh scripts/package-offline.sh linux-amd64 windows-x86
  sh scripts/package-offline.sh --all

Environment:
  OUTPUT_ROOT     Output directory, default dist-offline
  BUNDLE_BUN      1 to bundle bun when available, default 1
  BUN_SOURCE      Default bun source path, default ~/.bun/bin/bun

Notes:
  - Cross-target packages are source bundles by default.
  - If the target does not include a bundled bun, the installed launcher falls back to:
    1. local bun
    2. local node --import tsx
EOF
}

all_targets() {
  cat <<'EOF'
darwin-arm64
darwin-amd64
linux-amd64
linux-arm64
windows-amd64
windows-x86
EOF
}

normalize_target() {
  case "$1" in
    darwin-x64|darwin-amd64) printf 'darwin-amd64\n' ;;
    darwin-arm64) printf 'darwin-arm64\n' ;;
    linux-x64|linux-amd64) printf 'linux-amd64\n' ;;
    linux-arm64) printf 'linux-arm64\n' ;;
    windows-x64|windows-amd64) printf 'windows-amd64\n' ;;
    windows-x86|windows-386) printf 'windows-x86\n' ;;
    *)
      printf '%s\n' "Unsupported target: $1" >&2
      exit 1
      ;;
  esac
}

copy_path() {
  src="$1"
  dst="$2"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}

bundle_bun_for_target() {
  target_os="$1"
  target_arch="$2"
  package_dir="$3"

  if [ "$BUNDLE_BUN" != "1" ]; then
    return 0
  fi

  if [ "$target_os" = "windows" ]; then
    env_name="BUN_SOURCE_WINDOWS_${target_arch}"
    candidate="$(eval "printf '%s' \"\${$env_name:-}\"")"
    [ -n "$candidate" ] || return 0
    if [ ! -f "$candidate" ]; then
      printf '%s\n' "Bundled bun requested for ${target_os}-${target_arch}, but not found: $candidate" >&2
      exit 1
    fi
    mkdir -p "${package_dir}/bun/bin"
    cp "$candidate" "${package_dir}/bun/bin/bun.exe"
    return 0
  fi

  if [ "$target_os" = "$HOST_OS" ] && [ "$target_arch" = "$HOST_ARCH" ]; then
    if [ ! -x "$BUN_SOURCE" ]; then
      printf '%s\n' "BUNDLE_BUN=1 but bun binary not found at $BUN_SOURCE" >&2
      exit 1
    fi
    mkdir -p "${package_dir}/bun/bin"
    cp "$BUN_SOURCE" "${package_dir}/bun/bin/bun"
    chmod 755 "${package_dir}/bun/bin/bun"
    return 0
  fi

  env_suffix="$(printf '%s_%s' "$target_os" "$target_arch" | tr '[:lower:]-' '[:upper:]_')"
  env_name="BUN_SOURCE_${env_suffix}"
  candidate="$(eval "printf '%s' \"\${$env_name:-}\"")"
  [ -n "$candidate" ] || return 0
  if [ ! -x "$candidate" ]; then
    printf '%s\n' "Bundled bun requested for ${target_os}-${target_arch}, but not found: $candidate" >&2
    exit 1
  fi
  mkdir -p "${package_dir}/bun/bin"
  cp "$candidate" "${package_dir}/bun/bin/bun"
  chmod 755 "${package_dir}/bun/bin/bun"
}

build_one_target() {
  target="$1"
  normalized_target="$(normalize_target "$target")"
  target_os="${normalized_target%-*}"
  target_arch="${normalized_target#*-}"
  package_dir="${OUTPUT_ROOT}/${PROJECT_NAME}-offline-${VERSION}-${target_os}-${target_arch}"
  archive_path="${OUTPUT_ROOT}/${PROJECT_NAME}-offline-${VERSION}-${target_os}-${target_arch}.tar.gz"

  rm -rf "$package_dir"
  mkdir -p "$package_dir/app" "$OUTPUT_ROOT"

  copy_path "src" "${package_dir}/app/src"
  copy_path "node_modules" "${package_dir}/app/node_modules"
  copy_path "shims" "${package_dir}/app/shims"
  copy_path "package.json" "${package_dir}/app/package.json"
  copy_path "bun.lock" "${package_dir}/app/bun.lock"
  copy_path "bunfig.toml" "${package_dir}/app/bunfig.toml"
  copy_path ".npmrc" "${package_dir}/app/.npmrc"
  copy_path "README.md" "${package_dir}/README-offline.md"
  copy_path "install-offline.sh" "${package_dir}/install.sh"
  copy_path "install-offline.ps1" "${package_dir}/install.ps1"

  if [ -f "tsconfig.json" ]; then
    copy_path "tsconfig.json" "${package_dir}/app/tsconfig.json"
  fi

  bundle_bun_for_target "$target_os" "$target_arch" "$package_dir"

  cat > "${package_dir}/VERSION" <<EOF
${VERSION}
EOF

  tar -czf "$archive_path" -C "$OUTPUT_ROOT" "$(basename "$package_dir")"

  printf '%s\n' "Created offline bundle:"
  printf '  %s\n' "$archive_path"
  printf '%s\n' ""
  printf '%s\n' "Install with:"
  printf '  tar -xzf %s\n' "$archive_path"
  printf '  cd %s\n' "$(basename "$package_dir")"
  if [ "$target_os" = "windows" ]; then
    printf '  powershell -ExecutionPolicy Bypass -File .\\install.ps1\n'
  else
    printf '  sh install.sh\n'
  fi
  printf '\n'
}

main() {
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
  fi

  if [ "${1:-}" = "--all" ]; then
    set -- $(all_targets)
  elif [ "$#" -eq 0 ]; then
    set -- "$(default_target)"
  fi

  for target in "$@"; do
    build_one_target "$target"
  done
}

main "$@"
