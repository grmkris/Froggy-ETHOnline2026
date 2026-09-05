import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ??
      "postgres://postgres:postgres@localhost:5432/froggy",
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/schema.ts",
});
