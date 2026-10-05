/**
 * Validates config.json and shows what it maps. With --live, also asks the kiosk
 * for today's events and lists rooms that have events but aren't mapped.
 */
import { loadConfig, loadDotEnv } from "../config.js";
import { fetchTodaysEvents } from "../kiosk.js";
import { unmappedRooms } from "../select.js";

loadDotEnv();
const path = process.env.CONFIG_PATH ?? "./config.json";

let config;
try {
  config = loadConfig(path);
} catch (err) {
  const e = err as Error & { issues?: Array<{ path: PropertyKey[]; message: string }> };
  console.error(`${path} is not valid:`);
  if (e.issues) for (const i of e.issues) console.error(`  - ${i.path.join(".") || "(top level)"}: ${i.message}`);
  else console.error(`  ${e.message}`);
  process.exit(1);
}

console.log(`${path} is valid.\n`);
for (const c of config.campuses) {
  const rooms = Object.entries(c.rooms);
  console.log(`${c.name}  (kiosk campus "${c.kioskCampus}", layout "${c.layoutName}")`);
  console.log(`  board tile: ${c.boardWebPageId ? "yes" : "no (boardWebPageId not set)"}`);
  console.log(`  default cameras: ${c.defaultCameras.length}`);
  console.log(`  rooms mapped: ${rooms.length}`);
  for (const [room, cams] of rooms) console.log(`    ${room}  ->  ${cams.length} camera(s)`);
}

if (process.argv.includes("--live")) {
  const kioskUrl = process.env.KIOSK_URL;
  if (!kioskUrl) {
    console.error("\n--live needs KIOSK_URL in .env");
    process.exit(1);
  }
  for (const c of config.campuses) {
    try {
      const feed = await fetchTodaysEvents(kioskUrl, c.kioskCampus);
      const missing = unmappedRooms(c, feed.events, config.allDayEvents.show);
      console.log(`\n${c.name}: ${feed.events.length} event(s) today${feed.stale ? " (kiosk data is stale)" : ""}`);
      console.log(missing.length ? `  rooms with events today but not mapped:\n${missing.map((r) => `    - ${r}`).join("\n")}` : "  every room with an event today is mapped");
    } catch (err) {
      console.log(`\n${c.name}: couldn't reach the kiosk feed: ${(err as Error).message}`);
    }
  }
}
