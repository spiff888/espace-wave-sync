import type { CampusConfig } from "./config.js";

export interface NamedResource {
  id: string;
  name: string;
}

/** WAVE ids come back with braces; config.json may have them or not. Compare without. */
export function normalizeId(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Renders a campus's room -> camera mapping as a Markdown table with camera
 * names instead of ids. Cameras are listed in config order, which is the order
 * tiles are filled in, so the first camera of each room is its priority camera.
 */
export function renderCameraTable(
  campus: CampusConfig,
  devices: NamedResource[],
  options: { unmappedRooms?: string[]; date?: string } = {},
): string {
  const byId = new Map(devices.map((d) => [normalizeId(d.id), d.name]));
  const missing: string[] = [];
  const name = (id: string): string => {
    const found = byId.get(normalizeId(id));
    if (found) return found;
    missing.push(id);
    return "⚠ not in WAVE";
  };

  const lines: string[] = [];
  lines.push(`### ${campus.name}`);
  lines.push("");
  lines.push(`Layout \`${campus.layoutName}\` · up to ${campus.maxCameraTiles} camera tiles · ${campus.gridColumns} columns`);
  if (options.date) lines.push(`Generated ${options.date} by \`npm run doc-cameras\`. Don't edit by hand; rerun after config changes.`);
  lines.push("");

  lines.push("| Room | Cameras (priority order) |");
  lines.push("|---|---|");
  const rooms = Object.entries(campus.rooms).sort(([a], [b]) => a.localeCompare(b));
  for (const [room, cams] of rooms) {
    const list = cams.length ? cams.map((id, i) => `${i + 1}. ${cell(name(id))}`).join("<br>") : "_no cameras_";
    lines.push(`| ${cell(room)} | ${list} |`);
  }

  lines.push("");
  lines.push("**Default cameras** (shown when tiles are free, in this order)");
  lines.push("");
  if (campus.defaultCameras.length === 0) lines.push("_none_");
  campus.defaultCameras.forEach((id, i) => lines.push(`${i + 1}. ${name(id)}`));

  if (options.unmappedRooms?.length) {
    lines.push("");
    lines.push("**Rooms with events today but not mapped**");
    lines.push("");
    for (const r of options.unmappedRooms) lines.push(`- ${r}`);
  }

  if (missing.length) {
    lines.push("");
    lines.push(`> [!warning] ${new Set(missing).size} camera id(s) in config.json weren't found in WAVE. Check \`npm run list-devices\`.`);
  }

  return lines.join("\n");
}
