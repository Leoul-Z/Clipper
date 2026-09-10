import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ADMIN_CHAT_ID: z.string().min(1, "ADMIN_CHAT_ID is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
};

export const env = parseEnv();
