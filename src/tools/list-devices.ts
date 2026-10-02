/**
 * Prints every WAVE camera and web page, as a starting point for config.json.
 * Output contains real names and ids: it goes to your terminal only.
 * Don't paste it into issues, commits, or test fixtures.
 */
import { loadDotEnv, loadEnv } from "../config.js";
import { waveClientFromEnv } from "../wave/client.js";

loadDotEnv();
const env = loadEnv();
const wave = waveClientFromEnv(env);

try {
  const devices = (await wave.listDevices()).sort((a, b) => a.name.localeCompare(b.name));
  console.log("CAMERAS (ids go in rooms / defaultCameras)\n");
  const width = Math.max(4, ...devices.map((d) => d.name.length));
  for (const d of devices) console.log(`  ${d.name.padEnd(width)}  ${d.id}`);

  try {
    const pages = (await wave.listWebPages()).sort((a, b) => a.name.localeCompare(b.name));
    console.log("\nWEB PAGES (the board's id goes in boardWebPageId)\n");
    if (pages.length === 0) console.log("  (none)");
    const w = Math.max(4, ...pages.map((p) => p.name.length));
    for (const p of pages) console.log(`  ${p.name.padEnd(w)}  ${p.id}  ${p.url}`);
  } catch (err) {
    console.log(`\nWEB PAGES: couldn't list them (${(err as Error).message}). Cameras above are unaffected.`);
  }

  console.error(`\n${devices.length} camera(s). Copy the ids you need into config.json (gitignored), braces included.`);
} finally {
  await wave.logout();
}
