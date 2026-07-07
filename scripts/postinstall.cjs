'use strict';
// chmod +x the bash script after install, non-Windows only. No-op if absent
// (e.g. dev install before fetch-source has run).
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') process.exit(0);
const sh = path.join(__dirname, 'statusline.sh');
try { if (fs.existsSync(sh)) fs.chmodSync(sh, 0o755); } catch (_) {}
