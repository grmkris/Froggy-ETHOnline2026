import { createCanvas } from "@napi-rs/canvas";
import { Effect, Schema } from "effect";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// PDF.js documents browser types but accepts native canvas in its Node renderer.
// Keep that mismatch at the adapter and accept only our native context prototype.
const nativeContextPrototype: unknown = Object.getPrototypeOf(
  createCanvas(1, 1).getContext("2d")
);
const RenderContext = Schema.declare<CanvasRenderingContext2D>(
  (value): value is CanvasRenderingContext2D =>
    value instanceof Object &&
    Object.getPrototypeOf(value) === nativeContextPrototype
);
const Input = Schema.Struct({ bytes: Schema.String, startPage: Schema.Int });
const input = Schema.decodeUnknownSync(Input)(
  JSON.parse(await Bun.stdin.text())
);
const task = getDocument({
  data: new Uint8Array(Buffer.from(input.bytes, "base64")),
  useSystemFonts: true,
  maxImageSize: 4_000_000,
});
const doc = await task.promise;
let text = "";
const images: string[] = [];
const last = Math.min(doc.numPages, input.startPage + 4);
await Effect.runPromise(
  Effect.forEach(
    Array.from(
      { length: Math.max(0, last - input.startPage + 1) },
      (_, offset) => input.startPage + offset
    ),
    (index) =>
      Effect.promise(async () => {
        const page = await doc.getPage(index);
        const content = await page.getTextContent();
        const words = content.items
          .flatMap((item) => ("str" in item ? [item.str] : []))
          .join(" ");
        text += `Page ${index}: ${words}\n`;
        if (words.trim().length < 30) {
          const viewport = page.getViewport({
            scale: Math.min(
              1.5,
              1200 /
                Math.max(
                  page.getViewport({ scale: 1 }).width,
                  page.getViewport({ scale: 1 }).height
                )
            ),
          });
          const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height)
          );
          await page.render({
            canvasContext: Schema.decodeUnknownSync(RenderContext)(
              canvas.getContext("2d")
            ),
            canvas: null,
            viewport,
          }).promise;
          images.push(canvas.toDataURL("image/png"));
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }),
    { concurrency: 1 }
  )
);
process.stdout.write(
  JSON.stringify({
    text: text.slice(0, 20_000),
    pages: doc.numPages,
    images,
    truncated: last < doc.numPages || text.length > 20_000,
  })
);
await task.destroy();
