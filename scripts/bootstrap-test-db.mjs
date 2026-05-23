import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const BASELINE_MIGRATIONS = [
  "001_normalized_schema.sql",
  "003_job_crm_workspace.sql",
  "004_field_visit_tracking.sql",
  "005_customer_registry.sql",
  "006_google_calendar_sync.sql",
  "007_google_calendar_import_events.sql",
  "008_import_batches.sql",
];

function printHelp() {
  console.log(`Usage:
  node scripts/bootstrap-test-db.mjs [--env-file .env.test.local] [--company-name "Solarize CRM TEST"]

What it does:
  - loads a target database URL from the provided env file or the current shell
  - applies the baseline CRM schema migrations needed for a clean test workspace
  - inserts a single company row if the target database is empty

Notes:
  - this intentionally skips legacy backfill migration 002
  - it is safe to re-run against the same test database`);
}

function parseArgs(argv) {
  const args = {
    envFile: ".env.test.local",
    companyName: "Solarize CRM TEST",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--env-file") {
      args.envFile = argv[index + 1];
      index += 1;
    } else if (token === "--company-name") {
      args.companyName = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function stripWrappedQuotes(value) {
  if (!value) return value;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(filePath) {
  if (!filePath) return {};
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Env file not found: ${absolutePath}`);
  }

  const env = {};
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = stripWrappedQuotes(line.slice(separator + 1).trim());
    env[key] = value;
  }
  return env;
}

function getConnectionString(envFromFile) {
  return (
    envFromFile.POSTGRES_URL ||
    envFromFile.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL
  );
}

function getMigrationSql(filename) {
  const absolutePath = path.join(ROOT, "db", "migrations", filename);
  return fs.readFileSync(absolutePath, "utf8");
}

async function applyMigrations(sql) {
  for (const migration of BASELINE_MIGRATIONS) {
    process.stdout.write(`Applying ${migration} ... `);
    await sql.query(getMigrationSql(migration));
    console.log("done");
  }
}

async function ensureCompany(sql, companyName) {
  const existing = await sql`
    select id, name
    from companies
    order by created_at asc
    limit 1
  `;

  if (existing.length > 0) {
    return { created: false, company: existing[0] };
  }

  const inserted = await sql`
    insert into companies (name)
    values (${companyName})
    returning id, name
  `;

  return { created: true, company: inserted[0] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const envFromFile = loadEnvFile(args.envFile);
  const connectionString = getConnectionString(envFromFile);
  if (!connectionString) {
    throw new Error(
      "Missing POSTGRES_URL or DATABASE_URL. Put one in the env file or current shell before bootstrapping."
    );
  }

  const sql = neon(connectionString);

  console.log("Bootstrapping Solarize CRM TEST database...");
  await applyMigrations(sql);

  const { created, company } = await ensureCompany(sql, args.companyName);
  console.log(
    created
      ? `Created company row: ${company.name} (${company.id})`
      : `Company already present: ${company.name} (${company.id})`
  );

  console.log("Bootstrap complete.");
  console.log("Next steps:");
  console.log("  1. Start the test app with: npm run dev:test-reset");
  console.log("  2. Sign in with your existing Clerk account");
  console.log("  3. The app will auto-create your app user inside the test database on first login");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

