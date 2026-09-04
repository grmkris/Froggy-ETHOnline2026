/**
 * The screencast frame envelope.
 *
 * `[u32 LE metaLen][JSON meta][JPEG bytes]` in a single binary WebSocket
 * message. One frame per message, so a partial read is a dropped frame rather
 * than a desynchronised stream — there is no framing state to lose.
 *
 * The metadata is JSON rather than a packed struct because it is ~40 bytes
 * against a ~30 KB payload; the cost is noise and the benefit is that a frame
 * can be read by hand when the picture is wrong.
 */

import { Result, Schema } from "effect";

/**
 * Frame metadata.
 *
 * Schema-backed like every other wire type in this package. It is three numbers
 * and a hand-written check would be shorter — but `canvas.width = meta.w` with
 * a non-number silently yields a zero-width canvas, which presents as "the
 * screencast is broken" rather than "the frame was malformed", and that is
 * exactly the class of bug a decoder exists to convert into a visible one.
 */
export const FrameMeta = Schema.Struct({
  /** Device pixel height of the captured surface. */
  h: Schema.Finite,
  /** Server clock at capture, for staleness display only — never for ordering. */
  ts: Schema.Finite,
  w: Schema.Finite,
});

export type FrameMeta = typeof FrameMeta.Type;

const decodeMeta = Schema.decodeUnknownResult(Schema.fromJsonString(FrameMeta));

const HEADER_BYTES = 4;

export const encodeScreencastFrame = (
  meta: FrameMeta,
  jpeg: Uint8Array
): Uint8Array => {
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(HEADER_BYTES + metaBytes.length + jpeg.length);
  new DataView(out.buffer).setUint32(0, metaBytes.length, true);
  out.set(metaBytes, HEADER_BYTES);
  out.set(jpeg, HEADER_BYTES + metaBytes.length);
  return out;
};

export interface DecodedFrame {
  readonly jpeg: Uint8Array;
  readonly meta: FrameMeta;
}

/**
 * Decode a frame.
 *
 * `jpeg` is a **view** into the incoming buffer, not a copy. That is the point
 * — copying every frame at 30fps is real garbage — but it means the caller must
 * copy before handing the bytes to anything that outlives the message, which
 * `createImageBitmap` via a fresh `Blob` does.
 *
 * Returns `null` on a truncated or malformed frame instead of throwing: the
 * next frame supersedes this one, and a thrown error inside a socket handler
 * would tear down a stream over a single bad packet.
 */
export const decodeScreencastFrame = (
  data: Uint8Array
): DecodedFrame | null => {
  if (data.byteLength < HEADER_BYTES) {
    return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const metaLength = view.getUint32(0, true);
  if (data.byteLength < HEADER_BYTES + metaLength) {
    return null;
  }
  const decoded = decodeMeta(
    new TextDecoder().decode(
      data.subarray(HEADER_BYTES, HEADER_BYTES + metaLength)
    )
  );
  if (Result.isFailure(decoded)) {
    return null;
  }
  return {
    jpeg: data.subarray(HEADER_BYTES + metaLength),
    meta: decoded.success,
  };
};
