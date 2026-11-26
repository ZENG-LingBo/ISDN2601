# The project website

The demos are online at https://isdn1001.lbzeng.com:

| Address | What it is |
|---|---|
| `/` | A home page with links to both demos |
| `/freeze/` | Freeze, the camera game (`game/`). The camera works here, because the site uses https. |
| `/minibus/` | The Minibus demo with pretend friends (`prototype/`, demo mode) |

Anyone with the link can open the site, but search engines are told not to list it. Every page has a noindex tag, and every file is sent with a noindex header (`_headers`).

## How it's hosted

The site is a Cloudflare Worker called `isdn1001`. The whole site is packed into one script, and isdn1001.lbzeng.com is the Worker's custom domain in the lbzeng.com zone. The Worker's workers.dev address is turned off. The custom domain and the workers.dev setting were set once in Cloudflare, and `deploy.sh` doesn't change them.

The lbzeng.com zone has Cloudflare Web Analytics switched on, which adds a tracking script to every page in the zone. The Worker sends every file with `Cache-Control: no-transform`, so Cloudflare doesn't add that script here. That way Cloudflare doesn't add its tracking script to these pages.

## Update the site

Run `site/deploy.sh`. It builds `site/dist` from the current `game/` and `prototype/` files, packs it into `site/worker/worker.js`, and uploads that to the Worker.

The script needs a Cloudflare API token in `CLOUDFLARE_API_TOKEN` that can read the lbzeng.com zone and edit Workers scripts. In the Claude cloud environment for this repository, the token is saved as a network secret, so you can leave the variable unset there.

To check the site without uploading it, run `node site/build.mjs` and open `site/dist` with any local web server.
