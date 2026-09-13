import { WatchlistItemId, WatchlistPreviewId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { Store } from "@froggy/wallet";

import { boundedBytes, safeFetch } from "./outbound";
import { watchlistPreviewFor } from "./watchlist-resolve";

const rasterMime = (bytes: Uint8Array): string | null => {
  let mime: string | null = null;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    mime = "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = "image/jpeg";
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    mime = "image/webp";
  }

  return mime;
};

/** Raster bytes from a server-known item/preview only. Never an arbitrary URL proxy. */
export const handleWatchlistImage = async (
  store: Store,
  owner: UserId,
  pathname: string
): Promise<Response | null> => {
  const ref = /^\/api\/watchlist\/images\/(?<ref>[^/]+)$/u.exec(pathname)
    ?.groups?.["ref"];
  if (!ref) {
    return null;
  }
  let url: string | null | undefined;
  if (WatchlistPreviewId.is(ref)) {
    const preview = await watchlistPreviewFor(owner, ref);
    url = preview?.imageUrl;
  }
  if (WatchlistItemId.is(ref)) {
    const item = await store.watchlist.transact(owner, (book) => book.get(ref));
    if (item) {
      url = await store.watchlistData.transact(
        owner,
        (book) => book.get(ref)?.imageUrl
      );
    }
  }
  if (!url) {
    return new Response(null, { status: 404 });
  }
  try {
    const response = await safeFetch(
      url,
      { headers: { accept: "image/png,image/jpeg,image/webp" } },
      { maxRedirects: 2, timeoutMs: 8000 }
    );
    if (!response.ok) {
      await response.body?.cancel();
      return new Response(null, { status: 404 });
    }
    const bytes = await boundedBytes(response, 1024 * 1024);
    const mime = rasterMime(bytes);
    if (!mime) {
      return new Response(null, { status: 415 });
    }
    return new Response(bytes, {
      headers: {
        "content-type": mime,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
};
