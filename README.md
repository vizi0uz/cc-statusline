# cc-statusline

[![scripts from · claude-statusline](https://img.shields.io/badge/scripts%20from-claude--statusline-blue)](https://github.com/vizi0uz/claude-statusline)

A portable, cross-platform status line for [Claude Code](https://claude.com/claude-code) — installed with a single command.

```
npx @viziouz/cc-statusline@latest
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

When run from a real terminal, setup also asks one question — whether to show Plan/Email/LAN/WAN IP in the statusline (see [Identity flag and IP refresh](#identity-flag-and-ip-refresh) below). Use arrow keys or press `1`/`2` to answer, or skip the prompt entirely with `--show-identity` / `--no-show-identity`.

## How it works

The launcher (`bin/cc-statusline.cjs`) is a single self-contained file — it uses only Node built-ins, so copying just that file plus `scripts/` into `~/.claude/cc-statusline/` produces a fully working runtime with no dependency on the npm package or `node_modules` still being around. It runs in two modes:

- **setup mode** (`cc-statusline setup`, or a bare `npx @viziouz/cc-statusline` from a terminal) — installs the runtime and merges `settings.json` as described above.
- **render mode** (`cc-statusline render`, or a bare invocation when stdin is piped) — this is what Claude Code actually invokes on every status line refresh. It reads the JSON Claude Code pipes in on stdin, detects `process.platform`, and spawns the matching script with `stdio: 'inherit'` so the JSON flows straight through and the rendered ANSI output flows straight back out.

A few deliberate details carried over from hard-won experience running this on real machines:

- **Forward slashes in the installed command.** Claude Code runs `statusLine.command` through a POSIX-style shell even on Windows. A raw Windows backslash path gets escape-collapsed there and the status line just goes blank with no error. The installer always writes the launcher path with `/` separators, regardless of platform.
- **BOM-free `settings.json` writes.** The file is written with plain `utf8` encoding, never `utf8` with a byte-order mark — a BOM at the front of the file breaks Claude Code's JSON parser.
- **`pwsh` first, `powershell.exe` as fallback, on Windows.** The ported `.ps1` script uses PowerShell 7's `` `e `` ANSI escape syntax for color. Windows PowerShell 5.1 renders that literally instead of as an escape code, so render mode tries `pwsh` first and only falls back to `powershell.exe` if `pwsh` isn't on `PATH`.

## Where the scripts come from

`cc-statusline` doesn't vendor a copy of the underlying status line logic. `scripts/fetch-source.js` pulls `statusline-command.sh` and `statusline-command.ps1` fresh from [`vizi0uz/claude-statusline`](https://github.com/vizi0uz/claude-statusline) at build time — it runs in `prepack`, `prepublishOnly`, and in CI, never on an end user's machine. The fetched files land in `scripts/statusline.sh` and `scripts/statusline.ps1`, which are gitignored in this repo (they're build output) but included in the published npm tarball via the `files` whitelist in `package.json`.

## Dependencies

- **Node.js ≥ 14.14** to run the launcher itself (the floor needed for `fs.rmSync`, used by `uninstall`). `setup` pins `statusLine.command` to the exact `node` binary that ran the installer (not the bare word `node`), since version managers like nvm/conda/volta only put `node` on `PATH` behind shell activation, which Claude Code's non-interactive spawn doesn't go through. If you later switch Node runtimes (a different `nvm use`, a renamed/removed conda env, etc.), rerun `npx @viziouz/cc-statusline@latest setup` to repoint it.
- **macOS / Linux:** `bash`, [`jq`](https://jqlang.github.io/jq/), and `curl` for the `.sh` script.
- **Windows:** PowerShell 7 (`pwsh`) is recommended for correct color rendering; Windows PowerShell 5.1 (`powershell.exe`) works as a fallback but renders ANSI escapes as literal text.

## Identity flag and IP refresh

The underlying status line scripts support an optional "identity" feature that displays your account Plan/Email plus LAN/public IP, refreshed periodically. That feature, its configuration, and its privacy implications are documented in the upstream [`claude-statusline`](https://github.com/vizi0uz/claude-statusline) repo — `cc-statusline` just installs and runs whatever version of the scripts it fetched, so refer there for the authoritative configuration reference. It's off by default, and CI for this package always runs with it disabled to keep test runs hermetic.

`setup` surfaces this as a one-question prompt (arrow keys or `1`/`2` to answer) on a real terminal, or you can skip the prompt entirely:

```
npx @viziouz/cc-statusline@latest setup --show-identity     # turn it on
npx @viziouz/cc-statusline@latest setup --no-show-identity   # turn it off (also clears a prior "Yes")
```

An explicit flag always wins over the prompt. With neither flag, a non-interactive run (CI, scripted installs) silently keeps it off — the same privacy-safe default as before this prompt existed.

## Uninstall

```
npx @viziouz/cc-statusline@latest uninstall
```

Asks for confirmation (arrow keys or `1`/`2`), then removes the `statusLine` block it added — only if it still points at this install's own launcher, so a `statusLine` you've since repointed elsewhere is left alone — and deletes `~/.claude/cc-statusline`. `env.CLAUDE_STATUSLINE_SHOW_IDENTITY` is left untouched either way, since it may be something you set independently of this tool. For scripted/non-interactive removal, pass `--yes` (uninstalling without a TTY and without `--yes` is refused rather than silently skipped or silently applied):

```
npx @viziouz/cc-statusline@latest uninstall --yes
```

If you'd rather do it by hand instead:

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
