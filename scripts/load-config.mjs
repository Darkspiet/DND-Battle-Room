import { readFileSync } from 'node:fs';
// JSON avoids shell evaluation and dotenv/systemd escaping disagreements.
if (process.env.DND_CONFIG_FILE) {
  let config;
  try { config = JSON.parse(readFileSync(process.env.DND_CONFIG_FILE, 'utf8')); }
  catch { throw new Error('Cannot load protected server configuration. Check the JSON file and permissions.'); }
  for (const [key, value] of Object.entries(config)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string') throw new Error('Invalid server configuration.');
    if (!key.startsWith("INSTALL_")) process.env[key] = value;
  }
}
