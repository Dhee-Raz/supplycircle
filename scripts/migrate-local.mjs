import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./sites-env.mjs";

// Match the development server's local D1 identity and persistence directory.
const { d1 } = JSON.parse(readFileSync(path.join(projectRoot, ".openai/hosting.json"), "utf8"));
if (d1) {
  const configPath = path.join(projectRoot, ".sites-runtime/local-d1.json");
  writeFileSync(configPath, JSON.stringify({
    name: "supplycircle-local",
    compatibility_date: "2026-05-15",
    d1_databases: [{
      binding: d1,
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: path.join(projectRoot, "drizzle"),
    }],
  }));
  const result = spawnSync(process.execPath, [
    path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "migrations", "apply", d1, "--local",
    "--config", configPath, "--persist-to", path.join(projectRoot, ".wrangler/state"),
  ], { stdio: "inherit", env: { ...process.env, CI: "true" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Local database migrations failed; development server was not started.");
}
