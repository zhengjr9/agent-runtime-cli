#!/usr/bin/env sh

set -eu

PROJECT_NAME="agent-runtime-cli"
BIN_NAME="agent-cli"
REPO_SLUG="zhengjr9/agent-runtime-cli"
INSTALL_ROOT="${AGENT_RUNTIME_CLI_HOME:-$HOME/.agent-runtime-cli}"
INSTALL_BIN_DIR="${INSTALL_ROOT}/local"
LINK_DIR="${HOME}/.local/bin"
TMP_DIR="${TMPDIR:-/tmp}"

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
  sh install.sh                Install stable version
  sh install.sh latest         Install latest release
  sh install.sh 0.2.0          Install specific version

Environment:
  AGENT_RUNTIME_CLI_HOME       Install root, default ~/.agent-runtime-cli
  AGENT_RUNTIME_CLI_DOWNLOAD_URL
                               Override download URL completely
EOF
}

detect_os() {
  case "$(uname -s)" in
    Darwin) printf 'darwin\n' ;;
    Linux) printf 'linux\n' ;;
    *)
      err "Unsupported operating system: $(uname -s)"
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'x64\n' ;;
    arm64|aarch64) printf 'arm64\n' ;;
    *)
      err "Unsupported architecture: $(uname -m)"
      exit 1
      ;;
  esac
}

normalize_version_arg() {
  input="${1:-stable}"
  case "$input" in
    stable|'') printf 'stable\n' ;;
    latest) printf 'latest\n' ;;
    v*) printf '%s\n' "${input#v}" ;;
    *) printf '%s\n' "$input" ;;
  esac
}

resolve_release_version() {
  requested="$1"
  if [ "$requested" != "stable" ] && [ "$requested" != "latest" ]; then
    printf '%s\n' "$requested"
    return 0
  fi

  if ! need_cmd curl; then
    err "curl is required to resolve release versions."
    exit 1
  fi

  api_url="https://api.github.com/repos/${REPO_SLUG}/releases/latest"
  version="$(
    HTTPS_PROXY= HTTP_PROXY= ALL_PROXY= https_proxy= http_proxy= all_proxy= NO_PROXY= no_proxy= \
      curl -fsSL "$api_url" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1
  )"

  if [ -z "$version" ]; then
    err "Could not resolve the latest release version from ${api_url}"
    exit 1
  fi

  printf '%s\n' "$version"
}

build_asset_name() {
  version="$1"
  os="$2"
  arch="$3"
  printf '%s\n' "${PROJECT_NAME}-${version}-${os}-${arch}.tar.gz"
}

build_download_url() {
  version="$1"
  asset_name="$2"
  if [ -n "${AGENT_RUNTIME_CLI_DOWNLOAD_URL:-}" ]; then
    printf '%s\n' "$AGENT_RUNTIME_CLI_DOWNLOAD_URL"
    return 0
  fi
  printf 'https://github.com/%s/releases/download/v%s/%s\n' "$REPO_SLUG" "$version" "$asset_name"
}

detect_local_repo_root() {
  if [ -f "./dist/${BIN_NAME}" ]; then
    pwd
    return 0
  fi

  if [ -f "./package.json" ] && [ -d "./dist" ] && [ -f "./dist/${BIN_NAME}" ]; then
    pwd
    return 0
  fi

  if need_cmd git; then
    root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$root" ] && [ -f "$root/dist/${BIN_NAME}" ]; then
      printf '%s\n' "$root"
      return 0
    fi
  fi

  printf '%s\n' ""
}

download_release() {
  url="$1"
  archive_path="$2"

  if ! need_cmd curl; then
    err "curl is required to download release assets."
    exit 1
  fi

  HTTPS_PROXY= HTTP_PROXY= ALL_PROXY= https_proxy= http_proxy= all_proxy= NO_PROXY= no_proxy= \
    curl -fL "$url" -o "$archive_path"
}

install_from_local_dist() {
  repo_root="$1"
  version="$2"
  target_dir="${INSTALL_BIN_DIR}/versions/${version}"
  mkdir -p "$target_dir" "$LINK_DIR"
  cp "${repo_root}/dist/${BIN_NAME}" "${target_dir}/${BIN_NAME}"
  chmod 755 "${target_dir}/${BIN_NAME}"
  ln -sf "${target_dir}/${BIN_NAME}" "${LINK_DIR}/${BIN_NAME}"
}

install_from_archive() {
  archive_path="$1"
  version="$2"
  target_dir="${INSTALL_BIN_DIR}/versions/${version}"
  extract_dir="$(mktemp -d "${TMP_DIR%/}/${PROJECT_NAME}.XXXXXX")"
  trap 'rm -rf "$extract_dir"' EXIT INT TERM

  mkdir -p "$target_dir" "$LINK_DIR"
  tar -xzf "$archive_path" -C "$extract_dir"

  if [ -f "${extract_dir}/${BIN_NAME}" ]; then
    source_bin="${extract_dir}/${BIN_NAME}"
  elif [ -f "${extract_dir}/dist/${BIN_NAME}" ]; then
    source_bin="${extract_dir}/dist/${BIN_NAME}"
  else
    err "Downloaded archive does not contain ${BIN_NAME}"
    exit 1
  fi

  cp "$source_bin" "${target_dir}/${BIN_NAME}"
  chmod 755 "${target_dir}/${BIN_NAME}"
  ln -sf "${target_dir}/${BIN_NAME}" "${LINK_DIR}/${BIN_NAME}"
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

  requested_version="$(normalize_version_arg "${1:-stable}")"
  version="$(resolve_release_version "$requested_version")"
  os="$(detect_os)"
  arch="$(detect_arch)"
  asset_name="$(build_asset_name "$version" "$os" "$arch")"
  download_url="$(build_download_url "$version" "$asset_name")"

  info "Installing ${PROJECT_NAME} ${version} for ${os}-${arch}..."

  local_repo_root="$(detect_local_repo_root)"
  if [ -n "$local_repo_root" ]; then
    info "Using local prebuilt binary from ${local_repo_root}/dist/${BIN_NAME}"
    install_from_local_dist "$local_repo_root" "$version"
  else
    archive_path="$(mktemp "${TMP_DIR%/}/${PROJECT_NAME}.${version}.XXXXXX.tar.gz")"
    trap 'rm -f "$archive_path"' EXIT INT TERM
    info "Downloading ${download_url}"
    download_release "$download_url" "$archive_path"
    install_from_archive "$archive_path" "$version"
  fi

  info ""
  info "${BIN_NAME} installed successfully."
  info "Run:"
  printf '\n'
  printf '  %s\n' "${BIN_NAME}"
  printf '\n'

  print_path_hint
}

main "$@"
