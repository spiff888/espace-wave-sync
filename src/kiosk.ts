import { z } from "zod";

/**
 * Contract with espace-events-kiosk: GET {KIOSK_URL}/api/v1/events?date=today
 * Times are ISO 8601 with offset.
 */
export const KioskEventSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  room: z.string(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

export type KioskEvent = z.infer<typeof KioskEventSchema>;

const ResponseSchema = z.union([
  z.array(KioskEventSchema),
  z.object({ events: z.array(KioskEventSchema) }).transform((r) => r.events),
]);

export async function fetchTodaysEvents(kioskUrl: string, timeoutMs = 10_000): Promise<KioskEvent[]> {
  const url = new URL("/api/v1/events?date=today", kioskUrl);
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Kiosk API returned HTTP ${res.status}`);
  return ResponseSchema.parse(await res.json());
}
