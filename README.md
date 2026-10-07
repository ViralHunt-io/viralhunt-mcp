# ViralHunt MCP Server

An [MCP](https://modelcontextprotocol.io) server for **[ViralHunt.io](https://viralhunt.io)** — the
all-in-one platform to **discover what's trending, curate it with your team, and publish everywhere**.
A BuzzSumo alternative with a built-in cross-network scheduler and an API that AI agents can drive
end to end.

Get a free token: **https://viralhunt.io/claude** → create the free account (free forever, no card, 24 content queries a day), then Account → API Access. Full API
docs: **https://viralhunt.io/api**.

## What an agent can do through this MCP server

These are the tools this server exposes (they drive the full **discover → time it → publish → verify →
correct** loop). Every number comes with its sample size and time window, so an agent can say how
much to trust it:

| Tool | What it does |
|------|--------------|
| `viralhunt_account` | **Who is this key** — plan, daily quota left, credits, per-endpoint rules (call first) |
| `viralhunt_trending` | **Find topics** — what's going viral on TikTok, Instagram, X, Facebook, Pinterest, Bluesky, Douyin, Reddit, Mastodon, Tumblr, Hacker News and news RSS, ranked by viral score, each post with `growth_24h` (how much it moved between our two most distant readings); `author` narrows to one page or account |
| `viralhunt_search` | **One keyword, every network** — merged and ranked, with per-network totals |
| `viralhunt_best_time` | **When to post** — best weekday + hour per network from the posts that went viral there (365-day sample, hit rate, sample size, your time zone, optional niche keyword) |
| `viralhunt_top_hashtags` | **Which hashtags** — top tags per network or across all, by engagement, posts or per-post; one tag's breakdown by network |
| `viralhunt_trending_sounds` | **Which sound** — trending audio on TikTok, Instagram Reels and Douyin, cross-network sounds first, with the posts that used it |
| `viralhunt_best_communities` | **Where to post** — best subreddits (peak per 1,000 members, timing, top posts, similar) and Bluesky custom feeds for a topic |
| `viralhunt_targets` | List your **brands/projects** and the connected accounts you can post to, with `needs_reconnect`, per-network `media_limits` and the projects linked in another language |
| `viralhunt_schedule` | **Publish now, schedule, or leave a draft** (text + media, per-network copy, a first comment, or a `design` on a template the app renders when a person approves) |
| `viralhunt_drafts` | **The drafts waiting** for a review and an approval, with their reviews |
| `viralhunt_review_draft` | **Review a draft** — verdict, score, per-network warnings, a note (an agent as the team's checker) |
| `viralhunt_policy` | **The content rule** a reviewer applies before any OK: block and fix lists with codes, six scores and thresholds, per-network notes (read it first, every pass) |
| `viralhunt_review_queue` | **What needs a review**: posts in Review with no verdict on their current content |
| `viralhunt_calendar` | **The days worth a post**: international days and science/tech/space/health anniversaries with why, by window and category |
| `viralhunt_news_categories` | **The news categories** with counts; pass one as `category` to `viralhunt_trending` (rss) |
| `viralhunt_review_stats` | **Flags per collaborator** by week, fortnight or month: reviews, ok / fix / block, rule codes, average risk10 |
| `viralhunt_approve_draft` | **Send a draft** (owner/admin token, with the user's yes), optionally with its translations |
| `viralhunt_translate_post` | **The same post in another language** — the app adapts the copy and the template's texts for a linked project |
| `viralhunt_edit_log` | **Learn from the edits** — what people changed in drafts after the agent left them |
| `viralhunt_get_post` | Check a post's status + per-network results, permalinks and each network's own reason when it refused |
| `viralhunt_sync_post` | Refresh statuses from the networks |
| `viralhunt_update_post` | Edit a draft (anything, incl. the rendered `png`) or a still-scheduled post (body / media / networks / time) |
| `viralhunt_cancel_post` | Cancel the not-yet-published targets of a scheduled post, or drop a draft |
| `viralhunt_stats` | **What performed** — engagement of the published posts by network, by brand, top posts |
| `viralhunt_quotes` / `viralhunt_mark_quote_used` | The **quotes base** for daily-quote series (public domain by default, author context, portraits) |
| `viralhunt_recipes` / `viralhunt_recipe_ran` | **Standing orders** a person saved in the app: source, template, cadence; stamp a run |
| `viralhunt_list_templates` | Browse the **content template** library (on-brand layouts you fill; favourites first) |
| `viralhunt_get_template` | Get one template's full spec (html + css + variable manifest, what is `static` and what is `dynamic`, what it `suits`, the owner's `instructions`) to render |
| `viralhunt_upsert_template` | **Author or edit a template** — editing a curated one clones it into your copy (owner/admin) |
| `viralhunt_assign_template` | Assign a template to a project so its agents can use it (owner/admin) |
| `viralhunt_board_context` | The team's **Editorial Board** in one call: members (with ids), columns, categories |
| `viralhunt_create_card` | **Hand a post to a teammate** — create a kanban card (URL metadata auto-filled, assignee, priority, due date, category) |
| `viralhunt_move_card` | Move a card to another column (the `is_done` column completes it) |
| `viralhunt_my_cards` | The cards assigned to you (when the token belongs to an agent member of the team) |
| `viralhunt_card_comments` | Read or add comments on a card (notifies the assignee, mirrors to team chat) |

Guardrails baked in: it won't post to the wrong brand, only schedules in the future, drafts by default
unless the user asked to publish now, never uses another page's text or branded picture, checks each
network's media ceilings, and is told not to repost fake news / copyrighted media / spam.

## Changelog

- **1.1.6 (2026-10-07)** — the safety catch on a trusted reviewer's OK (risk_threshold), project_lang on drafts, review_stats for trusted reviewers.
- **1.1.5 (2026-10-07)** — `viralhunt_calendar`: the calendar base (international days and anniversaries, with why), mark_used.
- **1.1.4 (2026-10-07)** — `viralhunt_news_categories` and `category` on `viralhunt_trending` (rss); unknown parameters are a 422 on the API.
- **1.1.3 (2026-10-07)** — the policy describes the kinds (fact, meme, quote, opinion, promo): a meme or a quote never gets a source or DOI demand.
- **1.1.2 (2026-10-06)** — `content_hash` on `viralhunt_review_draft` (409 content_changed when the post moved under the reviewer); self review is by user, not token.
- **1.1.1 (2026-10-06)** — the reviewer's four extra checks (picture against text, spelling, AI-written, facts with the DOI rule), `risk10` 1 to 10 on every review, `viralhunt_review_stats` (flags per collaborator).
- **1.1.0 (2026-10-05)** — the reviewer job: `viralhunt_policy`, `viralhunt_review_queue`, `needs_review` on drafts; the server recalculates the verdict and names in `sent.skipped` the rule that kept an OK from sending.
- **0.3.0 (2026-09-28)** — drafts and review (`viralhunt_drafts`, `viralhunt_review_draft`,
  `viralhunt_approve_draft`, `viralhunt_edit_log`), translation into a linked project's language
  (`viralhunt_translate_post`), `design` on a post and `png` on update, `viralhunt_search`,
  `viralhunt_account`, `viralhunt_stats`, `viralhunt_quotes`, `viralhunt_recipes`, `viralhunt_sync_post`;
  `author` and free-form `time_range` on trending; `media_limits`, `needs_reconnect` and language links on
  targets; templates say what is static, dynamic and what they suit; honest post statuses with each
  network's reason.
- **0.2.x (2026-09-08)** — best time to post, top hashtags, trending sounds, best communities, the editorial
  board; Reddit, Mastodon, Tumblr and Hacker News on trending; `growth_24h` documented.
- **0.1.x (2026-08)** — trending, targets, publish/schedule, get, update, cancel, content templates.

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

> Note: Auto-DM and Reports are **product features**, not tools this MCP exposes today. The editorial
> board is exposed (context, cards, moves, comments) so an agent can hand content to a team instead
> of publishing it directly.

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
