import { expect, test } from "bun:test";

import { normalizePayeeId } from "./address";

test("normalization ignores EVM checksum case and preserves Solana Base58 case", () => {
  expect(normalizePayeeId(" 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 ")).toBe(
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  );
  const solana = "H32YnqbzL62YkHMSCzfKcLry9yuipwwx1EMztiCSPhjb";
  expect(normalizePayeeId(` ${solana} `)).toBe(solana);
  expect(normalizePayeeId(solana.toLowerCase())).not.toBe(
    normalizePayeeId(solana)
  );
  expect(normalizePayeeId(" 0.0.456858 ")).toBe("0.0.456858");
});
