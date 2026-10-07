# espace-wave-sync

Keeps a Wisenet WAVE layout in sync with today's eSPACE events. Each campus gets one shared "Daily View" layout. It shows the campus board from [espace-events-kiosk](https://github.com/spiff888/espace-events-kiosk) plus the cameras for rooms that have an event now or starting soon. Each event is also bookmarked on its room's cameras, so footage is easy to find later.

```
espace-events-kiosk  --GET /api/v1/events-->  espace-wave-sync  --REST v3-->  WAVE server
     (board page)                               (this repo)                  (layout, bookmarks)
```

> **Status:** early, but running in production at one site on WAVE 6.0.5 (REST API v3). Anything not yet confirmed on a live server is marked `VERIFY` in `src/wave/client.ts`.

## How it decides what to show

Every cycle (`SYNC_INTERVAL_SECONDS`, default 60), for each campus:

1. An event is **live** from 15 min before its start until 5 min after its end (`lookaheadMinutes`, `graceMinutes`).
2. Priority: timed events, then all-day events, then the campus's `defaultCameras`, capped at `maxCameraTiles` (default 8, up to 36). When events want more tiles than fit, they **take turns**: every event's 1st camera, then every event's 2nd, and so on (events by start time, cameras in `config.json` order, so list each room's best camera first).
3. If `boardWebPageId` is set, the board takes tile 0. Cameras that stay on screen **keep their tile**, so the TVs don't reshuffle; new cameras fill the gaps.
4. When an event starts, it's bookmarked once on each of its room's cameras. All-day events aren't bookmarked unless `allDayEvents.bookmark` is `true`; set `allDayEvents.show` to `false` to ignore them entirely.

If the kiosk can't be reached, layouts are left exactly as they are. Each camera's bookmark is created independently, so one failure doesn't block the rest, and an error that repeats every cycle is logged once (plus a line when it clears).

## Setup

1. **Create a local WAVE user** for this service (not a cloud user), and have an admin create the shared layout(s) named in `config.json`, since non-admins can't create shared layouts.
   - On WAVE 6.0.5, a Viewer with every right on that one layout still gets `403 not permitted to modify` when adding or removing tiles, and can't bookmark cameras that aren't on the layout. **Power User** works. If you find a narrower role that does, please open an issue.
   - Whatever role you use: keep the user local-only, give it a long unique password, and `chmod 600 .env`.
2. **Export the WAVE server's certificate** to `wave-ca.pem` (command in `.env.example`) and set `WAVE_CA_CERT`. WAVE's self-signed certificate is issued to the server ID, not its IP, so also set `WAVE_TLS_SERVERNAME` to that ID. TLS verification is always on, and there's no option to turn it off.
3. Copy the examples and fill them in. Both copies are gitignored:
   ```sh
   cp .env.example .env
   cp config.example.json config.json
   npm install          # also enables the pre-commit hook
   ```
4. List your cameras and WAVE web pages to fill in `config.json`:
   ```sh
   npm run list-devices
   npm run check-config      # validates config.json
   ```
   Room names in `config.json` must match eSPACE room names exactly. A room can share cameras with other rooms, and a room with no cameras can be mapped to `[]` so it stops showing up as unmapped.
5. Do a dry run, which changes nothing:
   ```sh
   npm run once
   ```
6. When the planned changes look right, set `DRY_RUN=false` in `.env`. Then run it with `npm run build && npm start`, or with Docker (`compose.example.yml`). If the kiosk runs on the same machine as the container, set `KIOSK_URL=http://host.docker.internal:<port>`, because `localhost` inside the container is the container itself.

## Requirements on the kiosk

Needs an `espace-events-kiosk` version with the integration feed, `GET {KIOSK_URL}/api/v1/events/<campus>` (documented in the kiosk README). Set each campus's `kioskCampus` to its key in the kiosk's config (the `main` in `/board/main`).

The feed sends eSPACE's original room names, before the kiosk's `stripRooms` display tweaks, so the keys under `rooms` in `config.json` must match eSPACE exactly, e.g. `Meeting Room A, Room 101`.

Check your mapping against today's real events:

```sh
npm run check-config -- --live
```

It lists rooms that have events today but aren't mapped yet. The running service logs the same list whenever it changes.

## Keeping site data out of git

This repo is meant to be shareable, so nothing specific to your site belongs in it:

- Server addresses, credentials, camera ids, and room names live only in `.env` and `config.json`.
- Tests use invented data. Never commit responses captured from a real server.
- The pre-commit hook blocks those files, private IPs, and secrets. It uses [gitleaks](https://github.com/gitleaks/gitleaks) when installed (`brew install gitleaks`), with a basic fallback check otherwise.

Before publishing, scan the full history:

```sh
gitleaks detect --config .gitleaks.toml --redact
```

## Development

```sh
npm test          # selection and layout-diff logic, no WAVE needed
npm run typecheck
```

## License

Licensed under the GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
