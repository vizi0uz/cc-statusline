'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const p = path.join(os.homedir(), '.claude', 'settings.json');
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!s.statusLine || !s.statusLine.command) throw new Error('statusLine not intact');
if (!s.env || s.env.CLAUDE_STATUSLINE_SHOW_IDENTITY !== '1') throw new Error('env.CLAUDE_STATUSLINE_SHOW_IDENTITY not set to "1"');
console.log('identity enabled ok:', s.env.CLAUDE_STATUSLINE_SHOW_IDENTITY);
