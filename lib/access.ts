// lib/access.ts

import {
  createHash,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";

export function createAccessToken(
  password: string
) {
  return createHash("sha256")
    .update(password)
    .digest("hex");
}

export function getExpectedAccessToken() {
  const password =
    process.env.BETA_PASSWORD;

  if (!password) {
    return null;
  }

  return createAccessToken(password);
}

export async function hasBetaAccess() {
  // Read cookies even when configuration is missing at build time, so this
  // access check remains request-bound rather than a prerendered redirect.
  const cookieStore = await cookies();
  const expected =
    getExpectedAccessToken();

  if (!expected) {
    return false;
  }

  const actual =
    cookieStore.get(
      "clearly_access"
    )?.value;

  if (!actual || !/^[a-f0-9]{64}$/.test(actual)) {
    return false;
  }

  if (
    actual.length !==
    expected.length
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(actual),
    Buffer.from(expected)
  );
}