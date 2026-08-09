# ProwlDesk

CX intelligence dashboard for tracking "lost in transit" support tickets from Gorgias. It runs a
report over a date range and shows totals, a daily breakdown, and the matching tickets.

## How it works

The frontend (Next.js) posts a date range to `/api/run`, which forwards the request to a
CodeWords workflow (`gorgias_lost_in_transit_counter`) that queries Gorgias and returns the
aggregated results.

Access is gated by a single shared key entered on first load and stored in the browser's session
storage; it's sent as the `x-app-key` header on every request and checked with a constant-time
comparison server-side.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

| Variable               | Description                                                        |
| ----------------------- | -------------------------------------------------------------------- |
| `CODEWORDS_RUNTIME_URI` | Base URL of the CodeWords runtime. Defaults to `https://runtime.codewords.ai`. |
| `CODEWORDS_API_KEY`     | Bearer token for server-to-server calls to CodeWords.               |
| `APP_ACCESS_KEY`        | Shared secret required to use the app and its API.                  |

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint
