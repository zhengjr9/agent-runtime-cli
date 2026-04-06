#!/usr/bin/env bash

set -euo pipefail

TARGET="${1:-stable}"

if [[ -n "$TARGET" ]] && [[ ! "$TARGET" =~ ^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$ ]]; then
  echo "Usage: $0 [stable|latest|VERSION]" >&2
  exit 1
fi

PROJECT_NAME="agent-runtime-cli"
BIN_NAME="agent-cli"
REPO_SLUG="zhengjr9/agent-runtime-cli"
API_ROOT="https://api.github.com/repos/${REPO_SLUG}"
RAW_ROOT="https://raw.githubusercontent.com/${REPO_SLUG}/main"
DOWNLOAD_DIR="${HOME}/.agent-runtime-cli/downloads"
INSTALL_ROOT="${AGENT_RUNTIME_CLI_HOME:-$HOME/.agent-runtime-cli}"
INSTALL_VERSIONS_DIR="${INSTALL_ROOT}/local/versions"
INSTALL_OFFLINE_DIR="${INSTALL_ROOT}/offline/current"
LINK_DIR="${HOME}/.local/bin"

DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
  DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
  DOWNLOADER="wget"
else
  echo "Either curl or wget is required but neither is installed" >&2
  exit 1
fi

HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=true
fi

download_file() {
  local url="$1"
  local output="${2:-}"

  if [[ "$DOWNLOADER" == "curl" ]]; then
    if [[ -n "$output" ]]; then
      curl -fsSL -o "$output" "$url"
    else
      curl -fsSL "$url"
    fi
  else
    if [[ -n "$output" ]]; then
      wget -q -O "$output" "$url"
    else
      wget -q -O - "$url"
    fi
  fi
}

url_exists() {
  local url="$1"

  if [[ "$DOWNLOADER" == "curl" ]]; then
    curl -fsIL "$url" >/dev/null
  else
    wget -q --spider "$url"
  fi
}

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *)
      echo "Unsupported operating system: $(uname -s)" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

resolve_version() {
  if [[ "$TARGET" != "stable" && "$TARGET" != "latest" ]]; then
    echo "$TARGET"
    return 0
  fi

  local json
  if json="$(download_file "${API_ROOT}/releases/latest" 2>/dev/null)"; then
    if [[ "$HAS_JQ" == "true" ]]; then
      echo "$json" | jq -r '.tag_name | sub("^v"; "")'
      return 0
    fi

    echo "$json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1
    return 0
  fi

  if [[ "$HAS_JQ" == "true" ]]; then
    download_file "${RAW_ROOT}/package.json" 2>/dev/null | jq -r '.version'
    return 0
  fi

  download_file "${RAW_ROOT}/package.json" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

build_asset_candidates() {
  local version="$1"
  local os="$2"
  local arch="$3"
  local alt_arch="$arch"

  if [[ "$arch" == "x64" ]]; then
    alt_arch="amd64"
  fi

  cat <<EOF
${PROJECT_NAME}-offline-${version}-${os}-${arch}.tar.gz
${PROJECT_NAME}-offline-${version}-${os}-${alt_arch}.tar.gz
${PROJECT_NAME}-${version}-${os}-${arch}.tar.gz
${PROJECT_NAME}-${version}-${os}-${alt_arch}.tar.gz
${PROJECT_NAME}-${os}-${arch}.tar.gz
${PROJECT_NAME}-${os}-${alt_arch}.tar.gz
${BIN_NAME}-${version}-${os}-${arch}.tar.gz
${BIN_NAME}-${version}-${os}-${alt_arch}.tar.gz
${BIN_NAME}-${os}-${arch}.tar.gz
${BIN_NAME}-${os}-${alt_arch}.tar.gz
EOF
}

extract_archive() {
  local archive_path="$1"
  local extract_dir
  extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/${PROJECT_NAME}.XXXXXX")"
  tar -xzf "$archive_path" -C "$extract_dir"
  printf '%s\n' "$extract_dir"
}

find_source_bin() {
  local extract_dir="$1"

  if [[ -f "${extract_dir}/${BIN_NAME}" ]]; then
    printf '%s\n' "${extract_dir}/${BIN_NAME}"
    return 0
  fi

  if [[ -f "${extract_dir}/dist/${BIN_NAME}" ]]; then
    printf '%s\n' "${extract_dir}/dist/${BIN_NAME}"
    return 0
  fi

  return 1
}

find_offline_bundle_root() {
  local extract_dir="$1"

  if [[ -d "${extract_dir}/app" && -f "${extract_dir}/install.sh" ]]; then
    printf '%s\n' "$extract_dir"
    return 0
  fi

  local root
  root="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [[ -n "$root" && -d "${root}/app" && -f "${root}/install.sh" ]]; then
    printf '%s\n' "$root"
    return 0
  fi

  return 1
}

pick_release_asset() {
  local version="$1"
  local os="$2"
  local arch="$3"
  local json

  json="$(download_file "${API_ROOT}/releases/tags/v${version}")"

  if [[ "$HAS_JQ" == "true" ]]; then
    while IFS= read -r candidate; do
      local url
      url="$(echo "$json" | jq -r --arg name "$candidate" '.assets[] | select(.name == $name) | .browser_download_url' | head -n 1)"
      if [[ -n "$url" ]]; then
        printf '%s\n%s\n' "$candidate" "$url"
        return 0
      fi
    done < <(build_asset_candidates "$version" "$os" "$arch")
  else
    while IFS= read -r candidate; do
      local url
      url="$(printf '%s' "$json" | tr -d '\n\r' | sed -n "s/.*\"name\":\"${candidate//./\\.}\",\"browser_download_url\":\"\\([^\"]*\\)\".*/\\1/p" | head -n 1)"
      if [[ -n "$url" ]]; then
        printf '%s\n%s\n' "$candidate" "$url"
        return 0
      fi
    done < <(build_asset_candidates "$version" "$os" "$arch")
  fi

  echo "No matching release asset found for ${os}-${arch} version ${version}" >&2
  build_asset_candidates "$version" "$os" "$arch" | sed 's/^/  - /' >&2
  exit 1
}

