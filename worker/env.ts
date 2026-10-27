export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Twitch application for sign-in. Without both, Compare explains that sign-in isn't set up. */
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  /** Comma-separated Twitch logins with admin rights. */
  ADMIN_LOGINS?: string;
}
