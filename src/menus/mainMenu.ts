import { Menu } from "@grammyjs/menu";
import { MyContext } from "../index";
import { prisma } from "../database/client";

export const mainMenu = new Menu<MyContext>("main-menu")
  .text("🚀 Start Registration", async (ctx) => {
    // Check if user is already registered
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
    if (user && user.status !== "PENDING_HANDLES") {
      await ctx.reply("You have already submitted an application!");
      return;
    }
    await ctx.reply("Let's start your registration! 📝");
    await ctx.conversation.enter("onboarding");
  })
  .row()
  .text("📜 Rules & Regulations", async (ctx) => {
    const rulesText = `
<b>Clipper Rules & Regulations</b> 📜

1️⃣ <b>NEW ACCOUNTS REQUIRED</b>: You MUST create a brand new YouTube, TikTok, and Instagram account specifically for this clipping program.
2️⃣ <b>NO REUPLOADS</b>: All edits must be original and highly edited.
3️⃣ <b>LINK IN BIO</b>: You must have our specified link in your bio.
4️⃣ <b>PAYMENT</b>: Payments are calculated based on your views. (0.001 Birr per view).

By participating, you agree to these terms!
    `;
    await ctx.reply(rulesText, { parse_mode: "HTML" });
  })
  .row()
  .text("🏆 Leaderboards", async (ctx) => {
    const topUsers = await prisma.user.findMany({
      orderBy: { views: 'desc' },
      take: 10
    });

    if (topUsers.length === 0) {
      await ctx.reply("The leaderboard is currently empty!");
      return;
    }

    let leaderboardText = "🏆 <b>Top 10 Clippers</b> 🏆\n\n";
    topUsers.forEach((user, index) => {
      const earnings = (user.views * 0.001).toFixed(2);
      let displayName = "User";
      if (user.username) {
        if (user.username.length <= 4) {
          displayName = "@" + user.username;
        } else {
          const start = user.username.substring(0, 3);
          const end = user.username.substring(user.username.length - 2);
          displayName = "@" + start + "***" + end;
        }
      } else {
        displayName = "User " + user.id.substring(0, 4) + "***";
      }
      
      leaderboardText += `${index + 1}. ${displayName} - ${user.views.toLocaleString()} views (${earnings} Birr)\n`;
    });

    await ctx.reply(leaderboardText, { parse_mode: "HTML" });
  })
  .row()
  .text("👤 My Profile", async (ctx) => {
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
    if (!user) {
      await ctx.reply("You are not registered yet!");
      return;
    }

    const earnings = (user.views * 0.001).toFixed(2);
    const profileText = `
👤 <b>Your Profile</b>

<b>Status</b>: ${user.status}
<b>Campaign</b>: ${user.campaign || 'N/A'}
<b>Views</b>: ${user.views.toLocaleString()}
<b>Videos</b>: ${user.videos.toLocaleString()}
<b>Estimated Earnings</b>: ${earnings} Birr

<b>Handles</b>:
▶️ YT: ${user.youtubeHandle || 'N/A'}
🎵 TT: ${user.tiktokHandle || 'N/A'}
📸 IG: ${user.instagramHandle || 'N/A'}
    `;
    await ctx.reply(profileText, { parse_mode: "HTML" });
  });
