import { describe, expect, test } from "bun:test";

import { PrivateKey, Transaction } from "@x402/hedera";
import { Schema } from "effect";

import { describePayment } from "./inspect";
import { liveHederaPayer, signerHederaPayer } from "./payer";
import { paymentHeaders } from "./wire";

const Payload = Schema.Struct({
  payload: Schema.Struct({ transaction: Schema.String }),
});
const decodePayload = Schema.decodeUnknownSync(Schema.fromJsonString(Payload));

describe("mainnet payment headers", () => {
  for (const custody of ["key", "external"] as const) {
    test(`${custody} signing fits the hosted header limit and preserves the transfer signature`, async () => {
      const key = PrivateKey.generateECDSA();
      const accountId = "0.0.123";
      const network = "hedera:mainnet";
      const payer =
        custody === "key"
          ? liveHederaPayer({
              accountId,
              network,
              privateKey: key.toStringRaw(),
            })
          : signerHederaPayer({
              accountId,
              network,
              publicKey: key.publicKey.toStringRaw(),
              signBytes: async (bytes) =>
                await Promise.resolve(key.sign(bytes)),
            });
      const attempt = await payer.pay({
        x402Version: 2,
        accepts: [
          {
            network,
            scheme: "exact",
            amount: "5000000",
            asset: "0.0.0",
            payTo: "0.0.456",
            extra: { feePayer: "0.0.789" },
            maxTimeoutSeconds: 120,
          },
        ],
      });
      expect(attempt.stubbed).toBe(false);
      expect(attempt.requirements?.amount).toBe("5000000");
      if (attempt.header === null) {
        throw new Error(attempt.error ?? "Payment was not built");
      }
      // Reserve room for authorization, cookies and the proxy's own headers.
      const bytes = [
        ...new Headers({ ...paymentHeaders(attempt.header) }),
      ].reduce(
        (total, [name, value]) => total + name.length + value.length + 4,
        0
      );
      expect(bytes).toBeLessThan(8000);
      const decoded = decodePayload(
        Buffer.from(attempt.header, "base64").toString("utf-8")
      );
      const transaction = Transaction.fromBytes(
        Buffer.from(decoded.payload.transaction, "base64")
      );
      expect(transaction.nodeAccountIds?.length).toBe(3);
      expect(key.publicKey.verifyTransaction(transaction)).toBe(true);
      expect(describePayment(attempt.header).payer).toBe(accountId);
      expect(describePayment(attempt.header).transactionId).toStartWith(
        "0.0.789@"
      );
    });
  }
});
