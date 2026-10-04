export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// Content-Length can be missing or dishonest; enforce the limit while streaming.
export async function readJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("JSON object required", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("Request is too large", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestBodyError("Invalid JSON", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestBodyError("JSON object required", 400);
  }
  return body as Record<string, unknown>;
}
