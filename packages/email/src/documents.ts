import fontkit from "@pdf-lib/fontkit";
import { Schema } from "effect";
import { PDFDocument } from "pdf-lib";

const DocumentRead = Schema.Struct({
  text: Schema.String,
  pages: Schema.Int,
  images: Schema.Array(Schema.String),
  truncated: Schema.Boolean,
});
export const makeEmailDocument = async (
  text: string,
  format: "pdf" | "text"
): Promise<Uint8Array> => {
  if (format === "text") {
    return new TextEncoder().encode(text);
  }
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(
    await Bun.file(
      new URL("../assets/DejaVuSans.ttf", import.meta.url)
    ).arrayBuffer(),
    { subset: true }
  );
  let page = document.addPage();
  let y = page.getHeight() - 50;
  const printable = text;
  for (const line of printable
    .split("\n")
    .flatMap((paragraph) => paragraph.match(/.{1,85}/gu) ?? [""])) {
    if (y < 50) {
      page = document.addPage();
      y = page.getHeight() - 50;
    }
    page.drawText(line, { x: 45, y, size: 11, font });
    y -= 16;
  }
  return await document.save();
};
export const readEmailPdf = async (
  bytes: Uint8Array,
  startPage: number
): Promise<typeof DocumentRead.Type> => {
  const proc = Bun.spawn(
    [process.execPath, new URL("pdf-worker.ts", import.meta.url).pathname],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
  );
  const timer = setTimeout(() => {
    proc.kill();
  }, 15_000);
  try {
    await proc.stdin.write(
      JSON.stringify({
        bytes: Buffer.from(bytes).toString("base64"),
        startPage,
      })
    );
    await proc.stdin.end();
    const response = new Response(proc.stdout);
    // Five rasterized pages, bounded before they can enter the model or replay.
    const { boundedEmailBody } = await import("./auth");
    const output = await boundedEmailBody(response, 8 * 1024 * 1024);
    if ((await proc.exited) !== 0) {
      const resolvedEmail0 = await new Response(proc.stderr).text();
      throw new Error(`PDF processing failed: ${resolvedEmail0.slice(0, 500)}`);
    }
    return Schema.decodeUnknownSync(DocumentRead)(
      JSON.parse(new TextDecoder().decode(output))
    );
  } finally {
    clearTimeout(timer);
    proc.kill();
  }
};
