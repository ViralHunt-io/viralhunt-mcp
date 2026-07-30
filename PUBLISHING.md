# Publishing the ViralHunt MCP server

Checklist to list `viralhunt-mcp` in the MCP directories. Do them in this order.

## Shared listing blurb (paste where a description is asked)

> **ViralHunt** — Find trending/viral content across TikTok, Instagram, X, Facebook,
> Pinterest and Reddit, and schedule/publish/edit posts on your connected social accounts.
> Gives an agent the full loop: discover → publish → verify → correct. A BuzzSumo
> alternative with an API agents can drive end to end. Get a free token at viralhunt.io.

Tags: `social-media, trending, scheduler, content-marketing, tiktok, instagram, buzzsumo-alternative`

---

## 0. Publish to npm (do this first — everything else assumes `npx viralhunt-mcp` works)

```bash
npm login                       # free account at npmjs.com
npm publish --access public
```
If the name `viralhunt-mcp` is taken, set `"name": "@rodvan/viralhunt-mcp"` in package.json
(and update the README + this file), then publish again.

Verify: `npx -y viralhunt-mcp` should start and print `viralhunt-mcp running (...)` to stderr.

---

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

Uses `server.json` (already in this repo) + the `mcp-publisher` CLI. The npm package carries
`mcpName` so the registry can verify ownership.

```bash
# install the publisher CLI (see modelcontextprotocol/registry for the latest install line)
mcp-publisher login github        # authenticates the io.github.rodvan/* namespace
mcp-publisher publish             # reads ./server.json
```

## 2. Smithery (smithery.ai)

`smithery.yaml` is already in the repo. Go to **smithery.ai → Deploy/New server**, connect the
GitHub repo `rodvan/viralhunt-mcp`, and it picks up the config schema (asks users for their
ViralHunt API key). No code changes needed.

## 3. modelcontextprotocol/servers (GitHub — community list)

Open a PR adding this line to the "Community Servers" section of the README (keep alphabetical):

```markdown
- **[ViralHunt](https://github.com/rodvan/viralhunt-mcp)** - Find trending content across TikTok, Instagram, X, Facebook, Pinterest and Reddit, and schedule/publish/edit social posts.
```

## 4. mcp.so

Submit at **mcp.so** (Submit button). Fields: name `viralhunt`, repo
`https://github.com/rodvan/viralhunt-mcp`, npm `viralhunt-mcp`, description = the blurb above.

## 5. PulseMCP (pulsemcp.com)

Submit at **pulsemcp.com/submit** with the repo URL + the blurb above.

## 6. Glama (glama.ai/mcp)

Glama auto-indexes public GitHub repos with an MCP server. Once the repo is public it should
appear; you can claim/refresh it from the Glama page.

---

## Keeping it in sync

The source of truth is `mcp/viralhunt-mcp/` in the main ViralHunt repo. When the MCP server or
the API changes, that folder is updated and re-pushed to this repo via
`git subtree push --prefix=mcp/viralhunt-mcp`. Bump `version` in `package.json` + `server.json`,
re-`npm publish`, and re-run `mcp-publisher publish` for the registry.
