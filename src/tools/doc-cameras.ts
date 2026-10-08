/**
 * Prints each campus's room -> camera mapping as a Markdown table, with camera
 * names from WAVE instead of ids, for your internal documentation.
 * With --live, also lists rooms that have events today but aren't mapped.
 *
 * Output contains real room and camera names: paste it into private docs only,
 * never into issues, commits, or test fixtures.
 */
import { loadConfig, loadDotEnv, loadEnv } from "../config.js";
import { renderCameraTable } from "../camera-table.js";
import { fetchTodaysEvents } from "../kiosk.js";
import { unmappedRooms } from "../select.js";
import { waveClientFromEnv } from "../wave/client.js";

loadDotEnv();
const env = loadEnv();
const config = loadConfig(env.CONFIG_PATH);
const live = process.argv.includes("--live");
const date = new Date().toISOString().slice(0, 10);

const wave = waveClientFromEnv(env);
try {
  const devices = await wave.listDevices();
  const sections: string[] = [];
  for (const campus of config.campuses) {
    let unmapped: string[] | undefined;
    if (live) {
      try {
        const feed = await fetchTodaysEvents(env.KIOSK_URL, campus.kioskCampus);
        unmapped = unmappedRooms(campus, feed.events, config.allDayEvents.show);
      } catch (err) {
        console.error(`${campus.name}: couldn't reach the kiosk feed (${(err as Error).message}); skipping unmapped rooms.`);
      }
    }
    sections.push(renderCameraTable(campus, devices, { unmappedRooms: unmapped, date }));
  }
  console.log(sections.join("\n\n"));
} finally {
  await wave.logout();
}
