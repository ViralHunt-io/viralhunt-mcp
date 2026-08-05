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

const server = new McpServer({ name: "viralhunt", version: "0.1.0" });

// ── Discover trending content ──
tool(server, "viralhunt_trending",
  "Find trending/viral posts on a social network, ranked by viral score (engagement velocity).",
  {
    source: z.enum(["tiktok", "instagram", "x", "facebook", "pinterest", "rss"]).describe("Which network to pull trending from."),
    sort: z.string().optional().describe("viral (default), most_liked, most_viewed, most_commented, newest, …"),
    time_range: z.enum(["24h", "7d", "30d", "3m", "all"]).optional().describe("Time window (default 7d)."),
    keyword: z.string().optional().describe("Filter by keyword/niche."),
    per_page: z.number().int().min(1).max(100).optional().describe("How many results (max 100)."),
  },
  (a) => vh("/trending.php", { query: { source: a.source, sort: a.sort || "viral", time_range: a.time_range || "7d", keyword: a.keyword, per_page: a.per_page || 20 } })
);

// ── Where can I publish (projects + connected accounts) ──
tool(server, "viralhunt_targets",
  "List the user's projects/brands and the connected social accounts you can publish to in each.",
  { project: z.string().optional().describe("Project name to scope the accounts to (optional).") },
  (a) => vh("/schedule.php", { query: { action: "targets", project: a.project } })
);

// ── Publish now or schedule ──
tool(server, "viralhunt_schedule",
  "Publish now or schedule a post (text + media URLs) to a project's connected accounts. Verify content before posting — never publish fake news, copyrighted media, or spam.",
  {
    project: z.string().optional().describe("Project name — REQUIRED if the org has more than one project."),
    project_id: z.number().int().optional().describe("Project id — alternative to project name."),
    body: z.string().optional().describe("Caption/text. Optional if media is provided."),
    media: z.array(z.string()).optional().describe("Public image/video URLs."),
    networks: z.array(z.string()).optional().describe('Post to every account on these networks, e.g. ["instagram","facebook"].'),
    target_account_ids: z.array(z.number().int()).optional().describe("Exact account ids (from viralhunt_targets). Omit = all accounts in the project."),
    scheduled_at: z.string().optional().describe("ISO-8601 UTC, e.g. 2026-08-01T15:30:00Z. Omit = publish now."),
    first_comment: z.string().optional().describe("Optional first comment (link-in-comments)."),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "create" }, body: {
    project: a.project, project_id: a.project_id, body: a.body, media: a.media,
    networks: a.networks, target_account_ids: a.target_account_ids, scheduled_at: a.scheduled_at, first_comment: a.first_comment,
  } })
);

// ── Check status ──
tool(server, "viralhunt_get_post",
  "Get the current status and per-network results (incl. permalinks) of a post you created.",
  { id: z.number().int().describe("The post id returned by viralhunt_schedule.") },
  (a) => vh("/schedule.php", { query: { action: "get", id: a.id } })
);

// ── Edit a scheduled post ──
tool(server, "viralhunt_update_post",
  "Edit a still-scheduled post. Only works while status is 'scheduled' and >5 min before publish. Only the fields you send change; the project cannot be changed. Check status with viralhunt_get_post first; on a 409 error re-fetch instead of retrying.",
  {
    id: z.number().int().describe("The post id."),
    body: z.string().optional().describe("New caption."),
    media: z.array(z.string()).optional().describe("New media URLs (replaces the set)."),
    networks: z.array(z.string()).optional().describe("New network set (adds/removes targets)."),
    target_account_ids: z.array(z.number().int()).optional().describe("New exact account-id set."),
    scheduled_at: z.string().optional().describe("New ISO-8601 UTC time (must be in the future)."),
  },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "update" }, body: {
    id: a.id, body: a.body, media: a.media, networks: a.networks, target_account_ids: a.target_account_ids, scheduled_at: a.scheduled_at,
  } })
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
  },
  (a) => vh("/templates.php", { query: { category: a.category, media_type: a.media_type, network: a.network, q: a.q, assigned: a.assigned ? 1 : undefined, project_id: a.project_id } })
);

// ── Content templates: the full layout to render ──
tool(server, "viralhunt_get_template",
  "Get one template's full spec: html, css, the variable manifest (with hard rules per variable), formats, palette tokens, embedded fonts and render_tech. Fill every {{variable}}, then render with headless Chrome at the chosen format's size and WAIT for [data-vh-ready='1'] before screenshotting .vh-card.",
  {
    slug: z.string().optional().describe("Template slug, e.g. vh-image-card."),
    id: z.number().int().optional().describe("Template id — alternative to slug."),
  },
  (a) => vh("/templates.php", { query: { slug: a.slug, id: a.id } })
);

// ── Cancel a scheduled post ──
tool(server, "viralhunt_cancel_post",
  "Cancel the not-yet-published targets of a scheduled post. If everything already published you'll get a 409 — delete it from the platform instead.",
  { id: z.number().int().describe("The post id.") },
  (a) => vh("/schedule.php", { method: "POST", query: { action: "cancel" }, body: { id: a.id } })
);

await server.connect(new StdioServerTransport());
console.error("viralhunt-mcp running (base: " + BASE_URL + ")");
