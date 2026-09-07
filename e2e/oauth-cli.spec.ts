import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { text } from "node:stream/consumers";

import { expect, test } from "@playwright/test";
import { Schema } from "effect";

const Credentials = Schema.Struct({
  accessToken: Schema.String,
  clientId: Schema.String,
  expiresAt: Schema.Finite,
  refreshToken: Schema.String,
  revocationEndpoint: Schema.String,
  tokenEndpoint: Schema.String,
  url: Schema.String,
  v: Schema.Literals([1]),
});
const readCredentials = async (file: string) =>
  Schema.decodeUnknownSync(Credentials)(
    JSON.parse(await readFile(file, "utf-8"))
  );

for (const manual of [false, true]) {
  test(`the Node CLI logs in ${manual ? "manually" : "over loopback"}, refreshes and logs out`, async ({
    page,
    request,
    baseURL,
  }, testInfo) => {
    const script = testInfo.outputPath("froggy.mjs");
    const config = testInfo.outputPath("config");
    await mkdir(path.dirname(script), { recursive: true });
    const bundle = await request.get("/froggy-cli.js");
    expect(bundle.ok()).toBe(true);
    await writeFile(script, await bundle.text());
    // An isolated config and no desktop opener: only Playwright opens consent.
    const env = {
      PATH: "",
      XDG_CONFIG_HOME: config,
      FROGGY_URL: baseURL,
      FROGGY_TOKEN: "",
    };
    const child = spawn(
      process.execPath,
      [script, "login", ...(manual ? ["--manual"] : [])],
      {
        env,
        timeout: 15_000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    const closed = once(child, "close");
    const messages: string[] = [];
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      messages.push(chunk);
    });
    const output = text(child.stdout);
    const link = () =>
      /http:\/\/[^\s]+\/oauth\/authorize\?[^\s]+/u.exec(messages.join(""))?.[0];
    try {
      await expect.poll(link).toBeDefined();
      await page.goto(link() ?? "");
      await expect(
        page.getByRole("button", { name: "Allow", exact: true })
      ).toBeEnabled();
      await page.getByRole("button", { name: "Allow", exact: true }).click();
      if (manual) {
        await page.waitForURL(/\/oauth\/manual\?/u);
        const code = await page
          .getByRole("textbox", { name: "Authorization code" })
          .inputValue();
        child.stdin.end(`${code}\n`);
      } else {
        await expect(
          page.getByText("Signed in to Froggy.", { exact: false })
        ).toBeVisible();
      }
      await closed;
      await output;
      expect(child.exitCode, messages.join("")).toBe(0);
    } finally {
      if (child.exitCode === null) {
        child.kill();
      }
    }

    const file = path.join(config, "froggy", "credentials.json");
    const saved = await readCredentials(file);
    const info = await stat(file);
    expect(info.mode % 0o1000).toBe(0o600);
    await writeFile(file, JSON.stringify({ ...saved, expiresAt: 0 }));
    const services = spawn(process.execPath, [script, "services"], {
      env,
      timeout: 10_000,
    });
    const [catalog, error] = await Promise.all([
      text(services.stdout),
      text(services.stderr),
      once(services, "close"),
    ]);
    expect(services.exitCode, error).toBe(0);
    expect(catalog).toContain("web_search");
    const renewed = await readCredentials(file);
    expect(renewed.accessToken).not.toBe(saved.accessToken);
    expect(renewed.refreshToken).not.toBe(saved.refreshToken);

    const logout = spawn(process.execPath, [script, "logout"], {
      env,
      timeout: 10_000,
    });
    const [, logoutError] = await Promise.all([
      text(logout.stdout),
      text(logout.stderr),
      once(logout, "close"),
    ]);
    expect(logout.exitCode, logoutError).toBe(0);
    expect(await readFile(file).catch(() => null)).toBeNull();
    const revoked = await request.post("/mcp", {
      headers: { authorization: `Bearer ${renewed.accessToken}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(revoked.status()).toBe(401);
  });
}
