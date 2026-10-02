/**
 * The only file that talks to WAVE. Written against REST v3 on WAVE 6.0.x
 * (the API docs on the server label v3 "VMS 6.0+").
 *
 * Every request/response shape that hasn't been confirmed against a live
 * server is marked VERIFY. Check those in the server's API tool
 * (https://<server>:7001/#/api-tool) and re-check after each WAVE upgrade.
 */

import { readFileSync } from "node:fs";
import { Agent, fetch } from "undici";
import type { Env } from "../config.js";
import type { LayoutItem, Rect } from "../plan.js";

export interface WaveDevice {
  id: string;
  name: string;
}

export interface WaveLayout {
  id: string;
  name: string;
  items?: LayoutItem[];
}

export interface BookmarkInput {
  name: string;
  description?: string;
  startTimeMs: number;
  durationMs: number;
  tags?: string[];
}

export class WaveApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    detail: string,
  ) {
    super(`WAVE ${method} ${path} -> HTTP ${status}${detail ? `: ${detail}` : ""}`);
  }
}

export interface WaveClientOptions {
  baseUrl: string;
  username: string;
  password: string;
  /** PEM text of certificate(s) to trust, in addition to the system store. */
  ca?: string;
  /** Certificate name to verify against when baseUrl is an IP. */
  tlsServername?: string;
  timeoutMs?: number;
}

/** TLS is always verified. These only change *what* it is verified against. */
export function waveClientFromEnv(env: Env): WaveClient {
  return new WaveClient({
    baseUrl: env.WAVE_URL,
    username: env.WAVE_USERNAME,
    password: env.WAVE_PASSWORD,
    ca: env.WAVE_CA_CERT ? readFileSync(env.WAVE_CA_CERT, "utf8") : undefined,
    tlsServername: env.WAVE_TLS_SERVERNAME,
  });
}

export class WaveClient {
  private token: string | undefined;
  private readonly timeoutMs: number;
  private readonly dispatcher: Agent | undefined;

  constructor(private readonly opts: WaveClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    if (opts.ca || opts.tlsServername) {
      this.dispatcher = new Agent({
        connect: {
          ...(opts.ca ? { ca: opts.ca } : {}),
          ...(opts.tlsServername ? { servername: opts.tlsServername } : {}),
          rejectUnauthorized: true,
        },
      });
    }
  }

  // --- auth ---------------------------------------------------------------

  async login(): Promise<void> {
    // VERIFY: response field name for the session token.
    const body = await this.raw<{ token?: string }>("POST", "/rest/v3/login/sessions", {
      username: this.opts.username,
      password: this.opts.password,
    });
    if (!body?.token) throw new Error("WAVE login succeeded but returned no token");
    this.token = body.token;
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    const token = this.token;
    this.token = undefined;
    // Best effort; sessions also expire on their own.
    await this.raw("DELETE", `/rest/v3/login/sessions/${encodeURIComponent(token)}`, undefined, token).catch(() => {});
  }

  // --- resources ----------------------------------------------------------

  async listDevices(): Promise<WaveDevice[]> {
    const rows = await this.request<Array<Record<string, unknown>>>("GET", "/rest/v3/devices");
    return rows.map((d) => ({ id: String(d.id), name: String(d.name ?? "") }));
  }

  /** Web pages registered in WAVE (e.g. the campus board). VERIFY: field names on 6.0.5. */
  async listWebPages(): Promise<Array<WaveDevice & { url: string }>> {
    const rows = await this.request<Array<Record<string, unknown>>>("GET", "/rest/v3/webPages");
    return rows.map((p) => ({ id: String(p.id), name: String(p.name ?? ""), url: String(p.url ?? "") }));
  }

  async listLayouts(): Promise<WaveLayout[]> {
    const rows = await this.request<Array<Record<string, unknown>>>("GET", "/rest/v3/layouts");
    return rows.map((l) => ({
      id: String(l.id),
      name: String(l.name ?? ""),
      items: Array.isArray(l.items) ? l.items.map(normalizeItem) : undefined,
    }));
  }

  async findLayoutByName(name: string): Promise<WaveLayout | undefined> {
    return (await this.listLayouts()).find((l) => l.name === name);
  }

  /** Shared layout (empty parentId). Required fields per API docs: name, items, fixedWidth, fixedHeight. */
  async createSharedLayout(name: string, columns: number, rows: number): Promise<WaveLayout> {
    const created = await this.request<Record<string, unknown> | undefined>("POST", "/rest/v3/layouts", {
      name,
      parentId: "",
      items: [],
      fixedWidth: columns,
      fixedHeight: rows,
    });
    // VERIFY: whether the reply includes the new id. If not, look it up by name.
    const id = created && typeof created === "object" && !Array.isArray(created) && created.id ? String(created.id) : undefined;
    if (id) return { id, name, items: [] };
    const found = await this.findLayoutByName(name);
    if (!found) throw new Error(`created layout "${name}" but couldn't find it afterwards`);
    return { ...found, items: found.items ?? [] };
  }

  async getLayoutItems(layoutId: string): Promise<LayoutItem[]> {
    // VERIFY: GET on the items collection. Falls back to the embedded items on the layout.
    try {
      const rows = await this.request<Array<Record<string, unknown>>>("GET", `/rest/v3/layouts/${layoutId}/items`);
      return rows.map(normalizeItem);
    } catch (err) {
      if (!(err instanceof WaveApiError) || err.status !== 404) throw err;
      const layout = (await this.listLayouts()).find((l) => l.id === layoutId);
      return layout?.items ?? [];
    }
  }

  async addLayoutItem(layoutId: string, resourceId: string, rect: Rect): Promise<void> {
    // VERIFY: whether the server assigns the item id or expects one.
    await this.request("POST", `/rest/v3/layouts/${layoutId}/items`, { resourceId, ...rect });
  }

  async removeLayoutItem(layoutId: string, itemId: string): Promise<void> {
    await this.request("DELETE", `/rest/v3/layouts/${layoutId}/items/${itemId}`);
  }

  async createBookmark(deviceId: string, b: BookmarkInput): Promise<void> {
    await this.request("POST", `/rest/v3/devices/${deviceId}/bookmarks`, b);
  }

  // --- transport ----------------------------------------------------------

  /** Authenticated request; logs in on first use and once more on a 401. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token) await this.login();
    try {
      return await this.raw<T>(method, path, body, this.token);
    } catch (err) {
      if (err instanceof WaveApiError && err.status === 401) {
        await this.login();
        return this.raw<T>(method, path, body, this.token);
      }
      throw err;
    }
  }

  private async raw<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const res = await fetch(new URL(path, this.opts.baseUrl), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
      dispatcher: this.dispatcher,
    });
    const text = await res.text();
    if (!res.ok) {
      // Error text from WAVE is short and safe to log; request bodies (which may hold the password) never are.
      throw new WaveApiError(method, path, res.status, text.slice(0, 200));
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

function normalizeItem(raw: unknown): LayoutItem {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    resourceId: String(r.resourceId ?? ""),
    left: Number(r.left ?? NaN),
    top: Number(r.top ?? NaN),
    right: Number(r.right ?? NaN),
    bottom: Number(r.bottom ?? NaN),
  };
}
