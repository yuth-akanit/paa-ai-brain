import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LINE_CHANNEL_SECRET: z.string().min(1).optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).optional(),
  LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR: z.string().min(1).optional(),
  LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR: z.string().min(1).optional(),
  LINE_ADMIN_NOTIFY_TARGETS: z.string().min(1).optional(),
  LINE_ADMIN_BOOKING_WEBHOOK_URL: z.string().url().default("https://admin.paaair.online/webhook/line-admin-booking"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AI_GATEWAY_INTERNAL_KEY: z.string().min(1).optional()
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
    LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR: process.env.LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR,
    LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR: process.env.LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR,
    LINE_ADMIN_NOTIFY_TARGETS: process.env.LINE_ADMIN_NOTIFY_TARGETS,
    LINE_ADMIN_BOOKING_WEBHOOK_URL: process.env.LINE_ADMIN_BOOKING_WEBHOOK_URL,
    APP_BASE_URL: process.env.APP_BASE_URL,
    AI_GATEWAY_INTERNAL_KEY: process.env.AI_GATEWAY_INTERNAL_KEY
  });

  return cachedEnv;
}
