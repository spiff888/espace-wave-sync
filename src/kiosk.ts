import { z } from "zod";

/**
 * Contract with espace-events-kiosk: GET {KIOSK_URL}/api/v1/events/<campus>
 * (see the kiosk README, "Integration feed"). Room names are eSPACE's originals,
 * times are ISO 8601 with offset.
 */
export const KioskEventSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  rooms: z.array(z.string()),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  allDay: z.boolean().optional(),
});

export type KioskEvent = z.infer<typeof KioskEventSchema>;

const FeedSchema = z.object({
  version: z.literal(1),
  campus: z.string(),
  timezone: z.string(),
  date: z.string(),
  stale: z.boolean(),
  events: z.array(KioskEventSchema),
});

export type KioskFeed = z.infer<typeof FeedSchema>;

export async function fetchTodaysEvents(kioskUrl: string, campus: string, timeoutMs = 10_000): Promise<KioskFeed> {
  const url = new URL(`/api/v1/events/${encodeURIComponent(campus)}`, kioskUrl);
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 404) throw new Error(`Kiosk has no campus "${campus}" (or is too old for /api/v1/events). Check kioskCampus in config.json.`);
  if (!res.ok) throw new Error(`Kiosk API returned HTTP ${res.status}`);
  return FeedSchema.parse(await res.json());
}
