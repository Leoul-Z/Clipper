import { limit } from "@grammyjs/ratelimiter";
import { MyContext } from "../index";

export const rateLimiter = limit({
  // Allow only 5 messages to be handled every 2 seconds.
  timeFrame: 2000,
  limit: 5,
  // "The rate limit is applied to every user independently."
  onLimitExceeded: async (ctx: any) => {
    await ctx.reply("Please slow down! You are sending requests too fast.");
  },
  keyGenerator: (ctx: any) => {
    return ctx.from?.id.toString();
  },
});
