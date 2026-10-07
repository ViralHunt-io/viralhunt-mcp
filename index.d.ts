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
  | 'viralhunt_approve_draft'
  | 'viralhunt_assign_template'
  | 'viralhunt_best_communities'
  | 'viralhunt_best_time'
  | 'viralhunt_board_context'
  | 'viralhunt_cancel_post'
  | 'viralhunt_card_comments'
  | 'viralhunt_create_card'
  | 'viralhunt_drafts'
  | 'viralhunt_edit_log'
  | 'viralhunt_get_post'
  | 'viralhunt_get_template'
  | 'viralhunt_list_templates'
  | 'viralhunt_mark_quote_used'
  | 'viralhunt_move_card'
  | 'viralhunt_my_cards'
  | 'viralhunt_policy'
  | 'viralhunt_quotes'
  | 'viralhunt_recipe_ran'
  | 'viralhunt_recipes'
  | 'viralhunt_review_draft'
  | 'viralhunt_review_queue'
  | 'viralhunt_news_categories'
  | 'viralhunt_review_stats'
  | 'viralhunt_schedule'
  | 'viralhunt_search'
  | 'viralhunt_stats'
  | 'viralhunt_submit_draft'
  | 'viralhunt_sync_post'
  | 'viralhunt_targets'
  | 'viralhunt_top_hashtags'
  | 'viralhunt_translate_post'
  | 'viralhunt_trending'
  | 'viralhunt_trending_sounds'
  | 'viralhunt_update_post'
  | 'viralhunt_upsert_template';

/** Where a post sits before it is sent: being worked on, or complete and waiting for an owner or admin. */
export type PostStage = 'draft' | 'review';

/** The status of a scheduled post as the API reports it. */
export type PostStatus = PostStage | 'scheduled' | 'processing' | 'published' | 'partial' | 'failed' | 'canceled';
