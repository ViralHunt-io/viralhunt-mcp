#!/usr/bin/env node
/**
 * ViralHunt MCP server — exposes the ViralHunt.io public API v1 as MCP tools so any MCP client
 * (Claude Desktop, Cline, etc.) can run the full loop: find trending content → publish/schedule →
 * verify → edit/cancel.
 *
 * Config via environment:
 *   VIRALHUNT_API_KEY   required — a personal token (vhk_…) from viralhunt.io → Account → API Access
 *   VIRALHUNT_BASE_URL  optional — defaults to https://viralhunt.io/tool/api/v1
 *
 * No token is stored here; it's read from the env and sent as a Bearer header per request.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// One version, read from package.json: the server announced 0.1.0 while the package was at 0.1.5
// for several releases, so directories showed a version that matched nothing they could install.
const PKG = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "package.json"), "utf8"));

const API_KEY = process.env.VIRALHUNT_API_KEY || "";
const BASE_URL = (process.env.VIRALHUNT_BASE_URL || "https://viralhunt.io/tool/api/v1").replace(/\/+$/, "");

/** Call the ViralHunt API. Returns parsed JSON; throws with the API's error message on failure. */
async function vh(path, { method = "GET", query = null, body = null } = {}) {
  if (!API_KEY) throw new Error("VIRALHUNT_API_KEY is not set. Get a token at viralhunt.io → Account → API Access.");
  let url = BASE_URL + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  const opts = { method, headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" } };
  if (body !== null) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`ViralHunt returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok || json?.success === false) {
    const e = json?.error || {};
    throw new Error(`ViralHunt API ${res.status} ${e.code || ""}: ${e.message || text.slice(0, 200)}`.trim());
  }
  return json.data ?? json;
}

/** Wrap a handler so any error is returned as a clean MCP error result (isError). */
function tool(server, name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    try {
      const data = await handler(args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: String(err?.message || err) }], isError: true };
    }
  });
}

const server = new McpServer({ name: "viralhunt", version: PKG.version });

// ── Discover trending content ──
tool(server, "viralhunt_trending",
  [
    "Find trending/viral posts on a social network, ranked by viral score (engagement velocity).",
    "Sources: tiktok, instagram, x, facebook, pinterest, bluesky, douyin, reddit, mastodon, tumblr, hackernews, and rss (news articles",
    "from 230 feeds plus articles discovered through social links, each with Facebook/Reddit/Bluesky/Hacker News/comment signals).",
    "Each post carries growth_24h when we hold at least two readings of it: {from, to, delta, percent, hours, measured_at, samples}.",
    "Read it carefully: growth_24h null means 'we cannot say', NOT zero (Facebook and Pinterest never carry it); delta 0 with",
    "samples >= 2 means measured and unchanged (flat), not missing; `hours` is the REAL window between the two readings (the newest",
    "reading at least 20h older than the latest, or the oldest one when the post is younger than that), so it is often under 24:",
    "quote it, never assume 24, and say 'in 24h' only when `full_window` is true; `percent` is null when `from` is under 100 (from zero or from a handful of interactions a percentage",
    "is noise) while `delta` always holds the absolute change. A high delta over few hours is what 'going viral right now' looks like.",
  ].join(" "),
  {
    source: z.enum(["tiktok", "instagram", "x", "facebook", "pinterest", "bluesky", "douyin", "reddit", "mastodon", "tumblr", "hackernews", "rss"]).describe("Which network to pull trending from."),
    sort: z.string().optional().describe("viral (default), engagement, newest, oldest, plus per network: most_liked, most_viewed, most_commented, most_retweeted, most_reposted, most_saved, most_upvoted (reddit), most_boosted (mastodon), most_noted (tumblr), most_points (hackernews); rss: trending, engagement, growth, bluesky, mentions, coverage, hn, comments."),
    time_range: z.string().optional().describe("Time window on the post's own publish date: any number with a unit (24h, 7d, 30d, 2w, 3m, 1y), a bare number of days, or all (default 7d). An unknown value is a 422. Tumblr's corpus fills slowly: use 30d or all there."),
    keyword: z.string().optional().describe("Filter by keyword/niche (matched in title, text, hashtags or author)."),
    author: z.string().optional().describe("ONE page or account only (facebook page name, x handle or name, tiktok or instagram username; contains-match). 'The most viral posts of the page X in 2025' = source + author + time_range=1y."),
    subreddit: z.string().optional().describe("reddit only: restrict to one subreddit (with or without r/)."),
    min_engagement: z.number().int().min(0).optional().describe("Minimum engagement on the network's main metric."),
    per_page: z.number().int().min(1).max(100).optional().describe("How many results (max 100)."),
    page: z.number().int().min(1).optional().describe("Page number for more results."),
  },
  (a) => vh("/trending.php", { query: { source: a.source, sort: a.sort || "viral", time_range: a.time_range || "7d", keyword: a.keyword, author: a.author, subreddit: a.subreddit, min_engagement: a.min_engagement, per_page: a.per_page || 20, page: a.page } })
);

// ── Who is this key: plan, quota, credits ──
tool(server, "viralhunt_account",
  "Who this key is: plan (free/creator/studio/agency), requests per hour, whether it can publish, today's daily content-query quota (free plan: 24 shared across trending, search, best-time, hashtags, sounds, communities), credits balance, and per-endpoint rules. Call it once at the start and again on a 429 or 402, and set expectations from it (free plan: trending is 72h delayed and numbers are withheld, never print 0).",
  {},
  () => vh("/account.php")
);

// ── One keyword, every network ──
tool(server, "viralhunt_search",
  [
    "Search one keyword across every network at once (or a chosen subset) and get one merged, ranked list: each row normalized to",
    "platform, id, title, description, post_url, thumbnail_url, author_name, author_handle, engagement_score, stats, growth_24h,",
    "created_at, plus the network's full row under raw. sources[] says per network how many posts matched (total), so you can tell the",
    "user where the topic lives and where the corpus holds nothing (total 0 = say so, never invent posts). All words must appear, in any order.",
    "Use viralhunt_trending when the user wants ONE network with its own sorts and paging.",
  ].join(" "),
  {
    keyword: z.string().describe("The words to find (all must appear)."),
    sources: z.string().optional().describe("all (default) or a comma list: pinterest,x,reddit,tiktok,instagram,facebook,bluesky,douyin,mastodon,tumblr,hackernews,rss."),
    time_range: z.string().optional().describe("Window on the post's own date (default 30d): a number with a unit, a bare number of days, or all."),
    per_source: z.number().int().min(1).max(50).optional().describe("Rows per network (default 10)."),
    sort: z.enum(["engagement", "recent"]).optional(),
    min_engagement: z.number().int().min(0).optional(),
  },
  (a) => vh("/search.php", { query: { keyword: a.keyword, sources: a.sources, time_range: a.time_range, per_source: a.per_source, sort: a.sort, min_engagement: a.min_engagement } })
);

// ── Where can I publish (projects + connected accounts) ──
tool(server, "viralhunt_targets",
  [
    "List the user's projects/brands and the connected social accounts you can publish to in each. Also returns needs_reconnect",
    "(expired connections: not targets until a person reconnects them in the app; name the network before publishing), media_limits",
    "per network (image bytes: bigger ones are re-encoded to fit; video bytes and seconds: a bigger or longer video is refused for that",
    "network only, with the numbers; text length), each project's lang and translates_to (linked projects in another language), and",
    "must_draft: '' = this token may publish directly; 'role' = a member or agent token: every post waits in Drafts for an owner or admin",
    "whatever draft says; 'review_mode' = the organization reviews every post. Read it before promising 'published'.",
  ].join(" "),
  { project: z.string().optional().describe("Project name to scope the accounts to (optional).") },
  (a) => vh("/schedule.php", { query: { action: "targets", project: a.project } })
);

// ── Publish now, schedule, or leave a draft ──
tool(server, "viralhunt_schedule",
  [
    "Publish now, schedule, or (default when the user did not ask to publish right now) leave a DRAFT of a post on a project's",
    "connected accounts. Ask the user before publishing or scheduling: it posts to real accounts. Verify content first: never fake",
    "news, copyrighted media or spam. Never use another page's text as the copy or its branded picture as the post's picture: the",
    "picture comes from the organization's templates (viralhunt_get_template), either rendered by you and passed in media, or passed",
    "as `design` with draft=true so the app renders it when a person approves. Returns {id, status, results, warnings, review_url}:",
    "status processing|scheduled|review|draft|partial|failed; results keyed by account id carry each network's own reason when it refused.",
    "Two stages sit before sending: Drafts (being worked on) and Review (complete, dated, waiting for an owner or admin). Say which one the post is in.",
  ].join(" "),
  {
    project: z.string().optional().describe("Project name — REQUIRED if the org has more than one project."),
    project_id: z.number().int().optional().describe("Project id — alternative to project name."),
    body: z.string().optional().describe("Caption/text. Optional if media or design is provided."),
    media: z.array(z.string()).optional().describe("Public image/video URLs. Check media_limits (viralhunt_targets) before a big video."),
    networks: z.array(z.string()).optional().describe('Post to every account on these networks, e.g. ["instagram","facebook"].'),
    target_account_ids: z.array(z.number().int()).optional().describe("Exact account ids (from viralhunt_targets). Omit = all accounts in the project."),
    scheduled_at: z.string().optional().describe("ISO-8601 UTC, e.g. 2026-08-01T15:30:00Z. Omit = publish now (or, with draft, the tentative time is 'when approved')."),
    first_comment: z.string().optional().describe("Optional first comment (link-in-comments)."),
    draft: z.boolean().optional().describe("true = a working copy in Drafts you still mean to edit (viralhunt_update_post, then viralhunt_submit_draft). Without it, a member or agent token lands the complete post in Review, where an owner or admin authorizes it; nothing is sent either way. An owner token publishes directly."),
    overrides: z.object({}).passthrough().optional().describe('Per-network (or per account id) copy or media: {"bluesky": {"body": "short version"}, "12": {"media": ["…"]}}. Bluesky takes 300 characters, X 280.'),
    card_id: z.number().int().optional().describe("The Editorial Board card this post comes from (optional)."),
    design: z.object({}).passthrough().optional().describe('The picture as a filled template instead of a rendered file: {"template": "<slug or id>", "format": "feed", "variables": {"text": "…", "highlight": "…", "image": "https://…", "caption": "…"}}. Needs draft=true when media is empty; the app renders it when a person approves.'),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "create" }, body: {
    project: a.project, project_id: a.project_id, body: a.body, media: a.media,
    networks: a.networks, target_account_ids: a.target_account_ids, scheduled_at: a.scheduled_at, first_comment: a.first_comment,
    draft: a.draft ? true : undefined, overrides: a.overrides, card_id: a.card_id, design: a.design,
  } })
);

// ── Drafts: the limbo before sending ──
tool(server, "viralhunt_drafts",
  "List the posts not yet sent (this project, or every project with all=true): stage 'draft' = being worked on, 'review' = complete and dated, waiting for an owner or admin. Each carries stage, body, media, targets, scheduled_at, overrides, card_id, submitted_via (api = from an agent), design, lang, translated_from_id and review {score, verdict, reviewed_at, entries[]}.",
  {
    project: z.string().optional().describe("Project name (default: the org's first project)."),
    project_id: z.number().int().optional(),
    all: z.boolean().optional().describe("true = every project of the organization."),
    stage: z.enum(["draft", "review"]).optional().describe("One stage only (default: both)."),
  },
  (a) => vh("/schedule.php", { query: { action: "drafts", project: a.project, project_id: a.project_id, all: a.all ? 1 : undefined, stage: a.stage } })
);

tool(server, "viralhunt_submit_draft",
  "Move a draft to Review once it is complete (a body or media, and at least one account): it waits there for an owner or admin to authorize it. now=true clears the time (it goes out when authorized); scheduled_at sets one; neither keeps the draft's own. Nothing is sent.",
  {
    id: z.number().int().describe("The draft id."),
    now: z.boolean().optional(),
    scheduled_at: z.string().optional().describe("ISO-8601 UTC."),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "submit" }, body: { id: a.id, now: a.now ? 1 : undefined, scheduled_at: a.scheduled_at } })
);

tool(server, "viralhunt_review_draft",
  [
    "Append your review to a post in Review: verdict ok|fix|block, a score 0-100, per-topic scores (tos_risk, fake_news, sensationalism, grammar),",
    "`fix` sends the post back to Drafts with your note (the answer carries returned: true).",
    "one warning per issue with the network it concerns, and a short note on how to fix it. Judge each target network's terms (violence,",
    "health claims, politics, minors, copyright, spam), unverified claims (cross-check with viralhunt_search / trending rss), sensationalism,",
    "grammar. `block` only for what must not go out as it is. If the organization sends drafts by themselves on an OK review, an `ok` verdict",
    "SENDS the draft and the answer carries `sent`: give ok only when you would approve it yourself, and tell the user.",
  ].join(" "),
  {
    id: z.number().int().describe("The draft id."),
    verdict: z.enum(["ok", "fix", "block"]),
    score: z.number().int().min(0).max(100).optional(),
    scores: z.object({}).passthrough().optional().describe('{"tos_risk": 90, "fake_news": 70, "sensationalism": 80, "grammar": 95}'),
    warnings: z.array(z.object({ code: z.string().optional(), network: z.string().optional(), text: z.string(), severity: z.enum(["info", "warn", "block"]).optional() })).optional(),
    note: z.string().optional().describe("How to fix it, and the source you verified against."),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "review" }, body: { id: a.id, verdict: a.verdict, score: a.score, scores: a.scores, warnings: a.warnings, note: a.note } })
);

tool(server, "viralhunt_approve_draft",
  [
    "Send a draft (owner or admin token only, and never without the user's explicit yes). A draft blocked by its last review cannot be",
    "approved until it is fixed and reviewed again. `translations` makes the translated draft in each linked project in the same call",
    "(see viralhunt_translate_post). Returns {status, results, warnings, translations[]}.",
  ].join(" "),
  {
    id: z.number().int().describe("The draft id."),
    translations: z.array(z.object({ project_id: z.number().int(), lang: z.string().optional(), account_ids: z.array(z.number().int()).optional(), image: z.string().optional(), send_mode: z.enum(["draft", "send"]).optional() })).optional(),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "approve" }, body: { id: a.id, translations: a.translations } })
);

tool(server, "viralhunt_translate_post",
  [
    "Make the translated draft of a post (a draft or one already sent) in a linked project that publishes in another language. The app",
    "adapts the copy, the first comment, the per-network copies, the thread and the TEXT variables of a design (hashtags in the new",
    "language; links, mentions, numbers and names kept): do not translate yourself. A design keeps its picture and the answer carries",
    "needs_png=true with render {html, css, format}: render it, store the PNG with viralhunt_update_post {id, png}, then approve if wanted.",
    "A plain picture (no template) stays unless `image` hands the translated one. The same translation twice is refused.",
  ].join(" "),
  {
    id: z.number().int().describe("The source post id."),
    project_id: z.number().int().describe("The target project (from translates_to on viralhunt_targets)."),
    lang: z.string().optional().describe("Override the target language (es, en, pt, fr, de, it…)."),
    account_ids: z.array(z.number().int()).optional().describe("Accounts of the target project (default: all postable)."),
    image: z.string().optional().describe("https URL of the translated picture, for a post whose picture is not a template."),
    send_mode: z.enum(["draft", "send"]).optional().describe("draft (default) waits in the target project; send (owner/admin) goes out at once when there is nothing to render."),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "translate" }, body: { id: a.id, project_id: a.project_id, lang: a.lang, account_ids: a.account_ids, image: a.image, send_mode: a.send_mode } })
);

tool(server, "viralhunt_edit_log",
  "What people changed in drafts after an agent left them: one row per field (body, media, targets, scheduled_at, first_comment, overrides, thread, design) with before, after, who and when, plus by_field counts. Drafts with submitted_via=api came from an agent: those edits are what the person did not like. Read it at the start of each batch and apply the pattern (shorter captions, another picture, another hour).",
  {
    since: z.string().optional().describe("ISO-8601: only changes after this moment."),
    id: z.number().int().optional().describe("Only one draft's changes."),
    limit: z.number().int().min(1).max(500).optional(),
  },
  (a) => vh("/schedule.php", { query: { action: "edit_log", since: a.since, id: a.id, limit: a.limit } })
);

tool(server, "viralhunt_sync_post",
  "Refresh the status of this organization's posts from the networks (call before viralhunt_get_post when the answer matters). Returns how many rows were re-read.",
  {},
  () => vh("/schedule.php", { method: "POST", query: { action: "sync" }, body: {} })
);

// ── Check status ──
tool(server, "viralhunt_get_post",
  [
    "Get the current status and per-network results (incl. permalinks) of a post you created. Statuses: scheduled (queued), processing",
    "(handed to the networks, or a target being retried), published (every target live), partial (some refused: each failed",
    "results[account].error carries the network's own words and error_message sums it up), failed, draft, canceled. The app retries a",
    "transient failure up to three times (results show retries, will_retry, retry_after); a final reason (dead connection, refused text,",
    "oversized video) is not retried: tell the user what to fix. On a draft with a design the answer also carries render {html, css, format}.",
  ].join(" "),
  { id: z.number().int().describe("The post id returned by viralhunt_schedule.") },
  (a) => vh("/schedule.php", { query: { action: "get", id: a.id } })
);

// ── Edit a scheduled post or a draft ──
tool(server, "viralhunt_update_post",
  [
    "Edit a post. A DRAFT can be changed freely (body, media, overrides, first_comment, targets, scheduled_at, design, and png: the",
    "rendered picture of its design as a data:image/png;base64 URL, which becomes the post's first picture). A SCHEDULED post can be",
    "edited only while status is 'scheduled' and more than 5 min before publish. Only the fields you send change; the project cannot",
    "be changed. Check status with viralhunt_get_post first; on a 409 error re-fetch instead of retrying.",
  ].join(" "),
  {
    id: z.number().int().describe("The post id."),
    body: z.string().optional().describe("New caption."),
    media: z.array(z.string()).optional().describe("New media URLs (replaces the set)."),
    networks: z.array(z.string()).optional().describe("New network set (adds/removes targets)."),
    target_account_ids: z.array(z.number().int()).optional().describe("New exact account-id set."),
    scheduled_at: z.string().optional().describe("New ISO-8601 UTC time (must be in the future)."),
    first_comment: z.string().optional().describe("Drafts: the first comment."),
    overrides: z.object({}).passthrough().optional().describe("Drafts: per-network copy or media."),
    design: z.object({}).passthrough().optional().describe("Drafts: the filled template (see viralhunt_schedule)."),
    png: z.string().optional().describe("Drafts: data:image/png;base64,… of the rendered design; stored and made the post's first picture."),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "update" }, body: {
    id: a.id, body: a.body, media: a.media, networks: a.networks, target_account_ids: a.target_account_ids, scheduled_at: a.scheduled_at,
    first_comment: a.first_comment, overrides: a.overrides, design: a.design, png: a.png,
  } })
);

// ── What performed ──
tool(server, "viralhunt_stats",
  "Engagement of the published posts as the networks report it back: by_network, by_project and top_posts (with permalinks). ready=false means nothing collected yet. Use it to answer 'what worked' and to find more like the winners (viralhunt_search on the winning topic); never invent a number.",
  {
    project: z.string().optional(),
    project_id: z.number().int().optional(),
    network: z.string().optional(),
    days: z.number().int().min(1).max(365).optional().describe("Window in days (default 30)."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  (a) => vh("/stats.php", { query: { project: a.project, project_id: a.project_id, network: a.network, days: a.days, limit: a.limit } })
);

// ── Quotes base ──
tool(server, "viralhunt_quotes",
  [
    "Quotes ranked by our popularity score, for daily-quote series: text, author, author_context (description, born, died), work,",
    "categories, rights, popularity high|medium|low and author_image (portrait url, licence, credit). Default rights=public_domain",
    "(authors dead more than 70 years): keep it unless the user asks for a modern author, and with rights=any tell the user a quote is",
    "restricted before scheduling it under their brand. Write the caption's context FROM author_context and work, never from memory.",
    "categories_list=true lists the categories held. unused=true leaves out what this organization already used.",
  ].join(" "),
  {
    category: z.string().optional().describe("One category, e.g. stoicism."),
    categories: z.string().optional().describe("Several mixed: stoicism,leadership."),
    lang: z.enum(["en", "es"]).optional().describe("Language of the quote (default en)."),
    max_chars: z.number().int().min(20).max(600).optional().describe("Default 180: what the quote templates fit."),
    rights: z.enum(["public_domain", "any"]).optional(),
    author: z.string().optional().describe("Part of an author's name."),
    sort: z.enum(["score", "random"]).optional(),
    unused: z.boolean().optional(),
    categories_list: z.boolean().optional().describe("true = list the categories instead of quotes."),
    per_page: z.number().int().min(1).max(50).optional(),
    page: z.number().int().min(1).optional(),
  },
  (a) => vh("/quotes.php", { query: { category: a.category, categories: a.categories, lang: a.lang, max_chars: a.max_chars, rights: a.rights, author: a.author, sort: a.sort, unused: a.unused ? 1 : undefined, categories_list: a.categories_list ? 1 : undefined, per_page: a.per_page, page: a.page } })
);

tool(server, "viralhunt_mark_quote_used",
  "After scheduling a quote, mark it used for this organization so the next pick (unused=true) is a different one.",
  { quote_id: z.number().int(), note: z.string().optional().describe("e.g. 'scheduled 2026-09-20 09:00 instagram'.") },
  (a) => vh("/quotes.php", { method: "POST", body: { action: "mark_used", quote_id: a.quote_id, note: a.note } })
);

// ── Recipes: standing orders a person saved in the app ──
tool(server, "viralhunt_recipes",
  [
    "The standing orders of a brand, saved by a person in the app: each recipe says what to post from (source quotes|trending|manual with",
    "source_params, and source_call = the exact request that fetches the content), which template (template.slug for viralhunt_get_template),",
    "format, networks, cadence (daily|weekdays|weekly|manual), post_time in the project's timezone (null = the network's best time),",
    "caption_brief and last_run_at. Nothing runs on the server: you do the loop (fetch, fill, render, schedule, mark the quote used,",
    "then viralhunt_recipe_ran). daily with last_run_at older than today = due. Never run a paused recipe (is_active false).",
  ].join(" "),
  {
    project_id: z.number().int().optional().describe("One brand (default: every active recipe of the organization)."),
    active: z.boolean().optional(),
  },
  (a) => vh("/recipes.php", { query: { project_id: a.project_id, active: a.active === false ? 0 : 1 } })
);

tool(server, "viralhunt_recipe_ran",
  "Stamp a recipe run so the person sees in the app that it happened.",
  { recipe_id: z.number().int(), note: z.string().optional() },
  (a) => vh("/recipes.php", { method: "POST", body: { action: "ran", recipe_id: a.recipe_id, note: a.note } })
);

// ── Content templates: browse the library ──
tool(server, "viralhunt_list_templates",
  "List ViralHunt content templates (layouts you fill and render yourself). Lean by design — no html/css — so use viralhunt_get_template for the one you'll actually render.",
  {
    category: z.string().optional().describe("image | quote | video | top3 | …"),
    media_type: z.enum(["image", "video"]).optional().describe("Filter by what it renders to."),
    network: z.string().optional().describe("Only templates suited to this network."),
    project_id: z.number().int().optional().describe("With assigned=true, the project whose allowed templates you want."),
    assigned: z.boolean().optional().describe("true = only the templates assigned to project_id."),
    q: z.string().optional().describe("Search name/description."),
    favorites: z.boolean().optional().describe("true = only the templates the brand starred. Favourites come first in every list: prefer them when several fit."),
  },
  (a) => vh("/templates.php", { query: { category: a.category, media_type: a.media_type, network: a.network, q: a.q, assigned: a.assigned ? 1 : undefined, project_id: a.project_id, favorites: a.favorites ? 1 : undefined } })
);

// ── Content templates: the full layout to render ──
tool(server, "viralhunt_get_template",
  [
    "Get one template's full spec: html, css, the variable manifest (with hard rules per variable), formats, palette tokens, embedded fonts,",
    "render_tech, plus what is `static` (the owner fixed it: logo, frame, signature, fixed texts; never move, cover or restyle it), what is",
    "`dynamic` (the variables you fill: the picture, the headline, the caption that is the post body), what it `suits` (news, photo, quote,",
    "number, tip, on_this_day, meme, any) and the owner's `instructions` (they override any general rule). Fill every dynamic {{variable}},",
    "then render with headless Chrome at the chosen format's size and WAIT for [data-vh-ready='1'] before screenshotting .vh-card.",
  ].join(" "),
  {
    slug: z.string().optional().describe("Template slug, e.g. vh-image-card."),
    id: z.number().int().optional().describe("Template id — alternative to slug."),
  },
  (a) => vh("/templates.php", { query: { slug: a.slug, id: a.id } })
);

// ── Content templates: author or edit one ──
tool(server, "viralhunt_upsert_template",
  "Create or edit a content template (layout HTML/CSS + variable manifest). Editing a curated/global template CLONES it into the org's own copy — the global is never modified. Every {{placeholder}} in the html must be declared in variables, or the call is rejected. Owner/admin only. On update you may send only the fields that change.",
  {
    action: z.enum(["create", "update"]).optional().describe("create (default) or update."),
    id: z.number().int().optional().describe("On update: the template id to edit."),
    slug_ref: z.string().optional().describe("On update: the slug to edit, if you don't have the id."),
    slug: z.string().describe("Stable kebab-case id for the template, e.g. my-quote-card."),
    name: z.string().optional().describe("Human-readable name."),
    category: z.string().optional().describe("image | quote | video | top3 | …"),
    media_type: z.enum(["image", "video"]).optional(),
    network: z.string().optional().describe("Network it suits, or omit for any."),
    aspect: z.string().optional().describe("Default format's aspect, e.g. 4:5."),
    canvas_w: z.number().int().optional(),
    canvas_h: z.number().int().optional(),
    formats: z.array(z.object({}).passthrough()).optional().describe("[{name,w,h,aspect?,networks?,default?}] — the sizes this one layout ships."),
    description: z.string().optional(),
    html: z.string().optional().describe("Layout with {{variable}} placeholders. Max 256KB."),
    css: z.string().optional().describe("Styles; reference palette tokens via CSS vars. Max 256KB."),
    palette: z.object({}).passthrough().optional().describe("Design tokens → hex, e.g. {\"cyan\":\"#1edbee\"}."),
    fonts: z.array(z.object({}).passthrough()).optional().describe("[{family,weight,style,url_woff2}] — fonts must travel with the template."),
    variables: z.array(z.object({}).passthrough()).optional().describe("The manifest: [{key,label,type,description,rules,example,fallback,required}]."),
    content_source: z.object({}).passthrough().optional().describe("Optional curated-bank binding instead of generating values."),
    render_tech: z.string().optional().describe("How the agent turns this into a file."),
    is_active: z.boolean().optional(),
  },
  (a) => vh("/templates.php", { method: "POST", body: a })
);

// ── Content templates: wire one to a brand ──
tool(server, "viralhunt_assign_template",
  "Assign (or unassign) a content template to a project, so that project's agents see it via viralhunt_list_templates with assigned=true. Owner/admin only.",
  {
    project_id: z.number().int().describe("Project id (from viralhunt_targets)."),
    template_id: z.number().int().describe("Template id (from viralhunt_list_templates)."),
    action: z.enum(["add", "remove"]).optional().describe("add (default) or remove."),
  },
  (a) => vh("/template-assignments.php", { method: "POST", body: { project_id: a.project_id, template_id: a.template_id, action: a.action || "add" } })
);

// ── Cancel a scheduled post ──
tool(server, "viralhunt_cancel_post",
  "Cancel the not-yet-published targets of a scheduled post. If everything already published you'll get a 409 — delete it from the platform instead.",
  { id: z.number().int().describe("The post id.") },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "cancel" }, body: { id: a.id } })
);

// ── When to post ──
tool(server, "viralhunt_best_time",
  [
    "Best time to post on a network, measured on the posts that went viral there in the last 365 days (their OWN publish time).",
    "Returns best_slots (weekday + hour, ranked by average engagement, each with its sample size and hit_rate_pct = share of that slot's",
    "posts that reached the network's top 10%), worst_slot, today's best hours, by_hour and by_weekday tables, proof_posts, and",
    "sample {posts, window, from, to}. Read `confidence` (high >= 500 posts, medium >= 200, low) before quoting an hour. Hours are",
    "rotated to `timezone`; weekday aggregates stay UTC. With `keyword`, slots are recomputed on posts whose caption contains it;",
    "if that sample is under 200 posts the response says fallback:true and returns the network-wide slots instead.",
  ].join(" "),
  {
    network: z.enum(["tiktok", "instagram", "x", "facebook", "pinterest", "bluesky", "mastodon", "douyin", "tumblr", "reddit"]).describe("Which network."),
    timezone: z.string().optional().describe("IANA zone to express hours in, e.g. America/Mexico_City (default UTC)."),
    keyword: z.string().optional().describe("Optional niche word; slots recomputed on posts whose caption contains it (falls back when thin)."),
  },
  (a) => vh("/best-time.php", { query: { network: a.network, timezone: a.timezone, keyword: a.keyword } })
);

// ── Top hashtags ──
tool(server, "viralhunt_top_hashtags",
  [
    "Top hashtags from the captions of the posts we hold, per network or across all, optionally filtered to tags containing a word.",
    "Each row carries posts (sample size), total_engagement and per_post (the number to compare: a tag used less but hitting harder).",
    "`window` is all-time over the corpus with updated_at (there is no per-day hashtag history; say so if asked for 'this week').",
    "Pass `hashtag` to get one tag broken down by network with its top posts.",
  ].join(" "),
  {
    network: z.enum(["tiktok", "instagram", "x", "facebook", "pinterest", "bluesky", "mastodon", "douyin", "tumblr"]).optional().describe("One network, or omit for all networks summed."),
    q: z.string().optional().describe("Only hashtags containing this word (niche filter)."),
    hashtag: z.string().optional().describe("One hashtag (with or without #) for its per-network breakdown."),
    sort: z.enum(["engagement", "posts", "per_post"]).optional().describe("Ranking (default engagement)."),
    min_posts: z.number().int().min(1).optional().describe("Minimum posts a tag needs to be listed (default 3)."),
    per_page: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  },
  (a) => vh("/hashtags.php", { query: { network: a.network, q: a.q, hashtag: a.hashtag, sort: a.sort, min_posts: a.min_posts, per_page: a.per_page || 20, page: a.page } })
);

// ── Trending sounds ──
tool(server, "viralhunt_trending_sounds",
  [
    "Trending sounds/audio on TikTok, Instagram Reels and Douyin, ranked by the engagement of the posts that used them, cross-network",
    "sounds first. A sound is listed only when several different accounts used it (one account's audio is a voiceover, not a trend).",
    "Each sound carries networks{tiktok|instagram|douyin: posts, creators, eng, per_post}, cross (on more than one network) and stronger",
    "(tiktok|instagram|even, per post) when both sides are measured. Pass `slug` for one sound with the posts that used it.",
    "Window is all-time over the corpus.",
  ].join(" "),
  {
    network: z.enum(["tiktok", "instagram", "douyin", "all"]).optional().describe("One network or all (default all)."),
    q: z.string().optional().describe("Filter by words in the title or artist."),
    cross_only: z.boolean().optional().describe("Only sounds trending on more than one network."),
    slug: z.string().optional().describe("One sound's slug (from a previous result) for its detail and posts."),
    per_page: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  },
  (a) => vh("/sounds.php", { query: { network: a.network, q: a.q, cross_only: a.cross_only ? 1 : undefined, slug: a.slug, per_page: a.per_page || 20, page: a.page } })
);

// ── Best communities ──
tool(server, "viralhunt_best_communities",
  [
    "Where to post a topic: the best subreddits (network=reddit) or Bluesky custom feeds (network=bluesky) from our own measurements.",
    "Reddit rows are ranked by peak_per_1k, the best score we hold per 1,000 members (upside relative to size); no average score is",
    "published because a swept community's sample is its greatest hits. Each row carries members, sample.posts and the window of post",
    "dates. Pass `subreddit` for one community: timing (best UTC hours/day the climbing posts were posted), pace, flairs, type mix,",
    "top posts and similar communities. Bluesky rows carry posts, authors, avg_likes; pass `feed` (slug) for its top posts, authors, tags.",
  ].join(" "),
  {
    network: z.enum(["reddit", "bluesky"]).optional().describe("reddit (default) or bluesky."),
    q: z.string().optional().describe("Topic words matched against the community name (and, on Bluesky, the feed description)."),
    subreddit: z.string().optional().describe("reddit: one community by name for its full detail."),
    feed: z.string().optional().describe("bluesky: one feed by slug for its full detail."),
    sort: z.string().optional().describe("reddit: upside (default), members, peak, posts. bluesky: posts (default), avg_likes, top_likes, feed_likes."),
    min_members: z.number().int().min(0).optional().describe("reddit: only communities with at least this many members."),
    max_members: z.number().int().min(0).optional().describe("reddit: only communities with at most this many members (smaller rooms are easier to climb)."),
    per_page: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  },
  (a) => vh("/communities.php", { query: { network: a.network || "reddit", q: a.q, subreddit: a.subreddit, feed: a.feed, sort: a.sort, min_members: a.min_members, max_members: a.max_members, per_page: a.per_page || 20, page: a.page } })
);

// ── Editorial board (team kanban): curate before publishing ──
tool(server, "viralhunt_board_context",
  "The team's Editorial Board in one call: organization, members (people and agents, with ids to assign cards to), columns (with is_default / is_done flags) and categories. Call this before creating or moving cards.",
  {},
  () => vh("/context.php")
);

tool(server, "viralhunt_create_card",
  [
    "Create a card on the Editorial Board: a piece of content to curate, with an optional post URL (title/description/image are filled",
    "from the URL's metadata when omitted), assignee, priority, due date, category and column. Returns the card with its id.",
    "Use it to hand a trending post to a teammate instead of publishing it directly.",
  ].join(" "),
  {
    title: z.string().optional().describe("Card title (required unless post_url is given)."),
    post_url: z.string().optional().describe("The post/article this card is about; metadata is fetched when title/image are missing."),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    due_date: z.string().optional().describe("YYYY-MM-DD."),
    assigned_to_user_id: z.number().int().optional().describe("A member id from viralhunt_board_context."),
    category_id: z.number().int().optional(),
    card_type: z.string().optional().describe("Post, Note, Article, Video… (the org's card types)."),
    board_column_id: z.number().int().optional().describe("Target column (default: the board's default column)."),
    image_url: z.string().optional(),
    platform: z.string().optional().describe("tiktok, instagram, x, facebook, pinterest, rss… (detected from post_url when omitted)."),
    notes: z.string().optional(),
  },
  (a) => vh("/cards.php", { method: "POST", body: a })
);

tool(server, "viralhunt_move_card",
  "Move a card to another column (moving into the column flagged is_done completes it; a 'done' comment does not).",
  {
    card_id: z.number().int(),
    board_column_id: z.number().int().describe("Target column id from viralhunt_board_context."),
    position: z.number().int().min(0).optional().describe("Position inside the column (0 = top)."),
  },
  (a) => vh("/cards.php", { method: "POST", body: { action: "move", card_id: a.card_id, board_column_id: a.board_column_id, position: a.position } })
);

tool(server, "viralhunt_my_cards",
  "Cards assigned to the authenticated token's member (your own workload when you are an agent member of the team). Optional status filter.",
  {
    status: z.enum(["pending", "in_progress", "completed"]).optional(),
    project: z.string().optional().describe("Restrict to one project/brand by name."),
    per_page: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  },
  (a) => vh("/my-cards.php", { query: a })
);

tool(server, "viralhunt_card_comments",
  "Read the comments on a card, or add one (comment set). New comments notify the assignee and appear in the team chat's #board channel.",
  {
    card_id: z.number().int(),
    comment: z.string().optional().describe("When given, posts this comment; when omitted, lists the card's comments."),
  },
  (a) => a.comment
    ? vh("/comments.php", { method: "POST", body: { card_id: a.card_id, comment: a.comment } })
    : vh("/comments.php", { query: { card_id: a.card_id } })
);

await server.connect(new StdioServerTransport());
console.error("viralhunt-mcp running (base: " + BASE_URL + ")");
