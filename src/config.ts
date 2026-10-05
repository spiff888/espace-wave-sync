import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Loads ./.env (or $ENV_FILE) into process.env if present. Variables already
 * set in the environment win, so Docker's env_file and shell exports still work.
 */
export function loadDotEnv(path = process.env.ENV_FILE ?? ".env"): void {
  if (!existsSync(path)) return;
  const before = { ...process.env };
  process.loadEnvFile(path);
  Object.assign(process.env, before);
}

const CampusSchema = z.object({
  name: z.string().min(1),
  /** The campus key in the kiosk's config.json, i.e. the <campus> in /board/<campus>. */
  kioskCampus: z.string().regex(/^[\w-]+$/, "use the kiosk's campus key, e.g. the 'main' in /board/main"),
  layoutName: z.string().min(1),
  /** WAVE web page resource id for the campus board (the kiosk URL registered in WAVE). */
  boardWebPageId: z.string().min(1).optional(),
  maxCameraTiles: z.number().int().min(1).max(36).default(8),
  gridColumns: z.number().int().min(1).max(6).default(3),
  defaultCameras: z.array(z.string().min(1)).default([]),
  /** eSPACE room name -> WAVE camera (device) ids. Names must match eSPACE exactly (the kiosk feed sends them unstripped). */
  rooms: z.record(z.string(), z.array(z.string().min(1))),
});

const ConfigSchema = z.object({
  lookaheadMinutes: z.number().int().min(0).max(240).default(15),
  graceMinutes: z.number().int().min(0).max(120).default(5),
  bookmarks: z
    .object({
      enabled: z.boolean().default(true),
      tags: z.array(z.string()).default(["espace"]),
    })
    // Zod 4: prefault parses {} through the schema so the inner defaults apply.
    .prefault({}),
  /** All-day bookings: shown after timed events (before defaults); not bookmarked unless asked. */
  allDayEvents: z
    .object({
      show: z.boolean().default(true),
      bookmark: z.boolean().default(false),
    })
    .prefault({}),
  campuses: z.array(CampusSchema).min(1),
});

export type CampusConfig = z.infer<typeof CampusSchema>;
export type SyncConfig = z.infer<typeof ConfigSchema>;

const EnvSchema = z.object({
  WAVE_URL: z.string().url(),
  WAVE_USERNAME: z.string().min(1),
  WAVE_PASSWORD: z.string().min(1),
  /** PEM file with the WAVE server certificate(s) to trust. */
  WAVE_CA_CERT: z.string().min(1).optional(),
  /** Name the certificate was issued to (WAVE's self-signed certs use the server ID). Lets WAVE_URL be an IP. */
  WAVE_TLS_SERVERNAME: z.string().min(1).optional(),
  KIOSK_URL: z.string().url(),
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),
  DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  CONFIG_PATH: z.string().default("./config.json"),
  STATE_PATH: z.string().default("./state.json"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${fields}. See .env.example.`);
  }
  return parsed.data;
}

export function parseConfig(raw: unknown): SyncConfig {
  const config = ConfigSchema.parse(raw);
  for (const campus of config.campuses) {
    const total = campus.maxCameraTiles + (campus.boardWebPageId ? 1 : 0);
    const rowsNeeded = Math.ceil(total / campus.gridColumns);
    if (rowsNeeded > 6) {
      throw new Error(`${campus.name}: ${total} tiles in ${campus.gridColumns} columns is too tall.`);
    }
  }
  return config;
}

export function loadConfig(path: string): SyncConfig {
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}
