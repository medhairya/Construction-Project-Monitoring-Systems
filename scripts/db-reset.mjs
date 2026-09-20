// Deletes the local data file so the next request rebuilds the seed.
// When the app moves to Supabase this script will run the SQL migrations and
// supabase/seed.sql instead.
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), ".data", "pwfts.json");
if (fs.existsSync(file)) {
  fs.rmSync(file);
  console.log("Removed " + file + " — the seed will be rebuilt on the next page load.");
} else {
  console.log("No local database found; the seed will be built on the next page load.");
}
