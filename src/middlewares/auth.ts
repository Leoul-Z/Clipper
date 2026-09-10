import { Context } from "grammy";
import { env } from "../config/env";

export const isAdmin = (ctx: Context) => {
  return ctx.chat?.id.toString() === env.ADMIN_CHAT_ID || 
         ctx.from?.id.toString() === env.ADMIN_CHAT_ID;
};

export const adminGuard = async (ctx: Context, next: () => Promise<void>) => {
  if (isAdmin(ctx)) {
    await next();
  }
};
