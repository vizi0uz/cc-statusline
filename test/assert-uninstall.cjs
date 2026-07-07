'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const p = path.join(os.homedir(), '.claude', 'settings.json');
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
if (s.statusLine) throw new Error('statusLine not removed by uninstall');
if (s.theme !== 'dark') throw new Error('unrelated top-level key lost');
if (!s.env || s.env.CLAUDE_STATUSLINE_SHOW_IDENTITY !== '1') {
  throw new Error('uninstall cleared env.CLAUDE_STATUSLINE_SHOW_IDENTITY, but it should leave env untouched');
}
const runtimeDir = path.join(os.homedir(), '.claude', 'cc-statusline');
if (fs.existsSync(runtimeDir)) throw new Error('runtime dir not removed by uninstall');
console.log('uninstall ok: statusLine removed, env left untouched, runtime dir gone');
