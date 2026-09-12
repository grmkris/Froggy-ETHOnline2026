const encoder = new TextEncoder();
export const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
const keyFor = async (secret: string) =>
  await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
const payload = async (
  method: string,
  path: string,
  at: string,
  bytes: Uint8Array
) => encoder.encode(`${method}\n${path}\n${at}\n${await sha256(bytes)}`);
export const emailSignature = async (
  secret: string,
  method: string,
  path: string,
  bytes: Uint8Array,
  now = Date.now()
): Promise<Headers> => {
  const at = String(now);
  const signed = await crypto.subtle.sign(
    "HMAC",
    await keyFor(secret),
    await payload(method, path, at, bytes)
  );
  const signature = [...new Uint8Array(signed)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return new Headers({
    "x-froggy-email-at": at,
    "x-froggy-email-signature": signature,
  });
};
export const verifyEmailSignature = async (
  secret: string,
  request: Request,
  bytes: Uint8Array,
  now = Date.now()
): Promise<boolean> => {
  const at = request.headers.get("x-froggy-email-at") ?? "";
  const signature = request.headers.get("x-froggy-email-signature") ?? "";
  if (
    !secret ||
    !/^\d+$/u.test(at) ||
    Math.abs(now - Number(at)) > 300_000 ||
    !/^[a-f0-9]{64}$/u.test(signature)
  ) {
    return false;
  }
  const decoded = Uint8Array.from(signature.match(/../gu) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  );
  return await crypto.subtle.verify(
    "HMAC",
    await keyFor(secret),
    decoded,
    await payload(request.method, new URL(request.url).pathname, at, bytes)
  );
};
export const boundedEmailBody = async (
  request: Request | Response,
  limit: number
): Promise<Uint8Array> => {
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    const read = async (): Promise<void> => {
      const next = await reader.read();
      if (next.done) {
        return;
      }
      length += next.value.length;
      if (length > limit) {
        await reader.cancel();
        throw new Error("Email exceeds the size limit.");
      }
      chunks.push(next.value);
      await read();
    };
    await read();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};
