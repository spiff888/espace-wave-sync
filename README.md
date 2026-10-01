# espace-wave-sync

Keeps a Wisenet WAVE layout in sync with today's eSPACE events. Each campus gets one shared "Daily View" layout. It shows the campus board from [espace-events-kiosk](https://github.com/spiff888/espace-events-kiosk) plus the cameras for rooms that have an event now or starting soon. Each event is also bookmarked on its room's cameras, so footage is easy to find later.

```
espace-events-kiosk  --GET /api/v1/events-->  espace-wave-sync  --REST v3-->  WAVE server
     (board page)                               (this repo)                  (layout, bookmarks)
```

> **Status:** early. Built against WAVE 6.0.x, REST API v3. Anything not yet confirmed on a live server is marked `VERIFY` in `src/wave/client.ts`.

## How it decides what to show

Every cycle (default: 60 s), for each campus:

1. An event is **live** from 15 min before its start until 5 min after its end (`lookaheadMinutes`, `graceMinutes`).
2. Cameras for live events come first, earliest event first, then the campus's `defaultCameras`. The list is capped at `maxCameraTiles` (default 8).
3. The board takes tile 0. Cameras that stay on screen **keep their tile**, so the TVs don't reshuffle; new cameras fill the gaps.
4. When an event starts, it's bookmarked once on each of its room's cameras.

If the kiosk can't be reached, layouts are left exactly as they are.

## Setup

1. **Create a local WAVE user** for this service, not a cloud user and not an admin. It needs rights to edit the shared layouts and create bookmarks, nothing more.
2. **Export the WAVE server's certificate** to `wave-ca.pem` (command in `.env.example`) and set `WAVE_CA_CERT`. WAVE's self-signed certificate is issued to the server ID, not its IP, so also set `WAVE_TLS_SERVERNAME` to that ID. TLS verification is always on, and there's no option to turn it off.
3. Copy the examples and fill them in. Both copies are gitignored:
   ```sh
   cp .env.example .env
   cp config.example.json config.json
   npm install          # also enables the pre-commit hook
   ```
4. List your cameras to fill in `config.json`:
   ```sh
   npm run list-devices
   ```
   Room names in `config.json` must match eSPACE room names exactly.
5. Do a dry run, which changes nothing:
   ```sh
   npm run once
   ```
6. When the planned changes look right, set `DRY_RUN=false` in `.env`. Then run it with `npm run build && npm start`, or with Docker (`compose.example.yml`).

## Requirements on the kiosk

`GET {KIOSK_URL}/api/v1/events?date=today` must return an array of events (or `{ "events": [...] }`), each with:

| field | example |
|---|---|
| `id` | `"48213"` |
| `title` | `"Sunday Service"` |
| `room` | `"Main Auditorium"` |
| `start` / `end` | `"2026-10-04T10:00:00-07:00"` |

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
