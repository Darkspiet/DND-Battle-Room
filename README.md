# DND Battle Room

A browser tabletop for DND-style combat rooms.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current v1

- Create or join a room by code.
- Nickname plus color guest identity.
- First visitor to a room becomes DM.
- Configurable square battle grid.
- Draggable tokens with owner-colored rings.
- DM can manage every token; players control their own tokens.
- Drawing mode for quick wall/marker lines.
- Dice roller with public/private rolls.
- Player bar with latest visible roll.
- Local realtime sync across browser tabs through `BroadcastChannel`.

## Backend path

The UI and state shape are ready for a hosted realtime backend. See `supabase/schema.sql`
for the tables and policies to use when wiring Supabase Realtime and Presence.

## Production service on this LXC

This app is configured to run as a persistent systemd service on this LXC.

```bash
systemctl status dnd-battle-room
journalctl -u dnd-battle-room -f
systemctl restart dnd-battle-room
```

The installed service uses the custom Next.js server with the built-in WebSocket sync endpoint:

```bash
HOSTNAME=0.0.0.0 PORT=3000 npm run start
```

That makes the app available from this LXC at:

```text
http://127.0.0.1:3000
http://192.168.178.174:3000
```

If the app changes, rebuild and restart the service:

```bash
npm run build
systemctl restart dnd-battle-room
```

## Cloudflare Tunnel

`cloudflared` is running on another LXC, so point that tunnel at this LXC over HTTP:

```yaml
ingress:
  - hostname: dnd.example.com
    service: http://192.168.178.174:3000
  - service: http_status:404
```

Replace `dnd.example.com` with the public hostname assigned in Cloudflare.

If `cloudflared` is ever moved onto the same LXC as this app, use localhost instead:

```yaml
ingress:
  - hostname: dnd.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

The app is a normal HTTP Next.js service with a `/ws` WebSocket endpoint on the same host and port.

## Verification

After starting or restarting the service, verify the app locally:

```bash
curl -I http://127.0.0.1:3000
curl -I http://192.168.178.174:3000
```

Both should return `HTTP/1.1 200 OK`.

To verify the room API:

```bash
curl -sS -X POST http://127.0.0.1:3000/api/rooms/VERIFY \
  -H 'Content-Type: application/json' \
  --data '{"id":"verify","nickname":"Verifier","color":"#3d8bfd"}'
```

Expected result: a JSON room object with `"roomCode":"VERIFY"`.

## Hosting notes

- Current non-Supabase multiplayer state is stored in the Next.js server process memory.
- Rooms are usable through the tunnel now, but room state is lost when the service restarts.
- For persistent hosted rooms, configure Supabase with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then apply `supabase/schema.sql`.
- The app has no login by default. If the room should be private, protect the public hostname with Cloudflare Access.
