import { createHash } from "node:crypto";

export type LimitRule = { key: string; limit: number; windowSeconds: number };
type LimitResult = { allowed: boolean; retryAfter: number };
const counters = new Map<string, { count: number; expiresAt: number }>();

// Check and reserve every counter in one operation. A rejected request consumes no quota.
const RESERVE_SCRIPT = `
for i, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') >= tonumber(ARGV[i * 2 - 1]) then
    return {0, math.max(1, redis.call('TTL', key))}
  end
end
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('EXPIRE', key, ARGV[i * 2]) end
end
return {1, 0}
`;

export function reserveLocal(rules: LimitRule[], now = Date.now()): LimitResult {
  for (const [key, counter] of counters) {
    if (counter.expiresAt <= now) counters.delete(key);
  }
  for (const rule of rules) {
    const counter = counters.get(rule.key);
    if (counter && counter.count >= rule.limit) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((counter.expiresAt - now) / 1000)) };
    }
  }
  for (const rule of rules) {
    const counter = counters.get(rule.key);
    counters.set(rule.key, {
      count: (counter?.count ?? 0) + 1,
      expiresAt: counter?.expiresAt ?? now + rule.windowSeconds * 1000,
    });
  }
  return { allowed: true, retryAfter: 0 };
}

export async function reserveLimits(rules: LimitRule[]): Promise<LimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Shared rate limiting is not configured");
    }
    return reserveLocal(rules);
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      "EVAL", RESERVE_SCRIPT, rules.length,
      ...rules.map((rule) => `clearly:${rule.key}`),
      ...rules.flatMap((rule) => [rule.limit, rule.windowSeconds]),
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Rate limit service unavailable");
  const data = await response.json();
  if (data.error || !Array.isArray(data.result) ||
      (data.result[0] !== 0 && data.result[0] !== 1) ||
      !Number.isFinite(data.result[1]) || data.result[1] < 0) {
    throw new Error("Invalid rate limit service response");
  }
  return { allowed: data.result[0] === 1, retryAfter: Math.max(1, data.result[1]) };
}

// Only trust the IP header supplied by Vercel's edge. Other deployments share
// a conservative bucket until a trusted proxy integration is configured.
export function clientKey(request: Request): string {
  const ip = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
    : null;
  return createHash("sha256").update(ip || "shared").digest("hex");
}

export function requestRules(request: Request, kind: "access" | "paid"): LimitRule[] {
  const client = clientKey(request);
  if (kind === "access") {
    return [
      { key: `access:${client}`, limit: 5, windowSeconds: 60 },
      { key: "access:global", limit: 100, windowSeconds: 60 },
    ];
  }
  return [
    { key: `paid:${client}`, limit: 6, windowSeconds: 60 },
    { key: "paid:daily", limit: 200, windowSeconds: 86400 },
  ];
}

export async function enforceLimit(request: Request, kind: "access" | "paid"): Promise<Response | null> {
  try {
    const result = await reserveLimits(requestRules(request, kind));
    if (result.allowed) return null;
    return Response.json({ error: "Usage limit reached. Please try again later." }, {
      status: 429, headers: { "Retry-After": String(result.retryAfter) },
    });
  } catch (error) {
    console.error("Rate limit error:", error);
    return Response.json({ error: "Service temporarily unavailable. Please try again shortly." }, {
      status: 503, headers: { "Retry-After": "30" },
    });
  }
}
