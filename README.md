# ViralHunt MCP Server

An [MCP](https://modelcontextprotocol.io) server for **[ViralHunt.io](https://viralhunt.io)** — a
trending-content radar + cross-network social scheduler. It gives any MCP client the full agent
loop: **find what's trending → publish/schedule → verify → edit/cancel**.

A BuzzSumo alternative with an API agents can drive end to end.

## Tools

| Tool | What it does |
|------|--------------|
| `viralhunt_trending` | Find viral posts on TikTok / Instagram / X / Facebook / Pinterest / RSS, ranked by viral score |
| `viralhunt_targets` | List your projects/brands and the connected accounts you can post to |
| `viralhunt_schedule` | Publish now or schedule a post (text + media) to your accounts |
| `viralhunt_get_post` | Get a post's status + per-network permalinks |
| `viralhunt_update_post` | Edit a still-scheduled post (body / media / networks / time) |
| `viralhunt_cancel_post` | Cancel the not-yet-published targets of a scheduled post |

## Get a token

1. Sign up at **https://viralhunt.io** (free 7-day trial, no card).
2. **Account → API Access** → create a personal token (`vhk_…`).

## Configure

Set two environment variables:

- `VIRALHUNT_API_KEY` — your `vhk_…` token (required)
- `VIRALHUNT_BASE_URL` — optional, defaults to `https://viralhunt.io/tool/api/v1`

### Claude Desktop / Cline (`mcp` config)

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

## Run locally

```bash
VIRALHUNT_API_KEY=vhk_... npx viralhunt-mcp
```

Requires Node ≥ 18. Docs: **https://viralhunt.io/api** · License: MIT.
