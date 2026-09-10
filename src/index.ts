import { Bot, Context, session } from "grammy";
import { ConversationFlavor, conversations } from "@grammyjs/conversations";
import { env } from "./config/env";
import { clipperFlow } from "./handlers/clipperFlow";
import { setupAdminHandlers } from "./handlers/adminFlow";
import { prisma } from "./database/client";
import { rateLimiter } from "./middlewares/rateLimit";
import { PrismaSessionAdapter } from "./database/session";

interface SessionData {
  rejectUserId?: string;
  rejectMessageId?: number;
  rejectChatId?: number;
  rejectMessageText?: string;
}

export type BaseContext = Context & { session: SessionData };
export type MyContext = BaseContext & ConversationFlavor<BaseContext>;

const bot = new Bot<MyContext>(env.BOT_TOKEN);

// Apply rate limiter
bot.use(rateLimiter);

// Session & Conversations
bot.use(session({
  initial: (): SessionData => ({}),
  storage: new PrismaSessionAdapter(),
}));
bot.use(conversations());

// Global Error Handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  console.error(e);
});

// Setup Handlers
clipperFlow(bot);
setupAdminHandlers(bot);

// Basic help command
bot.command("help", async (ctx) => {
  await ctx.reply("Available commands:\n/start - Start the Clipper Registration process");
});

// Graceful Shutdown
const stopRunner = () => {
  console.log("Stopping bot...");
  bot.stop();
  prisma.$disconnect();
  process.exit(0);
};

process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);

console.log("Setting up bot commands...");
bot.api.setMyCommands([
  { command: "start", description: "Start the bot / Open Menu" },
  { command: "help", description: "Show help message" }
]).catch(console.error);

bot.api.setMyCommands([
  { command: "start", description: "Start the bot / Open Menu" },
  { command: "help", description: "Show help message" },
  { command: "users", description: "Admin: View clippers leaderboard" },
  { command: "setviews", description: "Admin: Set user views" },
  { command: "setvideos", description: "Admin: Set user video count" },
], { scope: { type: "chat", chat_id: env.ADMIN_CHAT_ID } }).catch(console.error);

console.log("Starting bot...");
bot.start();
