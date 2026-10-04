# Clearly

Clearly is a speaking practice app for getting better at answering questions out loud.

You get a prompt, a short window to think, then record your response. Clearly transcribes it and gives you concise feedback on how clearly you communicated.

## How it works

A session has three parts:

**Think**  
90 seconds to prepare.

Use a simple structure:

**Point → What → So what → Now what → Point**

**Speak**  
Record your answer in the browser with a live timer and microphone-responsive waveform.

Recordings are capped at 2 minutes.

**Review**  
Your response is transcribed automatically, then analysed for:

- Clarity
- Structure
- Relevance
- Concision
- Specificity

The goal is useful feedback, not a personality score.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- MediaRecorder API
- Web Audio API
- OpenAI API

Typography:

- Newsreader
- Bricolage Grotesque
- IBM Plex Mono

## Project structure

```text
app/
├── api/
│   ├── access/
│   │   └── route.ts
│   ├── transcribe/
│   │   └── route.ts
│   └── analyse/
│       └── route.ts
├── session/
│   └── page.tsx
├── globals.css
├── layout.tsx
└── page.tsx

components/
└── session-client.tsx

lib/
├── access.ts
└── openai.ts
```

## Getting started

Install dependencies:

```bash
npm install
```

Create `.env.local` in the project root:

```env
BETA_PASSWORD=your_beta_password
OPENAI_API_KEY=your_openai_api_key
```

Start the app:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Scripts

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Notes

Transcription and analysis use the OpenAI API and require API credits.

Keep `OPENAI_API_KEY` server-side. Do not expose it with a `NEXT_PUBLIC_` prefix.

Clearly is currently an early private beta.

**Think. Speak. Review.**

## Request limits

Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an
Upstash Redis database. Copy `.env.example` to `.env.local` for local setup and
configure the same values in your hosting provider before deploying.
Without Redis credentials, development uses an in-memory limiter; production
returns HTTP 503 for login and valid paid requests. Redis failures also return
503, rather than allowing unlimited usage.

Defaults in `lib/rate-limit.ts`:

- Login: 5 attempts per client per 60 seconds, plus 100 globally per 60 seconds.
- Transcription and analysis combined: 6 requests per client per 60 seconds and
  200 requests globally per 24 hours (roughly 100 complete sessions).

Windows start with the first accepted request. Paid quota is reserved before
calling the model, so upstream failures also count. HTTP 429 includes
`Retry-After`. The daily request cap bounds call volume, not a dollar budget.

On Vercel, clients are identified using its trusted `x-vercel-forwarded-for`
header, hashed before being used as a counter key. Other hosts share one client
bucket; integrate your host's trusted proxy header before increasing traffic.
Do not trust arbitrary `X-Forwarded-For` headers. Use a dedicated Redis database
for each environment so preview and production quotas do not interfere.

## Validation

Use Node.js 22.18 or newer, then run:

```bash
npm ci
npm run lint
npm run test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

The browser tests start their own production server (after `npm run build`) on port 3100 with a test
password and no API credentials. Microphone and model responses are mocked;
they exercise permission/reset races, stale feedback, transcription retries,
stream cleanup, and keyboard seeking without recording audio or incurring costs.
GitHub Actions runs these checks on pull requests and pushes to `main`.
