#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
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

// ---- interactive prompt ----

// Arrow-key/number-key single-select prompt, built on Node's built-in
// `readline` only — no dependency, so the self-copied launcher.cjs never
// needs node_modules alongside it. Non-TTY (CI, piped/scripted invocations)
// resolves immediately to the default without touching stdin, so this never
// blocks a non-interactive run.
function selectPrompt(message, choices, defaultIndex) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(choices[defaultIndex].value);
  }
  return new Promise((resolve) => {
    let idx = defaultIndex;
    let firstDraw = true;

    function draw() {
      if (!firstDraw) {
        readline.moveCursor(process.stdout, 0, -(choices.length + 1));
        readline.cursorTo(process.stdout, 0);
        readline.clearScreenDown(process.stdout);
      }
      firstDraw = false;
      process.stdout.write(message + '\n');
      choices.forEach((choice, i) => {
        process.stdout.write((i === idx ? '> ' : '  ') + choice.label + '\n');
      });
    }

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.pause();
    }

    function finish() {
      cleanup();
      resolve(choices[idx].value);
    }

    function onKeypress(str, key) {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(130);
        return;
      }
      if (key.name === 'up') { idx = (idx - 1 + choices.length) % choices.length; draw(); }
      else if (key.name === 'down') { idx = (idx + 1) % choices.length; draw(); }
      else if (key.name === 'return') { finish(); }
      else if (/^[1-9]$/.test(str || '') && Number(str) <= choices.length) {
        idx = Number(str) - 1;
        finish();
      }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKeypress);
    draw();
  });
}

// ---- render mode ----

