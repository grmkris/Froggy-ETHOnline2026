import { CardCredentials, CardVaultEnvelope } from "@froggy/domain";
import type { PaymentMethodId, UserId } from "@froggy/domain";
import { Redacted, Schema } from "effect";

export class CardVault {
  private readonly key: Redacted.Redacted;
  constructor(key: Redacted.Redacted) {
    this.key = key;
  }
  private async cryptoKey(): Promise<CryptoKey> {
    const key = Redacted.value(this.key);
    if (!/^[a-f0-9]{64}$/u.test(key)) {
      throw new Error("card.vault: configure a 32-byte card vault key.");
    }
    return await crypto.subtle.importKey(
      "raw",
      Buffer.from(key, "hex"),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    );
  }
  async seal(
    owner: UserId,
    id: PaymentMethodId,
    revision: number,
    credentials: CardCredentials
  ): Promise<CardVaultEnvelope> {
    const value = Schema.decodeUnknownSync(CardCredentials)(credentials);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    try {
      const encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: new TextEncoder().encode(
            JSON.stringify([1, owner, id, revision])
          ),
        },
        await this.cryptoKey(),
        plaintext
      );
      return {
        v: 1,
        nonce: Buffer.from(nonce).toString("hex"),
        ciphertext: Buffer.from(encrypted).toString("hex"),
      };
    } finally {
      plaintext.fill(0);
    }
  }
  async open(
    owner: UserId,
    id: PaymentMethodId,
    revision: number,
    envelope: CardVaultEnvelope
  ): Promise<CardCredentials> {
    try {
      const checked = Schema.decodeUnknownSync(CardVaultEnvelope)(envelope);
      const plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: Buffer.from(checked.nonce, "hex"),
            additionalData: new TextEncoder().encode(
              JSON.stringify([1, owner, id, revision])
            ),
          },
          await this.cryptoKey(),
          Buffer.from(checked.ciphertext, "hex")
        )
      );
      try {
        return Schema.decodeUnknownSync(CardCredentials)(
          JSON.parse(new TextDecoder().decode(plaintext))
        );
      } finally {
        plaintext.fill(0);
      }
    } catch {
      throw new Error("card.vault: credentials could not be authenticated.");
    }
  }
}
