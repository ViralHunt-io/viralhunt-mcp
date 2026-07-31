# ViralHunt MCP Server

An [MCP](https://modelcontextprotocol.io) server for **[ViralHunt.io](https://viralhunt.io)** — the
all-in-one platform to **discover what's trending, curate it with your team, and publish everywhere**.
A BuzzSumo alternative with a built-in cross-network scheduler and an API that AI agents can drive
end to end.

Get a free token: **https://viralhunt.io** → Account → API Access (7-day trial, no card). Full API
docs: **https://viralhunt.io/api**.

## What an agent can do through this MCP server

These are the tools this server exposes (they drive the full **discover → publish → verify → correct**
loop):

| Tool | What it does |
|------|--------------|
| `viralhunt_trending` | **Find topics** — what's going viral on TikTok / Instagram / X / Facebook / Pinterest / RSS, ranked by viral score (engagement velocity) |
| `viralhunt_targets` | List your **brands/projects** and the connected accounts you can post to |
| `viralhunt_schedule` | **Publish now or schedule** a post (text + media) across your connected accounts |
| `viralhunt_get_post` | Check a post's status + per-network permalinks |
| `viralhunt_update_post` | Edit a still-scheduled post (body / media / networks / time) |
| `viralhunt_cancel_post` | Cancel the not-yet-published targets of a scheduled post |

Guardrails baked in: it won't post to the wrong brand, only schedules in the future, and is told not to
repost fake news / copyrighted media / spam.

## What ViralHunt the platform does (beyond this MCP)

ViralHunt is a full product; the tools above are the agent-drivable slice. The rest lives in the app
(and some via the [REST API](https://viralhunt.io/api)):

- **Trending Radar** — a live cross-network feed of viral content by niche and time window.
- **Cross-network publishing & scheduling** — schedule/publish to **up to 11 networks** (Instagram,
  Facebook, TikTok, X, LinkedIn, YouTube, Pinterest, Threads, Bluesky, Telegram, Google Business),
  per brand.
- **Editorial Board (team)** — a kanban to curate before publishing: columns, categories, assignments,
  comments and team chat, so a team manages what goes out. (Cards/columns/comments are in the REST API.)
- **Auto-DM (comment → DM automation)** — when someone comments your keyword on Instagram, ViralHunt
  auto-replies and sends them a DM — like ManyChat, but flat pricing, unlimited contacts, and a monthly
  cap that resets. Configured in the app (runs via webhooks); Facebook next.
- **Reports** — what each brand/network actually did: posts, reach, DMs sent, replies, top content.

> Note: Auto-DM and the editorial board are **product features**, not tools this MCP exposes today. This
> server focuses on the discover → publish → manage loop.

## Install (Claude Desktop / Cline)

```json
{
  "mcpServers": {
    "viralhunt": {
      "command": "npx",
      "args": ["-y", "viralhunt-mcp"],
      "env": { "VIRALHUNT_API_KEY": "vhk_your_token_here" }
    }
  }
}
```

Config: `VIRALHUNT_API_KEY` (your `vhk_…` token, required) and `VIRALHUNT_BASE_URL` (optional, defaults
to the production API). Run locally: `VIRALHUNT_API_KEY=vhk_... npx viralhunt-mcp` (Node ≥ 18).

Listed on the [Official MCP Registry](https://registry.modelcontextprotocol.io) as
`io.github.rodvan/viralhunt-mcp`. License: MIT.
