export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function boundedBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  status = 413,
) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(status, "Payload exceeded its limit.");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    reader.releaseLock();
  }
}

export async function boundedJson(
  response: Response,
  limit = 32_768,
): Promise<unknown> {
  if (!response.body) throw new HttpError(502, "Missing service response.");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        await boundedBytes(response.body, limit, 502),
      ),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Invalid service response.");
  }
}

export async function secureEqual(a: string, b: string) {
  // WebCrypto HMAC verification performs the constant-time comparison. Hashes
  // have a fixed length, including when attacker input length differs.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(b),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(a));
  return crypto.subtle.verify("HMAC", key, signature, enc.encode(b));
}
