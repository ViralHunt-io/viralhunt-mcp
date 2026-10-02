/**
 * viralhunt-mcp — type declarations.
 *
 * The package is a command-line MCP server (`npx viralhunt-mcp`, speaking the Model Context Protocol over
 * stdio); it exposes no programmatic API. These declarations exist so TypeScript consumers that import the
 * module for its side effects, and the package registries that look for types, find them.
 */
export {};

/** Environment the server reads at start-up. */
export interface ViralHuntMcpEnv {
  /** A ViralHunt API token (vhk_…) from Account → API Access. Required. */
  VIRALHUNT_API_KEY: string;
  /** API base URL. Default: https://viralhunt.io/tool/api/v1 */
  VIRALHUNT_API_BASE?: string;
}

/** The tools the server registers, by name. */
export type ViralHuntTool =
  | 'viralhunt_account'
  | 'viralhunt_trending'
  | 'viralhunt_search'
  | 'viralhunt_best_time'
  | 'viralhunt_hashtags'
  | 'viralhunt_sounds'
  | 'viralhunt_communities'
  | 'viralhunt_templates'
  | 'viralhunt_quotes'
  | 'viralhunt_targets'
  | 'viralhunt_schedule'
  | 'viralhunt_drafts'
  | 'viralhunt_submit_draft'
  | 'viralhunt_review_draft'
  | 'viralhunt_approve_draft'
  | 'viralhunt_translate_post'
  | 'viralhunt_update_post'
  | 'viralhunt_cancel_post'
  | 'viralhunt_posts'
  | 'viralhunt_edit_log';

/** Where a post sits before it is sent: being worked on, or complete and waiting for an owner or admin. */
export type PostStage = 'draft' | 'review';

/** The status of a scheduled post as the API reports it. */
export type PostStatus = PostStage | 'scheduled' | 'processing' | 'published' | 'partial' | 'failed' | 'canceled';
