import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const api = require('./bin/cc-statusline.cjs');
export const {
  deepMerge, toPosixPath, resolveScript, buildStatusLineCommand,
  claudeDir, setup, render, main,
} = api;
export default api;
