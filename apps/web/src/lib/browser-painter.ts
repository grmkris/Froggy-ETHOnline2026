/**
 * The canvas painter, outside React entirely.
 *
 * Frames arrive at thirty a second. A `setState` per frame would re-render
 * the whole workspace thirty times a second and the chat would stutter every
 * time the page repainted, so React never learns a frame arrived: this object
 * owns the bitmap and draws it into whichever canvases are attached.
 *
 * Several canvases, not one, because the page shows up in more than one
 * place — the inline card, the compact strip while that card is scrolled
 * away, the split pane — and they must all show the same moment. The latest
 * bitmap is kept so a canvas that attaches mid-stream paints immediately
 * rather than waiting for the next frame.
 */

import { decodeScreencastFrame } from "@froggy/protocol";

export interface BrowserPainter {
  /** Start painting into this canvas. Returns the detach. */
  readonly attach: (canvas: HTMLCanvasElement) => () => void;
  readonly dispose: () => void;
  readonly paint: (data: ArrayBuffer) => void;
  /** The latest frame as a JPEG data URL, for a still of the page. */
  readonly snapshotUrl: () => string | null;
}

const draw = (canvas: HTMLCanvasElement, bitmap: ImageBitmap): void => {
  // Assigning width clears the canvas, so only on a real size change.
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
};

export const createBrowserPainter = (): BrowserPainter => {
  const canvases = new Set<HTMLCanvasElement>();
  let latest: ImageBitmap | null = null;
  // Latest-frame-wins. A slow decode must never queue, or a client that falls
  // behind delivers a slideshow of moments that have already passed.
  let decoding = false;
  let queued: ArrayBuffer | null = null;

  const decode = async (data: ArrayBuffer): Promise<void> => {
    const frame = decodeScreencastFrame(new Uint8Array(data));
    if (frame === null) {
      return;
    }
    // A fresh copy: `frame.jpeg` is a view into the socket message, and the
    // bitmap outlives it.
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(frame.jpeg)], { type: "image/jpeg" })
    );
    latest?.close();
    latest = bitmap;
    for (const canvas of canvases) {
      draw(canvas, bitmap);
    }
  };

  const paint = (data: ArrayBuffer): void => {
    if (decoding) {
      queued = data;
      return;
    }
    decoding = true;
    void (async () => {
      try {
        await decode(data);
      } catch {
        // A truncated frame is superseded by the next one. Tearing down a
        // stream over one bad packet is a worse outcome than one dropped frame.
      } finally {
        decoding = false;
        const next = queued;
        queued = null;
        if (next !== null) {
          paint(next);
        }
      }
    })();
  };

  return {
    attach: (canvas) => {
      canvases.add(canvas);
      if (latest !== null) {
        draw(canvas, latest);
      }
      return () => {
        canvases.delete(canvas);
      };
    },
    dispose: () => {
      canvases.clear();
      latest?.close();
      latest = null;
    },
    paint,
    snapshotUrl: () => {
      if (latest === null) {
        return null;
      }
      const still = document.createElement("canvas");
      draw(still, latest);
      return still.toDataURL("image/jpeg", 0.7);
    },
  };
};
