import fs from "node:fs";
import path from "node:path";
const databaseId = process.argv[2];
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    databaseId ?? "",
  )
)
  throw new Error(
    "Pass the real D1 database UUID returned by wrangler d1 create bsc-radar.",
  );
const build = JSON.parse(fs.readFileSync("dist/server/wrangler.json", "utf8"));
const root = process.cwd();
const config = {
  ...build,
  name: "bsc-radar",
  main: path.join(root, "dist/server/index.js"),
  assets: { directory: path.join(root, "dist/client"), binding: "ASSETS" },
  vars: { STANDALONE_CLOUDFLARE: "true" },
  d1_databases: [
    {
      binding: "DB",
      database_name: "bsc-radar",
      database_id: databaseId,
      migrations_dir: path.join(root, "drizzle"),
    },
  ],
  triggers: { crons: ["*/5 * * * *"] },
  observability: { enabled: false },
};
fs.mkdirSync(".cloudflare", { recursive: true });
fs.writeFileSync(
  ".cloudflare/wrangler.json",
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Cloudflare configuration prepared. No credentials were written. API access stays locked until APP_PASSWORD is set.",
);