pick_repo_asset() {
  local version="$1"
  local os="$2"
  local arch="$3"

  while IFS= read -r candidate; do
    local url="${RAW_ROOT}/release/${candidate}"
    if url_exists "$url"; then
      printf '%s\n%s\n' "$candidate" "$url"
      return 0
    fi
  done < <(build_asset_candidates "$version" "$os" "$arch")

  return 1
}

find_checksum_in_file() {
  local checksum_file="$1"
  local asset_name="$2"

  awk -v name="$asset_name" '
    $0 ~ name {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^[a-f0-9]{64}$/) {
          print $i
          exit
        }
      }
    }
  ' "$checksum_file"
}

verify_checksum_if_available() {
  local asset_name="$1"
  local archive_path="$2"
  local version="$3"

  local checksum_name="${PROJECT_NAME}-${version}-checksums.txt"
  local checksum_url="https://github.com/${REPO_SLUG}/releases/download/v${version}/${checksum_name}"
  local checksum_file="${archive_path}.checksums"

  if ! download_file "$checksum_url" "$checksum_file" 2>/dev/null; then
    return 0
  fi

  local expected actual
  expected="$(find_checksum_in_file "$checksum_file" "$asset_name" || true)"
  rm -f "$checksum_file"

  if [[ -z "$expected" ]]; then
    return 0
  fi

  if [[ "$(detect_os)" == "darwin" ]]; then
    actual="$(shasum -a 256 "$archive_path" | cut -d' ' -f1)"
  else
    actual="$(sha256sum "$archive_path" | cut -d' ' -f1)"
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum verification failed for ${asset_name}" >&2
    exit 1
  fi
}

remove_quarantine() {
  local target="$1"
  if [[ "$(detect_os)" == "darwin" ]] && command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "$target" >/dev/null 2>&1 || true
  fi
}

resign_binary() {
  local target="$1"
  if [[ "$(detect_os)" == "darwin" ]] && command -v codesign >/dev/null 2>&1; then
    codesign --force --sign - "$target" >/dev/null 2>&1 || true
  fi
}

install_binary_archive() {
  local archive_path="$1"
  local version="$2"
  local install_dir="${INSTALL_VERSIONS_DIR}/${version}"
  local extract_dir
  extract_dir="$(extract_archive "$archive_path")"
  trap 'rm -rf "$extract_dir"' RETURN

  mkdir -p "$DOWNLOAD_DIR" "$install_dir" "$LINK_DIR"
  local source_bin=""
  source_bin="$(find_source_bin "$extract_dir" || true)"

  if [[ -z "$source_bin" ]]; then
    echo "Downloaded archive does not contain ${BIN_NAME}" >&2
    exit 1
  fi

  cp "$source_bin" "${install_dir}/${BIN_NAME}"
  chmod 755 "${install_dir}/${BIN_NAME}"
  remove_quarantine "${install_dir}/${BIN_NAME}"
  resign_binary "${install_dir}/${BIN_NAME}"
  ln -sf "${install_dir}/${BIN_NAME}" "${LINK_DIR}/${BIN_NAME}"
}

