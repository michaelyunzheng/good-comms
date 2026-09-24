import { NextResponse } from "next/server";

import { hasBetaAccess } from "@/lib/access";
import { getOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

const MAX_AUDIO_SIZE =
  20 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "video/webm",
  "video/mp4",
]);

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

    const formData =
      await request.formData();

    const audio =
      formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        {
          error:
            "Audio file required",
        },
        {
          status: 400,
        }
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        {
          error:
            "Recording is empty",
        },
        {
          status: 400,
        }
      );
    }

    if (
      audio.size >
      MAX_AUDIO_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "Recording is too large",
        },
        {
          status: 413,
        }
      );
    }

    const mimeType =
      audio.type
        .split(";")[0]
        .toLowerCase();

    if (
      mimeType &&
      !ALLOWED_TYPES.has(
        mimeType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported audio format",
        },
        {
          status: 415,
        }
      );
    }

    const openai =
      getOpenAI();

    const transcription =
      await openai.audio.transcriptions.create(
        {
          file: audio,
          model:
            "gpt-4o-transcribe",
        }
      );

    const transcript =
      transcription.text.trim();

    if (!transcript) {
      return NextResponse.json(
        {
          error:
            "No speech detected",
        },
        {
          status: 422,
        }
      );
    }

    return NextResponse.json({
      transcript,
    });
  } catch (error) {
    console.error(
      "Transcription error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Transcription failed",
      },
      {
        status: 500,
      }
    );
  }
}