import { Bot, InlineKeyboard } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import { prisma } from "../database/client";
import { env } from "../config/env";
import { MyContext } from "../index";
import { mainMenu } from "../menus/mainMenu";

type MyConversation = Conversation<MyContext, MyContext>;

async function askForText(conversation: MyConversation, ctx: MyContext, prompt: string): Promise<string> {
  await ctx.reply(prompt);
  while (true) {
    const responseCtx = await conversation.waitFor("message");
    const text = responseCtx.msg?.text?.trim();
    if (!text) {
      await ctx.reply("Please provide a valid text response.\n\n" + prompt);
      continue;
    }
    return text;
  }
}

async function onboardingConversation(conversation: MyConversation, ctx: MyContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Check if user exists
  let user = await conversation.external(() => prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  }));

  if (user && user.status !== "PENDING_HANDLES") {
    await ctx.reply("You have already started or completed your registration.");
    return;
  }

  // Create user if they don't exist, lock username at creation time
  if (!user) {
    const username = ctx.from?.username || "unknown";
    user = await conversation.external(() => prisma.user.create({
      data: {
        telegramId: BigInt(telegramId),
        username,
        status: "PENDING_HANDLES",
      }
    }));
  }

  const campaign = await askForText(conversation, ctx, "Welcome to the Clipper Program! Please reply with your target Campaign name.");
  const ytHandle = await askForText(conversation, ctx, "Great. Please reply with your YouTube handle.");
  const igHandle = await askForText(conversation, ctx, "Now, please reply with your Instagram handle.");
  const ttHandle = await askForText(conversation, ctx, "Finally, please reply with your TikTok handle.");

  // Update user in DB
  user = await conversation.external(() => prisma.user.update({
    where: { id: user!.id },
    data: {
      campaign,
      youtubeHandle: ytHandle,
      instagramHandle: igHandle,
      tiktokHandle: ttHandle,
      status: "AWAITING_ADMIN",
    }
  }));

  await ctx.reply("Thank you! Your application has been submitted for review. We will notify you once approved.");

  // Notify Admin
  const adminKeyboard = new InlineKeyboard()
    .text("Approve & Send Codes", `approve_${user.id}`)
    .text("Reject", `reject_${user.id}`);

  await ctx.api.sendMessage(
    env.ADMIN_CHAT_ID,
    `🔔 <b>New Clipper Application</b>\n\n` +
    `👤 <b>User:</b> @${user.username} (ID: ${telegramId})\n` +
    `🎯 <b>Campaign:</b> ${campaign}\n` +
    `📺 <b>YouTube:</b> ${ytHandle}\n` +
    `📸 <b>Instagram:</b> ${igHandle}\n` +
    `🎵 <b>TikTok:</b> ${ttHandle}\n\n` +
    `Please review this application.`,
    { reply_markup: adminKeyboard, parse_mode: "HTML" }
  );
}

async function paymentConversation(conversation: MyConversation, ctx: MyContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await conversation.external(() => prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  }));

  if (!user || user.status !== "PENDING_PAYMENT") {
    await ctx.reply("You are not currently eligible to submit payment info.");
    return;
  }

  const bankName = await askForText(conversation, ctx, "Please reply with your Bank Name.");
  const accountNumber = await askForText(conversation, ctx, "Please reply with your Account Number.");

  await conversation.external(() => prisma.user.update({
    where: { id: user.id },
    data: {
      bankName,
      accountNumber,
      status: "ACTIVE_CLIPPER",
    }
  }));

  await ctx.reply("Payment information saved securely. You are now an active clipper!");

  // Notify Admin of Bank Info
  const adminMessage = `
💰 <b>Payment Info Updated</b>
User: @${user.username || user.id}
Bank Name: ${bankName}
Account Number: ${accountNumber}
  `;
  try {
    await ctx.api.sendMessage(env.ADMIN_CHAT_ID, adminMessage, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to notify admin of payment:", err);
  }
}

export function clipperFlow(bot: Bot<MyContext>) {
  bot.use(createConversation(onboardingConversation, "onboarding"));
  bot.use(createConversation(paymentConversation, "payment"));
  bot.use(mainMenu);

  bot.command("start", async (ctx) => {
    let user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(ctx.from!.id),
          username: ctx.from!.username || "",
        }
      });
    }

    const welcomeMsg = `
🎉 <b>Welcome to the Clipper Program!</b> 🎉
    
Get ready to earn money by editing and clipping our content! 💰🔥

👇 <b>Use the menu below to get started:</b>
    `;

    // send menu
    await ctx.reply(welcomeMsg, { parse_mode: "HTML", reply_markup: mainMenu });
  });

  bot.callbackQuery("verify_bios", async (ctx) => {
    const telegramId = ctx.from.id;
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user || user.status !== "CODES_ISSUED") {
      await ctx.answerCallbackQuery({ text: "Not eligible for verification.", show_alert: true });
      return;
    }

    // Manual Verification selected: Transition to AWAITING_BIO_APPROVAL
    await prisma.user.update({
      where: { id: user.id },
      data: { status: "AWAITING_BIO_APPROVAL" }
    });

    await ctx.answerCallbackQuery({ text: "Verification requested!" });
    await ctx.editMessageText("Your verification request has been sent to the admin. Please wait for approval.");

    // Notify Admin
    const adminKeyboard = new InlineKeyboard()
      .text("✅ Approve Bios", `approve_bios_${user.id}`)
      .text("❌ Reject Bios", `reject_bios_${user.id}`);

    await ctx.api.sendMessage(
      env.ADMIN_CHAT_ID,
      `🔍 <b>Bio Verification Request</b>\n\n` +
      `👤 <b>User:</b> @${user.username} (ID: ${user.telegramId})\n\n` +
      `Please check the following handles for their verification codes:\n` +
      `📺 <b>YouTube:</b> ${user.youtubeHandle} (Code: <code>${user.ytCode}</code>)\n` +
      `📸 <b>Instagram:</b> ${user.instagramHandle} (Code: <code>${user.igCode}</code>)\n` +
      `🎵 <b>TikTok:</b> ${user.tiktokHandle} (Code: <code>${user.ttCode}</code>)\n\n` +
      `Approve once verified.`,
      { reply_markup: adminKeyboard, parse_mode: "HTML" }
    );
  });

  bot.callbackQuery("start_payment_setup", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Let's set up your payment info!");
    await ctx.conversation.enter("payment");
  });
}
