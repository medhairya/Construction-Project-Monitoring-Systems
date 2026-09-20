/**
 * Runs supabase/migrations/*.sql against the database in SUPABASE_DB_URL,
 * in filename order, each file in one transaction.
 *
 *   npm run db:push                            # apply what is new
 *   npm run db:push -- --reset                 # drop the schema first, then apply
 *   npm run db:push -- --redo 0003_functions.sql  # reapply one file
 *
 * The migrations are written to be re-runnable after a --reset, which is how
 * the demo data gets rebuilt from scratch.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env.local.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
// --redo <file> reapplies one migration; used for the function file, which is
// all CREATE OR REPLACE and therefore idempotent.
const redoAt = process.argv.indexOf("--redo");
const redo = redoAt === -1 ? null : process.argv[redoAt + 1];
const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to " + new URL(url).host);

  if (reset) {
    console.log("Dropping and recreating the public schema…");
    await client.query("drop schema if exists public cascade; create schema public;");
    await client.query("grant usage on schema public to anon, authenticated, service_role;");
    await client.query(
      "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;",
    );
  }

  // Applied migrations are recorded, so re-running only applies what is new.
  await client.query(
    "create table if not exists schema_migrations (" +
      "filename text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await client.query("select filename from schema_migrations")).rows.map((r) => r.filename),
  );
  if (redo) {
    applied.delete(redo);
    await client.query("delete from schema_migrations where filename = $1", [redo]);
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log("  " + file + " … already applied");
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write("  " + file + " … ");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      console.error("\n" + e.message);
      if (e.position) {
        const upto = sql.slice(0, Number(e.position));
        console.error("at line " + upto.split("\n").length + ":");
        console.error("  " + sql.split("\n")[upto.split("\n").length - 1]);
      }
      process.exit(1);
    }
  }
  console.log("\nAll migrations applied.");
} finally {
  await client.end();
}