function render() {
  const script = resolveScript();
  let result;
  if (process.platform === 'win32') {
    // Prefer pwsh (PowerShell 7): measured ~2.8x faster to render than Windows
    // PowerShell 5.1 (~0.5s vs ~1.4s per spawn on Win11), even when pwsh is the
    // MSIX/Store build -- the AppX activation cost is negligible once warm, and
    // the status line re-spawns on every render. The .ps1 is pure ASCII and
    // renders identically on both, so powershell.exe (always preinstalled) is a
    // correct, if slower, fallback when pwsh isn't on PATH.
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

// --show-identity / --no-show-identity are unambiguous, explicit intent and
// always win. With neither flag: an interactive TTY asks; a non-TTY run
// (CI, scripted installs) silently keeps the privacy-safe default (off) with
// no prompt, so existing non-interactive callers see no behavior change.
function parseIdentityFlag(argv) {
  if (argv.indexOf('--show-identity') !== -1) return true;
  if (argv.indexOf('--no-show-identity') !== -1) return false;
  return undefined;
}

async function setup(argv) {
  argv = argv || [];
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

  const explicitIdentity = parseIdentityFlag(argv);
  let showIdentity;
  let identityStatus;
  if (explicitIdentity !== undefined) {
    showIdentity = explicitIdentity;
  } else if (process.stdin.isTTY) {
    showIdentity = await selectPrompt(
      'Show Plan/Email/LAN/WAN IP in the statusline?',
      [
        { label: 'No (recommended — keep off on shared/remote machines)', value: false },
        { label: 'Yes (trusted machine only)', value: true },
      ],
      0,
    );
  } else {
    showIdentity = false;
  }

  const launcherPath = path.join(destDir, 'launcher.cjs');
  const mergeSource = {
    statusLine: {
      type: 'command',
      command: buildStatusLineCommand(launcherPath),
      refreshInterval: 30,
    },
  };

  if (showIdentity) {
    mergeSource.env = { CLAUDE_STATUSLINE_SHOW_IDENTITY: '1' };
    identityStatus = 'enabled';
  } else if (explicitIdentity === false) {
    // Explicit opt-out is unambiguous intent: actively clear a prior "Yes",
    // unlike the interactive "No" / silent default below, which never touch
    // env at all so a value set by hand (outside this tool) isn't clobbered.
    if (existing.env && Object.prototype.hasOwnProperty.call(existing.env, 'CLAUDE_STATUSLINE_SHOW_IDENTITY')) {
      existing = Object.assign({}, existing, { env: Object.assign({}, existing.env) });
      delete existing.env.CLAUDE_STATUSLINE_SHOW_IDENTITY;
      if (Object.keys(existing.env).length === 0) delete existing.env;
      identityStatus = 'disabled (env var removed)';
    } else {
      identityStatus = 'disabled (default, unchanged)';
    }
  } else {
    identityStatus = 'disabled (default, unchanged)';
  }

  const merged = deepMerge(existing, mergeSource);

  // utf8 write is BOM-free; a BOM breaks Claude Code's JSON parser.
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  process.stdout.write(
    'cc-statusline installed.\n' +
    '  runtime:   ' + destDir + '\n' +
    '  settings:  ' + settingsPath + (backedUp ? ' (backup: settings.json.bak)' : '') + '\n' +
    '  identity:  ' + identityStatus + '\n' +
    'Restart Claude Code to load the new status line.\n'
  );
}

async function uninstall(argv) {
  argv = argv || [];
  const dir = claudeDir();
  const destDir = path.join(dir, 'cc-statusline');
  const settingsPath = path.join(dir, 'settings.json');

  const skipConfirm = argv.indexOf('--yes') !== -1 || argv.indexOf('-y') !== -1;
  let confirmed = true;
  if (!skipConfirm) {
    if (!process.stdin.isTTY) {
      process.stderr.write('Refusing to uninstall non-interactively without --yes.\n');
      process.exit(1);
      return;
    }
    confirmed = await selectPrompt(
      'Uninstall cc-statusline? This removes the statusLine config and runtime files.',
      [
        { label: 'No, cancel', value: false },
        { label: 'Yes, uninstall', value: true },
      ],
      0,
    );
  }

  if (!confirmed) {
    process.stdout.write('Uninstall cancelled.\n');
    return;
  }

  let settingsChanged = false;
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, settingsPath + '.bak');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) { existing = {}; }

    // Only remove statusLine if it's ours — guards against clobbering a
    // config the user later repointed at something unrelated.
    const launcherPath = toPosixPath(path.join(destDir, 'launcher.cjs'));
    if (existing.statusLine && typeof existing.statusLine.command === 'string' &&
        existing.statusLine.command.indexOf(launcherPath) !== -1) {
      delete existing.statusLine;
      settingsChanged = true;
    }
    // env is intentionally left untouched — see setup()'s no-clobber note.

    if (settingsChanged) {
      fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    }
  }

  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  process.stdout.write(
    'cc-statusline uninstalled.\n' +
    '  settings:  ' + (settingsChanged ? 'statusLine removed (backup: settings.json.bak)' : 'nothing of ours to remove') + '\n' +
    '  removed:   ' + destDir + '\n' +
    'Restart Claude Code to apply.\n'
  );
}

// ---- entry ----

function main(argv) {
  const arg = (argv[2] || '').toLowerCase();
  if (arg === 'render') return render();
  if (arg === 'setup' || arg === 'install') return setup(argv);
  if (arg === 'uninstall' || arg === 'remove') return uninstall(argv);
  if (arg === '' || arg.indexOf('--') === 0) {
    // Bare (or flags-only) invocation: interactive (TTY) → install; piped
    // without 'render' → render (safety net).
    return process.stdin.isTTY ? setup(argv) : render();
  }
  process.stderr.write('Unknown command: ' + arg + '\nUsage: cc-statusline [setup|uninstall|render]\n');
  process.exit(1);
}

if (require.main === module) {
  Promise.resolve(main(process.argv)).catch((err) => {
    process.stderr.write(String((err && err.stack) || err) + '\n');
    process.exit(1);
  });
}

module.exports = {
  deepMerge, toPosixPath, resolveScript, buildStatusLineCommand,
  claudeDir, setup, uninstall, selectPrompt, parseIdentityFlag, render, main,
};
