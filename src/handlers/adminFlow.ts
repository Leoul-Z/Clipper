import { Bot, InlineKeyboard } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import { prisma } from "../database/client";
import { generateVerificationCode } from "../utils/codes";
import { isAdmin, adminGuard } from "../middlewares/auth";
import { MyContext } from "../index";

type MyConversation = Conversation<MyContext, MyContext>;

async function adminRejectConversation(conversation: MyConversation, ctx: MyContext) {
  const userId = ctx.session.rejectUserId;
  const originalMessageText = ctx.session.rejectMessageText;
  if (!userId) return;

  await ctx.reply("Please reply with the reason for rejection:");
  const responseCtx = await conversation.waitFor("message:text");
  const reason = responseCtx.msg.text;

  const user = await conversation.external(() => prisma.user.findUnique({ where: { id: userId } }));

  if (!user || user.status !== "AWAITING_ADMIN") {
    await ctx.reply("User not found or not awaiting approval.");
    return;
  }

  await conversation.external(() => prisma.user.update({
    where: { id: userId },
    data: { status: "REJECTED" }
  }));

  await ctx.reply(`User rejected with reason:\n${reason}`);
  
  if (originalMessageText) {
    // If we wanted to, we could use the saved message ID to edit the original message in the admin chat
  }

  await ctx.api.sendMessage(
    Number(user.telegramId),
    `❌ We regret to inform you that your application for the Clipper Program has been rejected.\n\n<b>Reason:</b> ${reason}`,
    { parse_mode: "HTML" }
  );
  
  // clear session
  ctx.session.rejectUserId = undefined;
  ctx.session.rejectMessageText = undefined;
}

