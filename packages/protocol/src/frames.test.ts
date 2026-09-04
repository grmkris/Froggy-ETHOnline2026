import { describe, expect, it } from "bun:test";

import { decodeScreencastFrame, encodeScreencastFrame } from "./frames";
import type { FrameMeta } from "./frames";

const meta: FrameMeta = { h: 800, ts: 1_756_000_000_000, w: 1280 };
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("screencast frames", () => {
  it("round-trips metadata and payload", () => {
    const decoded = decodeScreencastFrame(encodeScreencastFrame(meta, jpeg));

    expect(decoded?.meta).toEqual(meta);
    expect(decoded?.jpeg).toEqual(jpeg);
  });

  it("returns a view into the message rather than a copy", () => {
    // The whole point of the envelope: at frame rate, copying every payload is
    // real garbage. Callers that keep the bytes must copy — and this is the
    // test that would notice if the contract quietly changed.
    const encoded = encodeScreencastFrame(meta, jpeg);
    const decoded = decodeScreencastFrame(encoded);

    expect(decoded?.jpeg.buffer).toBe(encoded.buffer);
  });

  it("survives a payload of any length", () => {
    const large = new Uint8Array(64 * 1024).fill(0x42);
    const decoded = decodeScreencastFrame(encodeScreencastFrame(meta, large));

    expect(decoded?.jpeg.byteLength).toBe(large.byteLength);
  });

  it("rejects a frame truncated inside its header", () => {
    // A partial read must be a dropped frame, not a desynchronised stream.
    expect(decodeScreencastFrame(new Uint8Array([1, 2]))).toBeNull();
  });

  it("rejects a frame truncated inside its metadata", () => {
    const encoded = encodeScreencastFrame(meta, jpeg);

    expect(decodeScreencastFrame(encoded.subarray(0, 8))).toBeNull();
  });

  it("rejects metadata that is not JSON", () => {
    const junk = new Uint8Array(8);
    new DataView(junk.buffer).setUint32(0, 4, true);
    junk.set(new TextEncoder().encode("oops"), 4);

    expect(decodeScreencastFrame(junk)).toBeNull();
  });

  it("rejects metadata whose dimensions are not numbers", () => {
    // `canvas.width = meta.w` with a non-number silently yields a zero-width
    // canvas, which reads as "the screencast is broken" rather than "the frame
    // was malformed". The decoder exists to make that visible.
    const bad = new TextEncoder().encode(
      JSON.stringify({ h: "800", ts: 0, w: "1280" })
    );
    const frame = new Uint8Array(4 + bad.length);
    new DataView(frame.buffer).setUint32(0, bad.length, true);
    frame.set(bad, 4);

    expect(decodeScreencastFrame(frame)).toBeNull();
  });
});
