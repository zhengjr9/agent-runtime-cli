# Distribution Notes

This repository can produce a standalone macOS binary:

```bash
bun run package:mac
```

Artifacts:

- `dist/agent-cli`
- `dist/agent-cli-darwin-arm64.tar.gz`
- `dist/agent-cli-darwin-arm64.sha256`

Important limits:

- This is a `darwin-arm64` binary built on macOS Apple Silicon.
- It does not require Bun on the recipient machine.
- It is ad-hoc signed only, not Apple Developer ID signed or notarized.
- Gatekeeper may still block it if the archive was downloaded and tagged with quarantine.

Recommended sharing:

- Prefer `scp`, `rsync`, or another direct file transfer.
- If sharing by browser/chat app/cloud drive, send the tarball, not the naked binary.

Recipient steps:

```bash
tar -xzf agent-cli-darwin-arm64.tar.gz
chmod +x agent-cli
xattr -d com.apple.quarantine ./agent-cli 2>/dev/null || true
./agent-cli --version
```

To avoid the quarantine prompt entirely for normal macOS distribution, you need:

1. Apple Developer ID signing
2. Apple notarization
3. Stapling the notarization ticket