export function setupAdminHandlers(bot: Bot<MyContext>) {
  bot.use(createConversation(adminRejectConversation, "adminReject"));

  bot.command("users", adminGuard, async (ctx) => {
    const users = await prisma.user.findMany({
      orderBy: { views: 'desc' },
      take: 10
    });

    if (users.length === 0) {
      await ctx.reply("No users found.");
      return;
    }

    let message = "👥 <b>Admin Clippers Overview:</b>\n\n";
    for (const u of users) {
      const earnings = (u.views * 0.001).toFixed(2);
      message += `👤 @${u.username} | <code>${u.status}</code>\n`;
      message += `📊 Views: ${u.views} | Vids: ${u.videos} | Earned: ${earnings} Birr\n`;
      message += `🏦 Bank: ${u.bankName || 'N/A'} - Acc: ${u.accountNumber || 'N/A'}\n`;
      message += `🔗 YT: ${u.youtubeHandle || 'N/A'} | IG: ${u.instagramHandle || 'N/A'} | TT: ${u.tiktokHandle || 'N/A'}\n\n`;
    }

    await ctx.reply(message, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^approve_([0-9a-fA-F\-]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
      return;
    }

    const userId = ctx.match[1];
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== "AWAITING_ADMIN") {
      await ctx.answerCallbackQuery({ text: "User not found or not awaiting approval.", show_alert: true });
      return;
    }

    const ytCode = generateVerificationCode("YT");
    const igCode = generateVerificationCode("IG");
    const ttCode = generateVerificationCode("TT");

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: "CODES_ISSUED",
        ytCode,
        igCode,
        ttCode,
      }
    });

    await ctx.answerCallbackQuery({ text: "User approved. Codes generated." });
    
    // Update admin message to reflect approval
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + `\n\n✅ **APPROVED** by Admin. Codes issued.`
    );

    // Notify user
    const verifyKeyboard = new InlineKeyboard().text("Verify Bios", "verify_bios");
    
    await ctx.api.sendMessage(
      Number(user.telegramId),
      `🎉 <b>Your application was approved!</b>\n\n` +
      `Please place the following verification codes in the bio of your respective social media accounts:\n\n` +
      `📺 <b>YouTube:</b> <code>${ytCode}</code>\n` +
      `📸 <b>Instagram:</b> <code>${igCode}</code>\n` +
      `🎵 <b>TikTok:</b> <code>${ttCode}</code>\n\n` +
      `Once you have added these to your bios, click the button below to verify.`,
      { reply_markup: verifyKeyboard, parse_mode: "HTML" }
    );
  });

  bot.callbackQuery(/^reject_([0-9a-fA-F\-]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
      return;
    }

    const userId = ctx.match[1];
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== "AWAITING_ADMIN") {
      await ctx.answerCallbackQuery({ text: "User not found or not awaiting approval.", show_alert: true });
      return;
    }

    ctx.session.rejectUserId = userId;
    ctx.session.rejectMessageText = ctx.callbackQuery.message?.text;
    
    await ctx.answerCallbackQuery({ text: "Please provide a reason in the chat." });
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + `\n\n*(Pending Rejection Reason)*`
    );
    await ctx.conversation.enter("adminReject");
  });

  bot.callbackQuery(/^approve_bios_([0-9a-fA-F\-]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
      return;
    }

    const userId = ctx.match[1];
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== "AWAITING_BIO_APPROVAL") {
      await ctx.answerCallbackQuery({ text: "User not found or not awaiting bio approval.", show_alert: true });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: "PENDING_PAYMENT" }
    });

    await ctx.answerCallbackQuery({ text: "Bios approved!" });
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + `\n\n✅ <b>BIOS APPROVED</b> by Admin.`,
      { parse_mode: "HTML" }
    );

    const paymentKeyboard = new InlineKeyboard().text("💳 Set Up Payment Info", "start_payment_setup");

    await ctx.api.sendMessage(
      Number(user.telegramId),
      `🎉 <b>Bios Verified Successfully!</b>\n\n` +
      `Your social media handles have been approved.\n\n` +
      `Please click the button below to securely submit your payment information.`,
      { parse_mode: "HTML", reply_markup: paymentKeyboard }
    );
  });

  bot.callbackQuery(/^reject_bios_([0-9a-fA-F\-]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCallbackQuery({ text: "Unauthorized", show_alert: true });
      return;
    }

    const userId = ctx.match[1];
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== "AWAITING_BIO_APPROVAL") {
      await ctx.answerCallbackQuery({ text: "User not found or not awaiting bio approval.", show_alert: true });
      return;
    }

    // Set back to CODES_ISSUED so they can try again
    await prisma.user.update({
      where: { id: userId },
      data: { status: "CODES_ISSUED" }
    });

    await ctx.answerCallbackQuery({ text: "Bios rejected." });
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + `\n\n❌ <b>BIOS REJECTED</b> by Admin.`,
      { parse_mode: "HTML" }
    );

    await ctx.api.sendMessage(
      Number(user.telegramId),
      `❌ <b>Bio Verification Failed</b>\n\n` +
      `We could not find the required verification codes in your social media bios. Please ensure they are added correctly and click "Verify Bios" again from your previous message, or restart the menu to try again.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("setviews", adminGuard, async (ctx) => {
    const text = ctx.message?.text;
    if (!text) return;
    
    // /setviews @username 50000
    const parts = text.split(" ");
    if (parts.length !== 3) {
      await ctx.reply("Usage: /setviews @username <amount>");
      return;
    }

    const username = parts[1].replace("@", "");
    const amount = parseInt(parts[2], 10);

    if (isNaN(amount)) {
      await ctx.reply("Invalid amount.");
      return;
    }

    const user = await prisma.user.findFirst({ where: { username } });
    if (!user) {
      await ctx.reply(`User @${username} not found.`);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { views: amount }
    });

    await ctx.reply(`Successfully updated @${username}'s views to ${amount.toLocaleString()}.`);
  });

  bot.command("setvideos", adminGuard, async (ctx) => {
    const text = ctx.message?.text;
    if (!text) return;
    
    // /setvideos @username 10
    const parts = text.split(" ");
    if (parts.length !== 3) {
      await ctx.reply("Usage: /setvideos @username <amount>");
      return;
    }

    const username = parts[1].replace("@", "");
    const amount = parseInt(parts[2], 10);

    if (isNaN(amount)) {
      await ctx.reply("Invalid amount.");
      return;
    }

    const user = await prisma.user.findFirst({ where: { username } });
    if (!user) {
      await ctx.reply(`User @${username} not found.`);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { videos: amount }
    });

    await ctx.reply(`Successfully updated @${username}'s video count to ${amount.toLocaleString()}.`);
  });
}
