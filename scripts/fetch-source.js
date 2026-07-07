#!/usr/bin/env node
'use strict';

// Build-time only: pull the latest status line scripts from the upstream repo
// into scripts/. Outputs are gitignored and shipped via package.json "files".
// Runs in prepack / prepublishOnly and in CI — never on the end user's machine.

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'vizi0uz/claude-statusline';
const REF = process.env.CC_STATUSLINE_REF || 'master';
const SOURCES = [
  { url: 'https://raw.githubusercontent.com/' + REPO + '/' + REF + '/statusline-command.sh',  out: 'statusline.sh'  },
  { url: 'https://raw.githubusercontent.com/' + REPO + '/' + REF + '/statusline-command.ps1', out: 'statusline.ps1' },
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'cc-statusline-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetch(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('GET ' + url + ' -> HTTP ' + res.statusCode)); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  for (const { url, out } of SOURCES) {
    process.stdout.write('fetching ' + url + '\n');
    const body = await fetch(url);
    if (!body || body.length < 32) throw new Error('Empty/short body from ' + url);
    // LF for .sh (CRLF would break the shebang); CRLF for .ps1 (Windows convention).
    let content = body.replace(/\r\n/g, '\n');
    if (out.endsWith('.ps1')) content = content.replace(/\n/g, '\r\n');
    const dst = path.join(__dirname, out);
    fs.writeFileSync(dst, content, 'utf8');
    process.stdout.write('  wrote ' + dst + ' (' + content.length + ' bytes)\n');
  }
}

main().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
