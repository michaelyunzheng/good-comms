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
