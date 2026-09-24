import { NextResponse } from "next/server";

import { createAccessToken } from "@/lib/access";

export const runtime = "nodejs";

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const password =
      body?.password;

    const betaPassword =
      process.env.BETA_PASSWORD;

    if (!betaPassword) {
      console.error(
        "BETA_PASSWORD is not configured."
      );

      return NextResponse.json(
        {
          error:
            "Server configuration error",
        },
        {
          status: 500,
        }
      );
    }

    if (
      typeof password !==
        "string" ||
      !password.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Password required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      password !==
      betaPassword
    ) {
      return NextResponse.json(
        {
          error:
            "Incorrect password",
        },
        {
          status: 401,
        }
      );
    }

    const response =
      NextResponse.json({
        success: true,
      });

    response.cookies.set(
      "clearly_access",
      createAccessToken(
        betaPassword
      ),
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge:
          60 * 60 * 24 * 30,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Access error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong",
      },
      {
        status: 500,
      }
    );
  }
}