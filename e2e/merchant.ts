/** A standalone local x402 seller; it has no application routes or live signer. */
import { stubOracleGate } from "../packages/payments/src/oracle";
import { encodeSettlementHeader } from "../packages/payments/src/settlement";

const gate = stubOracleGate();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const resource = {
      description: "Local simulated lending report",
      units: "5000000",
      url: request.url,
    };
    const challenge = gate.challenge(resource);
    const [requirements] = challenge.accepts;
    if (requirements === undefined) {
      throw new Error("The test merchant must offer one payment method.");
    }
    const proof = request.headers.get("payment-signature");
    if (proof === null) {
      return Response.json(challenge, { status: 402 });
    }
    const settlement = await gate.settle(proof, requirements);
    if (!settlement.ok || settlement.transactionId === null) {
      return Response.json(
        { error: "Invalid simulated payment proof" },
        { status: 402 }
      );
    }
    return new Response(
      "Your USDC lending report\nSimulated external merchant result.",
      {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "payment-response": encodeSettlementHeader({
            network: "hedera:testnet",
            transactionId: settlement.transactionId,
          }),
        },
      }
    );
  },
});
process.stdout.write(`http://127.0.0.1:${server.port}/report\n`);
