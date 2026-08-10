# ProwlDesk

CX intelligence dashboard for tracking "lost in transit" support tickets from Gorgias. It runs a
report over a date range and shows totals, a daily breakdown, and the matching tickets.

## How it works

`POST /api/run` starts a background job and immediately returns a `jobId`; the frontend polls
`GET /api/run/status/:id` every ~1.5s until it's done. This is necessary because Gorgias's ticket
search doesn't support filtering by tag or date server-side — the job pages through `GET
/api/tickets` (newest first, cursor-based, one page at a time), stops once it passes the start of
the requested range, and tallies which tickets carry the `Lost in Transit` tag. For wide date
ranges this can mean hundreds of sequential Gorgias API calls, easily exceeding a normal
request/response cycle, which is why it runs as a background job (via Next.js's `after()`) with
progress tracked in Vercel KV rather than blocking the initial request. Jobs expire from KV after
30 minutes.

Access is gated by Google sign-in (NextAuth). Only emails listed in `ALLOWED_EMAILS` can sign in;
everyone else is rejected at the OAuth callback. `/api/run` also rate-limits requests per signed-in
user (10 requests/minute) — note this limit is in-memory and per server instance, so it resets on
redeploy and won't be shared across multiple instances if you ever scale beyond one.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

| Variable                        | Description                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GORGIAS_SUBDOMAIN`  | Your Gorgias subdomain (before `.gorgias.com`). Used for both API calls and ticket links. |
| `GORGIAS_EMAIL`                 | Email associated with the Gorgias REST API key.                                |
| `GORGIAS_API_KEY`               | Gorgias REST API key (Settings → REST API in Gorgias).                         |
| `AUTH_SECRET`                   | Random secret NextAuth uses to sign session tokens (`openssl rand -base64 32`). |
| `AUTH_GOOGLE_ID`                | OAuth client ID from the Google Cloud Console.                                 |
| `AUTH_GOOGLE_SECRET`            | OAuth client secret from the Google Cloud Console.                             |
| `ALLOWED_EMAILS`                | Comma-separated list of Google account emails allowed to sign in.              |
| `AUTH_URL`                      | Full URL of the deployed app (needed so callback URLs are built correctly).    |
| `KV_REST_API_URL`               | Vercel KV connection URL — auto-filled once you provision KV in the Vercel dashboard. |
| `KV_REST_API_TOKEN`             | Vercel KV auth token — also auto-filled by Vercel.                             |

The app validates all required env vars on server startup and fails fast with a clear error
listing what's missing, rather than starting in a broken state.

In the Google Cloud Console, add these as authorized redirect URIs for the OAuth client:
`http://localhost:3000/api/auth/callback/google` (dev) and
`https://<your-domain>/api/auth/callback/google` (production).

### Provisioning Vercel KV

In the Vercel dashboard: Project → **Storage** tab → **Create Database** → choose **KV** (Redis).
Once created and connected to this project, `KV_REST_API_URL` and `KV_REST_API_TOKEN` are added
automatically — no manual copying needed.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint
