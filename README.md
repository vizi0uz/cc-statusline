# cc-statusline

A portable, cross-platform status line for [Claude Code](https://claude.com/claude-code) — installed with a single command.

```
npx cc-statusline@latest
```

That's it. Restart Claude Code and you'll have a live status line showing model, effort level, context usage, and rate-limit info, on macOS, Linux, and Windows alike.

## What it installs

Running the installer does two things, and nothing else:

1. Copies a self-contained Node launcher (`launcher.cjs`) plus the two platform scripts (`statusline.sh` for bash, `statusline.ps1` for PowerShell) into `~/.claude/cc-statusline/`.
2. Deep-merges a `statusLine` block into your `~/.claude/settings.json`:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node /home/you/.claude/cc-statusline/launcher.cjs render",
       "refreshInterval": 30
     }
   }
   ```

Only the `statusLine` key is touched — every other top-level key and nested object in your existing `settings.json` is preserved as-is. Before writing, the installer copies your current `settings.json` to `settings.json.bak` in the same directory, so you always have a one-step way back.

## How it works

The launcher (`bin/cc-statusline.cjs`) is a single self-contained file — it uses only Node built-ins, so copying just that file plus `scripts/` into `~/.claude/cc-statusline/` produces a fully working runtime with no dependency on the npm package or `node_modules` still being around. It runs in two modes:

- **setup mode** (`cc-statusline setup`, or a bare `npx cc-statusline` from a terminal) — installs the runtime and merges `settings.json` as described above.
- **render mode** (`cc-statusline render`, or a bare invocation when stdin is piped) — this is what Claude Code actually invokes on every status line refresh. It reads the JSON Claude Code pipes in on stdin, detects `process.platform`, and spawns the matching script with `stdio: 'inherit'` so the JSON flows straight through and the rendered ANSI output flows straight back out.

A few deliberate details carried over from hard-won experience running this on real machines:

- **Forward slashes in the installed command.** Claude Code runs `statusLine.command` through a POSIX-style shell even on Windows. A raw Windows backslash path gets escape-collapsed there and the status line just goes blank with no error. The installer always writes the launcher path with `/` separators, regardless of platform.
- **BOM-free `settings.json` writes.** The file is written with plain `utf8` encoding, never `utf8` with a byte-order mark — a BOM at the front of the file breaks Claude Code's JSON parser.
- **`pwsh` first, `powershell.exe` as fallback, on Windows.** The ported `.ps1` script uses PowerShell 7's `` `e `` ANSI escape syntax for color. Windows PowerShell 5.1 renders that literally instead of as an escape code, so render mode tries `pwsh` first and only falls back to `powershell.exe` if `pwsh` isn't on `PATH`.

## Where the scripts come from

`cc-statusline` doesn't vendor a copy of the underlying status line logic. `scripts/fetch-source.js` pulls `statusline-command.sh` and `statusline-command.ps1` fresh from [`vizi0uz/claude-statusline`](https://github.com/vizi0uz/claude-statusline) at build time — it runs in `prepack`, `prepublishOnly`, and in CI, never on an end user's machine. The fetched files land in `scripts/statusline.sh` and `scripts/statusline.ps1`, which are gitignored in this repo (they're build output) but included in the published npm tarball via the `files` whitelist in `package.json`.

## Dependencies

- **Node.js ≥ 14** to run the launcher itself.
- **macOS / Linux:** `bash`, [`jq`](https://jqlang.github.io/jq/), and `curl` for the `.sh` script.
- **Windows:** PowerShell 7 (`pwsh`) is recommended for correct color rendering; Windows PowerShell 5.1 (`powershell.exe`) works as a fallback but renders ANSI escapes as literal text.

## Identity flag and IP refresh

The underlying status line scripts support an optional "identity" feature that displays your public IP, refreshed via `api.ipify.org`. That feature, its configuration, and its privacy implications are documented in the upstream [`claude-statusline`](https://github.com/vizi0uz/claude-statusline) repo — `cc-statusline` just installs and runs whatever version of the scripts it fetched, so refer there for the authoritative configuration reference. It's off by default, and CI for this package always runs with it disabled to keep test runs hermetic.

## Uninstall

1. Restore your previous settings from the backup:
   ```
   cp ~/.claude/settings.json.bak ~/.claude/settings.json
   ```
   (On Windows: `Copy-Item $HOME\.claude\settings.json.bak $HOME\.claude\settings.json`.)
2. Remove the installed runtime:
   ```
   rm -rf ~/.claude/cc-statusline
   ```
   (On Windows: `Remove-Item -Recurse -Force $HOME\.claude\cc-statusline`.)
3. Restart Claude Code.

## License

MIT
