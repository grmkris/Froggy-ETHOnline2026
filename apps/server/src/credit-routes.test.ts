import { beforeAll, describe, expect, it } from "bun:test";

import {
  AgentTokenId,
  CreditPurchase,
  creditUnits,
  MandateId,
  SessionId,
  userId,
} from "@froggy/domain";
import { CreditActivity, CreditState } from "@froggy/protocol";
import { ConfigProvider, Effect, Schema } from "effect";

import { handleCredits } from "./credit-routes";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { createServices } from "./services";
import type { TaskCaller } from "./tasks";

let environment: Environment;
beforeAll(async () => {
  environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          APP_ORIGIN: "http://localhost:3000",
          DATABASE_URL: "",
          HEDERA_ACCOUNT_ID: "0.0.0",
          HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
          HEDERA_NETWORK: "hedera:testnet",
          PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
          PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
          EVM_NETWORK: "eip155:84532",
          GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
        })
      )
    )
  );
});

const fixture = () => {
  const services = createServices({ environment });
  const owner: TaskCaller = {
    userId: userId(`did:privy:credit-api-${crypto.randomUUID()}`),
    agentTokenId: null,
    grantId: null,
    scopes: null,
  };
  const workspace = {
    session: {
      currentMandate: {
        id: MandateId.generate(),
        sessionId: SessionId.generate(),
        rules: [],
        createdAt: Date.now(),
      },
    },
  };
  const call = async (
    path: string,
    method = "GET",
    body?: Schema.Json,
    caller = owner
  ) => {
    const init: RequestInit = {
      method,
      headers: {
        authorization: "Bearer local-owner",
        "content-type": "application/json",
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await handleCredits(
      services,
      workspace,
      caller,
      new Request(`http://localhost:3000${path}`, init)
    );
    if (response === null) {
      throw new Error("Credit route did not match.");
    }
    return response;
  };
  return { services, owner, call };
};

describe("credit API boundaries", () => {
  it("offers a real x402 challenge and confirms one owner purchase without exposing proofs", async () => {
    const { services, owner, call } = fixture();
    const initialResponse = await call("/api/credits");
    const initial = Schema.decodeUnknownSync(CreditState)(
      await initialResponse.json()
    );
    expect(initial.availableUnits).toBe(creditUnits(0));
    const created = await call("/api/credits/purchases", "POST", {
      v: 1,
      amountUsdMicros: 1_000_000,
      network: "hedera:testnet",
      idempotencyKey: "one-dollar",
    });
    expect(created.status).toBe(201);
    const purchase = Schema.decodeUnknownSync(CreditPurchase)(
      await created.json()
    );
    const path = `/api/credits/purchases/${purchase.id}`;
    const challenge = await call(`${path}/pay`);
    expect(challenge.status).toBe(402);
    expect(challenge.headers.get("payment-required")).not.toBeNull();
    expect(
      JSON.parse(
        Buffer.from(
          challenge.headers.get("payment-required") ?? "",
          "base64"
        ).toString("utf-8")
      )
    ).toEqual(await challenge.json());
    const summary = await services.store.credits.summary(owner.userId);
    expect(summary.availableUnits).toBe(creditUnits(0));
    const paid = await call(`${path}/pay`, "POST", { v: 1 });
    expect(paid.status).toBe(202);
    const waitForFunding = async (remaining = 100): Promise<void> => {
      const current = await services.creditFunding.get(
        owner.userId,
        purchase.id
      );
      if (current.status === "confirmed") {
        return;
      }
      if (remaining === 0) {
        throw new Error("Funding remained pending.");
      }
      await Bun.sleep(5);
      await waitForFunding(remaining - 1);
    };
    await waitForFunding();
    const activityResponse = await call("/api/credits/activity");
    const text = await activityResponse.text();
    expect(text).not.toContain("paymentHeader");
    expect(text).not.toContain("signedTransaction");
    expect(text).not.toContain("proofHash");
    const activity = Schema.decodeUnknownSync(
      Schema.fromJsonString(CreditActivity)
    )(text);
    expect(activity.purchases[0]?.status).toBe("confirmed");
    expect(
      activity.entries.filter((entry) => entry.kind === "funding")
    ).toHaveLength(1);
    const final = await services.store.credits.summary(owner.userId);
    expect(final.availableUnits).toBe(creditUnits(1_000_000));
    await services.shutdown();
  });

  it("allows an agent to read balance but refuses funding, limits, and owner history", async () => {
    const { services, owner, call } = fixture();
    const agent = { ...owner, agentTokenId: AgentTokenId.generate() };
    const read = await call("/api/credits", "GET", undefined, agent);
    expect(read.status).toBe(200);
    await Promise.all(
      [
        ["/api/credits/activity", "GET"],
        ["/api/credits/limits", "PUT"],
        ["/api/credits/purchases", "POST"],
        ["/api/credits/hedera-account", "POST"],
      ].map(async ([path, method]) => {
        const response = await call(path ?? "", method, { v: 1 }, agent);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "owner_required" });
      })
    );
    const summary = await services.store.credits.summary(owner.userId);
    expect(summary.availableUnits).toBe(creditUnits(0));
    await services.shutdown();
  });
});
