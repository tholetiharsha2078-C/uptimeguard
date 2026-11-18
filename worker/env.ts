export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  ENVIRONMENT: string;
  DEMO_MODE?: string;
  RESEND_API_KEY?: string;
  ALERT_FROM_EMAIL?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  defaultIntervalMinutes: number;
  createdAt: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
    sessionTokenHash: string;
  };
};
