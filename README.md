# ProwlDesk

CX intelligence dashboard for tracking "lost in transit" support tickets from Gorgias. It runs a
report over a date range and shows totals, a daily breakdown, and the matching tickets.

## How it works

The frontend (Next.js) posts a date range to `/api/run`, which forwards the request to a
CodeWords workflow (`gorgias_lost_in_transit_counter`) that queries Gorgias and returns the
aggregated results.

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

| Variable                | Description                                                                    |
| ------------------------ | -------------------------------------------------------------------------------- |
| `CODEWORDS_RUNTIME_URI`  | Base URL of the CodeWords runtime. Defaults to `https://runtime.codewords.ai`. |
| `CODEWORDS_API_KEY`      | Bearer token for server-to-server calls to CodeWords.                          |
| `AUTH_SECRET`            | Random secret NextAuth uses to sign session tokens (`openssl rand -base64 32`). |
| `AUTH_GOOGLE_ID`         | OAuth client ID from the Google Cloud Console.                                 |
| `AUTH_GOOGLE_SECRET`     | OAuth client secret from the Google Cloud Console.                             |
| `ALLOWED_EMAILS`         | Comma-separated list of Google account emails allowed to sign in.              |

In the Google Cloud Console, add these as authorized redirect URIs for the OAuth client:
`http://localhost:3000/api/auth/callback/google` (dev) and
`https://<your-domain>/api/auth/callback/google` (production).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint
