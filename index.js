// Entry shim for hosts (e.g. Pterodactyl Bun egg) that hard-code MAIN_FILE
// to `index.js` and don't let users override it. Bun runs .ts directly,
// so this just re-imports the real entry.
import './src/index.ts';
