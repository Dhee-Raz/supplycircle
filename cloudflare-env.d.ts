declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY?: string;
    INVITATION_EMAIL_FROM?: string;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_FROM_NUMBER?: string;
    APP_BASE_URL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
