#!/usr/bin/env bash
# Builds the site and uploads it to the Cloudflare Worker "isdn1001", which serves
# https://isdn1001.lbzeng.com.
#
# Needs a Cloudflare API token in CLOUDFLARE_API_TOKEN that can read the lbzeng.com zone and
# edit Workers scripts. In a Claude cloud session with the token saved as a network secret,
# the network proxy adds it, so the variable can be left unset.
set -euo pipefail
cd "$(dirname "$0")/.."
API=https://api.cloudflare.com/client/v4
AUTH="Authorization: Bearer ${CLOUDFLARE_API_TOKEN:-proxy-injected}"

node site/build.mjs
node site/worker-build.mjs

# The account that owns lbzeng.com.
ACCOUNT_ID=$(curl -fsS -H "$AUTH" "$API/zones?name=lbzeng.com" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result;if(!r||!r.length){console.error("Zone lbzeng.com not found");process.exit(1)}console.log(r[0].account.id)})')

curl -fsS -X PUT "$API/accounts/$ACCOUNT_ID/workers/scripts/isdn1001" -H "$AUTH" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2024-09-23"};type=application/json' \
  -F 'worker.js=@site/worker/worker.js;type=application/javascript+module' > /dev/null

echo "Uploaded. Open https://isdn1001.lbzeng.com to check."
