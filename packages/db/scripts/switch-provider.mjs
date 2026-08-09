// Switches the Prisma datasource provider between postgresql and sqlite
// so the stack can run without a Postgres server during development.
// Usage: node scripts/switch-provider.mjs [postgres|sqlite]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");

const target = process.argv[2];
if (target !== "postgres" && target !== "sqlite") {
  console.error('Usage: node scripts/switch-provider.mjs [postgres|sqlite]');
  process.exit(1);
}

const provider = target === "sqlite" ? "sqlite" : "postgresql";
const url =
  target === "sqlite"
    ? 'url = "file:./dev.db"'
    : 'url = env("DATABASE_URL")';

const updated = schema
  .replace(/provider = "(postgresql|sqlite)"/, `provider = "${provider}"`)
  .replace(/url = .*/, url);

writeFileSync(schemaPath, updated);
console.log(`Switched datasource provider to ${provider}.`);
console.log(
  target === "sqlite"
    ? "Next: run `npm run generate -w @duga/db && npm run migrate -w @duga/db`"
    : "Next: ensure DATABASE_URL is set and run `npm run db:migrate`"
);
