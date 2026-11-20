require('dotenv').config();
const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const commands = require('./commands');
const ticket = require('./handlers/ticket');
const points = require('./handlers/points');

if (!process.env.TOKEN) {
  console.error('❌ ضع TOKEN داخل ملف .env');
  process.exit(1);
}

const client = new Client({
  // GuildMembers = Privileged Intent، لازم تفعله من Developer Portal (يستخدم لإرسال تنبيهات الاستدعاء بالخاص)
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ شغال باسم ${c.user.tag}`);
  try {
    if (process.env.GUILD_ID) {
      await c.application.commands.set(commands, process.env.GUILD_ID);
      console.log('تم تسجيل الأوامر في السيرفر.');
    } else {
      await c.application.commands.set(commands);
      console.log('تم تسجيل الأوامر عامة (قد تتأخر شوي).');
    }
  } catch (e) {
    console.error('فشل تسجيل الأوامر:', e);
  }
  ticket.startScheduler(client);
});

client.on(Events.ChannelDelete, ticket.onChannelDelete);

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (!i.inGuild()) return;

    if (i.isChatInputCommand()) {
      switch (i.commandName) {
        case 'ticket':
          return await ticket.handleCommand(i);
        case 'points-config':
          return await points.handlePointsConfig(i);
        case 'points':
          return await points.handlePoints(i);
        case 'add_points':
          return await points.handleAddPoints(i);
      }
    } else if (i.isButton() && i.customId.startsWith('ticket:')) {
      return await ticket.handleButton(i);
    } else if (i.isStringSelectMenu() && i.customId === 'ticket:rate') {
      return await ticket.handleRating(i);
    }
  } catch (e) {
    console.error(e);
    const msg = { content: '❌ صار خطأ غير متوقع.', flags: MessageFlags.Ephemeral };
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
});

process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

client.login(process.env.TOKEN);
