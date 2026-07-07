#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ---- pure helpers (also exported for programmatic use) ----

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Recursive merge: where both sides hold a plain object, merge deeply; else
// source wins. Keys present only in target are never touched.
function deepMerge(target, source) {
  const out = isPlainObject(target) ? Object.assign({}, target) : {};
  for (const key of Object.keys(source)) {
    if (isPlainObject(out[key]) && isPlainObject(source[key])) {
      out[key] = deepMerge(out[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

// Claude Code runs statusLine.command through a POSIX-style shell even on
// Windows, where backslashes escape-collapse and the command silently fails
// (blank status line). Always emit forward slashes in the command path.
function toPosixPath(p) {
  return p.replace(/\\/g, '/');
}

// os.homedir() resolves %USERPROFILE% on Windows and $HOME on unix.
function claudeDir() {
  return path.join(os.homedir(), '.claude');
}

function resolveScript() {
  const name = process.platform === 'win32' ? 'statusline.ps1' : 'statusline.sh';
  const candidates = [
    path.join(__dirname, 'scripts', name),        // copied layout (~/.claude/cc-statusline/)
    path.join(__dirname, '..', 'scripts', name),  // in-package layout (<pkg>/bin/)
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return candidates[0];
}

// Bare "node" only resolves in shells that source the same PATH setup() saw
// (nvm/conda/volta all gate node behind shell activation). Claude Code spawns
// statusLine.command directly, without that activation, so the literal word
// "node" can go unresolved even though this very process is running node.
// Pin to the exact binary that's running right now instead, quoted so paths
// with spaces (very common on Windows, e.g. "Program Files") survive the
// POSIX-style shell Claude Code uses to run the command.
function buildStatusLineCommand(launcherPath) {
  const nodePath = toPosixPath(process.execPath);
  return '"' + nodePath + '" "' + toPosixPath(launcherPath) + '" render';
}

// ---- render mode ----

function render() {
  const script = resolveScript();
  let result;
  if (process.platform === 'win32') {
    // Prefer pwsh (PS7): the .ps1 uses `e ANSI escapes that PS 5.1 renders
    // literally. Fall back to powershell.exe only if pwsh is missing.
    result = spawnSync('pwsh', ['-NoProfile', '-File', script], { stdio: 'inherit' });
    if (result.error && result.error.code === 'ENOENT') {
      result = spawnSync('powershell.exe', ['-NoProfile', '-File', script], { stdio: 'inherit' });
    }
  } else {
    result = spawnSync('bash', [script], { stdio: 'inherit' });
  }
  process.exit(result.status == null ? 0 : result.status);
}

// ---- setup mode ----

function copyRuntime(destDir) {
  fs.mkdirSync(path.join(destDir, 'scripts'), { recursive: true });
  fs.copyFileSync(__filename, path.join(destDir, 'launcher.cjs'));   // self-copy launcher
  const srcScriptsDir = fs.existsSync(path.join(__dirname, '..', 'scripts'))
    ? path.join(__dirname, '..', 'scripts')
    : path.join(__dirname, 'scripts');
  for (const f of ['statusline.sh', 'statusline.ps1']) {
    const src = path.join(srcScriptsDir, f);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(destDir, 'scripts', f);
    fs.copyFileSync(src, dst);
    if (f.endsWith('.sh') && process.platform !== 'win32') {
      try { fs.chmodSync(dst, 0o755); } catch (_) {}
    }
  }
}

function setup() {
  const dir = claudeDir();
  const destDir = path.join(dir, 'cc-statusline');
  fs.mkdirSync(dir, { recursive: true });
  copyRuntime(destDir);

  const settingsPath = path.join(dir, 'settings.json');
  let existing = {};
  let backedUp = false;
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, settingsPath + '.bak');  // back up before writing
    backedUp = true;
    try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) { existing = {}; }
  }

  const launcherPath = path.join(destDir, 'launcher.cjs');
  const merged = deepMerge(existing, {
    statusLine: {
      type: 'command',
      command: buildStatusLineCommand(launcherPath),
      refreshInterval: 30,
    },
  });

  // utf8 write is BOM-free; a BOM breaks Claude Code's JSON parser.
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  process.stdout.write(
    'cc-statusline installed.\n' +
    '  runtime:  ' + destDir + '\n' +
    '  settings: ' + settingsPath + (backedUp ? ' (backup: settings.json.bak)' : '') + '\n' +
    'Restart Claude Code to load the new status line.\n'
  );
}

// ---- entry ----

function main(argv) {
  const arg = (argv[2] || '').toLowerCase();
  if (arg === 'render') return render();
  if (arg === 'setup' || arg === 'install') return setup();
  if (arg === '') {
    // Bare invocation: interactive (TTY) → install; piped without 'render' → render (safety net).
    return process.stdin.isTTY ? setup() : render();
  }
  process.stderr.write('Unknown command: ' + arg + '\nUsage: cc-statusline [setup|render]\n');
  process.exit(1);
}

if (require.main === module) { main(process.argv); }

module.exports = {
  deepMerge, toPosixPath, resolveScript, buildStatusLineCommand,
  claudeDir, setup, render, main,
};
