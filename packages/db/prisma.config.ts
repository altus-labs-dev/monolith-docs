import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const configDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(configDir, "../../.env") });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./prisma/schema.prisma",
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
