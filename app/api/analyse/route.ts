import { NextResponse } from "next/server";

import { hasBetaAccess } from "@/lib/access";
import { getOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

const frameworkStepSchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    status: {
      type: "string",
      enum: [
        "clear",
        "partial",
        "missing",
      ],
    },

    note: {
      type: "string",
    },
  },

  required: [
    "status",
    "note",
  ],
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    headline: {
      type: "string",
    },

    strongest: {
      type: "string",
    },

    improve: {
      type: "string",
    },

    betterOpening: {
      type: "string",
    },

    framework: {
      type: "object",
      additionalProperties: false,

      properties: {
        openingPoint:
          frameworkStepSchema,

        what:
          frameworkStepSchema,

        soWhat:
          frameworkStepSchema,

        nowWhat:
          frameworkStepSchema,

        closingPoint:
          frameworkStepSchema,
      },

      required: [
        "openingPoint",
        "what",
        "soWhat",
        "nowWhat",
        "closingPoint",
      ],
    },
  },

  required: [
    "score",
    "headline",
    "strongest",
    "improve",
    "betterOpening",
    "framework",
  ],
};

function getLabel(
  score: number
) {
  if (score >= 90) {
    return "Excellent";
  }

  if (score >= 80) {
    return "Strong";
  }

  if (score >= 65) {
    return "Clear";
  }

  if (score >= 50) {
    return "Developing";
  }

  return "Needs work";
}

export async function POST(
  request: Request
) {
  try {
    const hasAccess =
      await hasBetaAccess();

    if (!hasAccess) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const prompt =
      typeof body.prompt ===
      "string"
        ? body.prompt.trim()
        : "";

    const transcript =
      typeof body.transcript ===
      "string"
        ? body.transcript.trim()
        : "";

    const durationSeconds =
      typeof body.durationSeconds ===
        "number" &&
      Number.isFinite(
        body.durationSeconds
      )
        ? Math.max(
            1,
            Math.min(
              body.durationSeconds,
              600
            )
          )
        : null;

    if (!prompt) {
      return NextResponse.json(
        {
          error:
            "Prompt required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      transcript.length < 10
    ) {
      return NextResponse.json(
        {
          error:
            "Response is too short",
        },
        {
          status: 400,
        }
      );
    }

    if (
      transcript.length >
      20_000
    ) {
      return NextResponse.json(
        {
          error:
            "Response is too long",
        },
        {
          status: 400,
        }
      );
    }

    const words =
      transcript
        .split(/\s+/)
        .filter(Boolean);

    const wordCount =
      words.length;

    const wordsPerMinute =
      durationSeconds
        ? Math.round(
            wordCount /
              (durationSeconds /
                60)
          )
        : null;

    const openai =
      getOpenAI();

    const response =
      await openai.responses.create({
        model:
          "gpt-5.6-terra",

        /*
         * We don't need this response
         * retained as application state.
         */
        store: false,

        instructions: `
You are a precise communication coach.

Evaluate the response as spoken communication, based only on the supplied transcript, question, and basic timing information.

Focus on:
- clarity
- structure
- relevance
- concision
- specificity
- whether the speaker lands their main idea

Use this framework as a helpful scaffold, not a rigid checklist:

POINT
Lead with the answer or central idea.

WHAT
Explain what happened or what the idea is.

SO WHAT
Explain why it matters.

NOW WHAT
Explain what changed, what follows, or what was learned.

POINT
Land the answer cleanly.

Important:
- Do not judge accent, personality, intelligence, confidence, charisma, identity, or speaking style.
- Do not claim to evaluate vocal delivery because you only have a transcript.
- Be constructive rather than flattering.
- Prefer one strong observation over many weak ones.
- The score is directional, not scientific.
- A concise excellent answer can score very highly.
- Do not require every framework section when it would make the answer unnatural.
- Keep each feedback field concise.
- betterOpening should preserve the speaker's meaning and voice rather than turning it into corporate language.
        `.trim(),

        input: `
QUESTION:
${prompt}

RESPONSE:
${transcript}

WORD COUNT:
${wordCount}

APPROXIMATE DURATION:
${
  durationSeconds
    ? `${durationSeconds} seconds`
    : "unknown"
}

APPROXIMATE WORDS PER MINUTE:
${
  wordsPerMinute ??
  "unknown"
}
        `.trim(),

        text: {
          format: {
            type: "json_schema",
            name:
              "communication_analysis",
            strict: true,
            schema:
              analysisSchema,
          },
        },
      });

    if (
      !response.output_text
    ) {
      throw new Error(
        "Model returned no analysis."
      );
    }

    const analysis =
      JSON.parse(
        response.output_text
      );

    return NextResponse.json({
      ...analysis,

      label: getLabel(
        analysis.score
      ),

      metrics: {
        wordCount,
        wordsPerMinute,
      },
    });
  } catch (error) {
    console.error(
      "Analysis error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Analysis failed",
      },
      {
        status: 500,
      }
    );
  }
}