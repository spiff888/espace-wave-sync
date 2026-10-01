/**
 * Prints every WAVE camera as a starting point for config.json's room map.
 * Output contains real device names and ids: it goes to your terminal only.
 * Don't paste it into issues, commits, or test fixtures.
 */
import { loadEnv } from "../config.js";
import { WaveClient } from "../wave/client.js";

const env = loadEnv();
const wave = new WaveClient({ baseUrl: env.WAVE_URL, username: env.WAVE_USERNAME, password: env.WAVE_PASSWORD });

try {
  const devices = (await wave.listDevices()).sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(4, ...devices.map((d) => d.name.length));
  for (const d of devices) console.log(`${d.name.padEnd(width)}  ${d.id}`);
  console.error(`\n${devices.length} device(s). Copy the ids you need into config.json (gitignored).`);
} finally {
  await wave.logout();
}
