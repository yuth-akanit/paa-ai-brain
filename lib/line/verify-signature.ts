import crypto from "node:crypto";

export function verifyLineSignature(body: string, signature: string | null, channelSecret?: string) {
  if (!channelSecret || !signature) {
    return false;
  }

  const generated = crypto.createHmac("sha256", channelSecret).update(body).digest("base64");
  const generatedBuffer = Buffer.from(generated);
  const providedBuffer = Buffer.from(signature);

  if (generatedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(generatedBuffer, providedBuffer);
}
