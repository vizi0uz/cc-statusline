'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const p = path.join(os.homedir(), '.claude', 'settings.json');
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!s.statusLine || !s.statusLine.command) throw new Error('statusLine not intact');
if (s.env && Object.prototype.hasOwnProperty.call(s.env, 'CLAUDE_STATUSLINE_SHOW_IDENTITY')) {
  throw new Error('--no-show-identity did not clear env.CLAUDE_STATUSLINE_SHOW_IDENTITY');
}
console.log('identity cleared ok');
