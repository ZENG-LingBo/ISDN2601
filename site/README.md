# The project website

The demos are published at https://isdn1001.lbzeng.com on Cloudflare Pages:

| Address | What it is |
|---|---|
| `/` | A home page with links to both demos |
| `/freeze/` | Freeze, the camera game (`game/`) |
| `/minibus/` | The Minibus demo with pretend friends (`prototype/`, demo mode) |

The site is public, but it's kept out of Google and other search engines. Every page has a noindex tag, and Cloudflare sends a noindex header with every file (`_headers`). Anyone with the link can still open it.

## Update the site

1. Build it: `node site/build.mjs`. This makes `site/dist/` from the current files in `game/` and `prototype/`.
2. Upload `site/dist/` to the Cloudflare Pages project `isdn1001`, for example with `npx wrangler pages deploy site/dist --project-name isdn1001`. This needs a Cloudflare API token with permission to edit Cloudflare Pages.

The address isdn1001.lbzeng.com is a custom domain on that Pages project. Its DNS record is a CNAME to `isdn1001.pages.dev` in the lbzeng.com zone on Cloudflare.
