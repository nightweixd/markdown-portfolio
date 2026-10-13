declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GMGN_API_KEY?: string;
    CHAINBASE_API_KEY?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    CRON_SECRET?: string;
    APP_PASSWORD?: string;
    STANDALONE_CLOUDFLARE?: string;
    DEFAULT_DATA_SOURCE?: string;
    GMGN_RETRY_AFTER?: string;
  }
}
