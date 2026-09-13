import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import { CreditPurchase } from "../packages/domain/src/credits";

/** Fund the owner through the same local purchase engine the UI uses. */
export const fundCredits = async (page: Page) => {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => localStorage.getItem("froggy.local-identity"))
    )
    .not.toBeNull();
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const headers = { authorization: `Bearer ${token}` };
  const quoted = await page.request.post("/api/credits/purchases", {
    headers,
    data: {
      v: 1,
      idempotencyKey: crypto.randomUUID(),
      amountUsdMicros: 1_000_000,
      network: "hedera:testnet",
    },
  });
  expect(quoted.ok()).toBe(true);
  const purchase = Schema.decodeUnknownSync(CreditPurchase)(
    await quoted.json()
  );
  const paid = await page.request.post(
    `/api/credits/purchases/${purchase.id}/pay`,
    {
      headers,
      data: { v: 1 },
    }
  );
  expect(paid.ok()).toBe(true);
  Schema.decodeUnknownSync(CreditPurchase)(await paid.json());
  await expect
    .poll(async () => {
      const status = await page.request.get(
        `/api/credits/purchases/${purchase.id}`,
        { headers }
      );
      return Schema.decodeUnknownSync(CreditPurchase)(await status.json())
        .status;
    })
    .toBe("confirmed");
};
