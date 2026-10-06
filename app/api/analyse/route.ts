import { analysisSchema, coachInstructions, verifySuggestion } from "@/lib/analysis-coach";
import { speechMetrics } from "@/lib/speech-metrics";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";
import { enforceLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

import { hasBetaAccess } from "@/lib/access";
import { getOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

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
      await readJsonBody(request, 100_000);

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

    const mode = body.mode === "free" ? "free" : "question";
    const effectivePrompt = mode === "free" ? "Share whatever is on your mind. Find and express your own central thought." : prompt;

    if (!effectivePrompt) {
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

    if (prompt.length > 1000) {
      return NextResponse.json({ error: "Prompt is too long" }, { status: 400 });
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

    const metrics = speechMetrics(transcript, durationSeconds);
    const { wordCount, wordsPerMinute } = metrics;

    const limited = await enforceLimit(request, "paid");
    if (limited) return limited;

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

        instructions: coachInstructions,

        input: `
MODE: ${mode}

QUESTION OR INTENT:
${effectivePrompt}

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
      }, { signal: request.signal });

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

    const suggestion = await verifySuggestion(async ({ instructions, input, schema }) => {
      const result = await openai.responses.create({
        model: "gpt-5.6-terra", store: false, instructions, input,
        text: { format: { type: "json_schema", name: "suggestion_review", strict: true, schema } },
      }, { signal: request.signal });
      if (!result.output_text) throw new Error("Suggestion review returned no text");
      return result.output_text;
    }, effectivePrompt, transcript, analysis.candidateResponse);

    const { candidateResponse: _candidate, ...feedback } = analysis;
    void _candidate;
    return NextResponse.json({
      ...feedback,
      suggestedResponse: suggestion?.response ?? null,
      suggestionScore: suggestion?.score ?? null,
      suggestionReason: suggestion?.reason ?? null,
      label: getLabel(analysis.score),
      metrics,
    });

  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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