install_offline_bundle_archive() {
  local archive_path="$1"
  local extract_dir bundle_root launcher_path
  extract_dir="$(extract_archive "$archive_path")"
  trap 'rm -rf "$extract_dir"' RETURN

  bundle_root="$(find_offline_bundle_root "$extract_dir" || true)"
  if [[ -z "$bundle_root" ]]; then
    echo "Downloaded archive does not contain an offline bundle layout" >&2
    exit 1
  fi

  mkdir -p "${INSTALL_OFFLINE_DIR}" "$LINK_DIR"
  rm -rf "${INSTALL_OFFLINE_DIR}/app" "${INSTALL_OFFLINE_DIR}/bun"
  cp -R "${bundle_root}/app" "${INSTALL_OFFLINE_DIR}/app"
  if [[ -d "${bundle_root}/bun" ]]; then
    cp -R "${bundle_root}/bun" "${INSTALL_OFFLINE_DIR}/bun"
  fi
  if [[ -f "${bundle_root}/VERSION" ]]; then
    cp "${bundle_root}/VERSION" "${INSTALL_OFFLINE_DIR}/VERSION"
  fi

  launcher_path="${INSTALL_OFFLINE_DIR}/${BIN_NAME}"
  cat >"${launcher_path}" <<'EOF'
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
  chmod 755 "${launcher_path}"
  remove_quarantine "${launcher_path}"
  resign_binary "${launcher_path}"
  if [[ -x "${INSTALL_OFFLINE_DIR}/bun/bin/bun" ]]; then
    chmod 755 "${INSTALL_OFFLINE_DIR}/bun/bin/bun"
    remove_quarantine "${INSTALL_OFFLINE_DIR}/bun/bin/bun"
    resign_binary "${INSTALL_OFFLINE_DIR}/bun/bin/bun"
  fi
  ln -sf "${launcher_path}" "${LINK_DIR}/${BIN_NAME}"
}

print_path_hint() {
  case ":${PATH}:" in
    *":${LINK_DIR}:"*) return 0 ;;
  esac

  echo
  echo "${LINK_DIR} is not in your PATH." >&2
  echo "Add this to your shell profile:" >&2
  echo >&2
  echo "  export PATH=\"${LINK_DIR}:\$PATH\"" >&2
  echo >&2
}

main() {
  local os arch version asset_name download_url archive_path asset_info_raw

  os="$(detect_os)"
  arch="$(detect_arch)"
  version="$(resolve_version)"

  if [[ -z "$version" ]]; then
    echo "Could not resolve an installable version from GitHub Releases or repository metadata" >&2
    exit 1
  fi

  echo "Installing ${PROJECT_NAME} ${version} for ${os}-${arch}..."

  asset_info_raw="$(pick_release_asset "$version" "$os" "$arch" 2>/dev/null || true)"
  if [[ -z "$asset_info_raw" ]]; then
    asset_info_raw="$(pick_repo_asset "$version" "$os" "$arch" || true)"
    if [[ -z "$asset_info_raw" ]]; then
      echo "No installable asset found for ${os}-${arch} version ${version}" >&2
      exit 1
    fi
  fi
  asset_name="$(printf '%s\n' "$asset_info_raw" | sed -n '1p')"
  download_url="$(printf '%s\n' "$asset_info_raw" | sed -n '2p')"
  if [[ -z "$asset_name" || -z "$download_url" ]]; then
    echo "Installer could not resolve a download URL for ${os}-${arch} version ${version}" >&2
    exit 1
  fi

  mkdir -p "$DOWNLOAD_DIR"
  archive_path="${DOWNLOAD_DIR}/${asset_name}"

  echo "Downloading ${download_url}"
  download_file "$download_url" "$archive_path"
  verify_checksum_if_available "$asset_name" "$archive_path" "$version"
  if [[ "$asset_name" == *"-offline-"* ]]; then
    install_offline_bundle_archive "$archive_path"
  else
    install_binary_archive "$archive_path" "$version"
  fi
  rm -f "$archive_path"

  echo
  if [[ "$asset_name" == *"-offline-"* ]]; then
    echo "Installed ${BIN_NAME} to ${INSTALL_OFFLINE_DIR}/${BIN_NAME}"
  else
    echo "Installed ${BIN_NAME} to ${INSTALL_VERSIONS_DIR}/${version}/${BIN_NAME}"
  fi
  echo "Linked ${LINK_DIR}/${BIN_NAME}"
  echo
  echo "Run:"
  echo "  ${BIN_NAME}"
  print_path_hint
}

main "$@"
