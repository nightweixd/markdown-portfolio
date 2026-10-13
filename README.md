# BSC Radar

A personal BNB Smart Chain screener built with React, Vinext and Cloudflare Workers.

## Implemented

- Trending and New Tokens views, intervals, contract/name search and sortable token table.
- Liquidity, volume, cap, age, change and concentration filters. Missing fields cannot pass an active numerical filter.
- Browser-local watchlist (30 contracts), saved presets and settings export.
- DEX Screener public market data without credentials. This discovers recent profiles and paid boosts, not every new BSC token. New means pairs younger than 24h; pair age is not contract age.
- GMGN read-only rankings, launchpad listings, contract details and search. The key is configured and BSC market access is verified. No trade execution or signing key is used by the website.
- Chainbase indexed holder count and top balances fetched on selection and cached for five minutes. Pools and burn addresses remain included; no concentration score is invented when supply is unavailable.
- Page notifications for new rule matches on later refreshes of the loaded view.
- D1-backed rules and Telegram monitor, pending your bot secrets and schedule. Delivery is limited to one notification per token/rule/UTC hour. Demo tokens never send.

All money values are USD. No missing metric is labelled safe. The UI distinguishes demo fixtures from live data.

## Local preview

```powershell
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_small_mordo.sql
npm run dev
```

Open the printed loopback URL. The first visit needs the local mock sign-in at `/signin-with-chatgpt?return_to=%2F`.
Copy `.env.example` names into an ignored `.dev.vars` file for local Worker secrets. Restart after changing secrets.
On Windows, if the npm shim fails, use `node scripts/run-framework.mjs build` and `node scripts/run-framework.mjs dev` directly. For installation, set `npm_execpath` to your verified npm JavaScript entry point and run `node scripts/install-ci.mjs`.

```powershell
node scripts/test-screener.mjs
node node_modules/typescript/bin/tsc --noEmit
```

## Private Sites hosting

The project identity is in `.openai/hosting.json`. Sites supplies private sign-in and provisions D1. Runtime keys are encrypted secrets configured through Sites, not the hosting manifest. A linked background schedule calling the protected monitor is still required for closed-page Telegram alerts. Do not claim alerts are active merely because credentials are configured.

## Deploy to your own Cloudflare account (Free plan)

The code can also run in your own Cloudflare account. Use your actual account and database ID; do not copy the local preview's placeholder ID.

```powershell
node node_modules/wrangler/bin/wrangler.js login
node node_modules/wrangler/bin/wrangler.js d1 create bsc-radar
node scripts/run-framework.mjs build
node scripts/prepare-cloudflare.mjs YOUR_REAL_D1_DATABASE_UUID
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config .cloudflare/wrangler.json
node node_modules/wrangler/bin/wrangler.js deploy --config .cloudflare/wrangler.json
```

The initial standalone deployment locks all data APIs until `APP_PASSWORD` is configured. Set secrets through interactive stdin prompts; never put values in source or command arguments:

```powershell
node node_modules/wrangler/bin/wrangler.js secret put APP_PASSWORD --config .cloudflare/wrangler.json
node node_modules/wrangler/bin/wrangler.js secret put CHAINBASE_API_KEY --config .cloudflare/wrangler.json
node node_modules/wrangler/bin/wrangler.js secret put GMGN_API_KEY --config .cloudflare/wrangler.json
node node_modules/wrangler/bin/wrangler.js secret put TELEGRAM_BOT_TOKEN --config .cloudflare/wrangler.json
node node_modules/wrangler/bin/wrangler.js secret put TELEGRAM_CHAT_ID --config .cloudflare/wrangler.json
```

Only add keys you have. DEX Screener needs none. The prepared config enables a five-minute Cron Trigger for saved Telegram rules. Choose the Free plan for the RM0 hosting target and monitor API quotas; paid data plans are separate. If your GMGN key requires a fixed outbound IP, verify compatibility before relying on Workers for that provider.

`CRON_SECRET` is needed only for an external scheduler posting to `/api/monitor` with an Authorization bearer header. Native Cloudflare Cron Triggers call the Worker scheduled handler directly. Telegram needs an existing bot token and chat ID; create your bot using @BotFather and message it first.

## Data and credentials

`.dev.vars`, `.env*`, `.sites-runtime`, local database state and `.cloudflare` are ignored. Do not commit API keys. GMGN adapter routes follow the installed official gmgn-cli's exist-auth flow: X-APIKEY plus a fresh timestamp and UUID. Chainbase uses x-api-key. Credentials never reach client bundles.

The first browser alert refresh establishes a baseline. Watchlist page alerts see only loaded contracts; Telegram evaluates each saved rule's discovery feed independently. In-process caches and cooldowns reduce requests but are not globally coordinated across Worker isolates. This is intended for a private, single-user workload.

## Current verification limits

GMGN BSC rankings, launchpad listings and Chainbase holder access were tested through the CLI and local dashboard. The hosted GMGN endpoint returned HTTP 429 even after waiting for its cooldown; the hosted default is therefore DEX Screener plus Chainbase. GMGN remains selectable for testing; `DEFAULT_DATA_SOURCE=dexscreener` sets this hosted fallback without changing credentials. `GMGN_RETRY_AFTER` can suppress requests across deployment instances until a known Unix-seconds reset time. Telegram delivery still needs your bot credentials and schedule. Deployment to your own Cloudflare account needs your Cloudflare sign-in. Provider coverage and API quotas can change. No buying, selling or wallet access is implemented.
