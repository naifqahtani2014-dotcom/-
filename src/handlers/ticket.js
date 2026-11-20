const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const db = require('../db');

const EPH = MessageFlags.Ephemeral;
const COLOR = 0x5865f2;
const CALL_DELAY = 5 * 60 * 1000; // 5 دقايق قبل تنبيه الإدارة
const RATE_TIMEOUT = 10 * 60 * 1000; // مهلة التقييم قبل الإغلاق التلقائي

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (i, msg) =>
  i.deferred || i.replied
    ? i.editReply({ content: '❌ ' + msg })
    : i.reply({ content: '❌ ' + msg, flags: EPH });
const isGuildOwner = (i) => i.guild.ownerId === i.user.id;
const isAdmin = (i) => i.memberPermissions.has(PermissionFlagsBits.Administrator);
const isStaffMember = (member, g) => g.staffRoles.some((r) => member.roles.cache.has(r));
const stars = (n) => '⭐'.repeat(n);

function buttons(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('استلام التذكرة').setEmoji('🙋').setStyle(ButtonStyle.Success).setDisabled(claimed),
    new ButtonBuilder().setCustomId('ticket:call').setLabel('استدعاء إداري').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
}

/* ===================== الأوامر ===================== */

async function handleCommand(i) {
  const sub = i.options.getSubcommand();
  const g = db.guild(i.guildId);

  switch (sub) {
    case 'open':
      return openTicket(i);
    case 'claim':
      return claim(i);
    case 'call':
      return callAdmin(i);
    case 'close':
      return requestClose(i);
    case 'staff-list': {
      const roles = g.staffRoles.map((r) => `<@&${r}>`).join('\n') || 'لم يتم تحديد أي رتبة بعد.';
      return i.reply({ content: `**رتب الإدارة المسموح لها باستلام التذاكر:**\n${roles}`, flags: EPH });
    }
  }

  // ---- أوامر الإعدادات ----
  if (sub === 'staff-add' || sub === 'staff-remove') {
    if (!isGuildOwner(i)) return fail(i, 'هذا الأمر لأونر السيرفر فقط.');
    const role = i.options.getRole('role');
    if (sub === 'staff-add') {
      if (role.id === i.guildId) return fail(i, 'ما تقدر تضيف @everyone.');
      if (g.staffRoles.includes(role.id)) return fail(i, 'الرتبة مضافة من قبل.');
      g.staffRoles.push(role.id);
      db.save();
      return i.reply({ content: `✅ تمت إضافة <@&${role.id}> لرتب استلام التذاكر.`, allowedMentions: { parse: [] } });
    }
    if (!g.staffRoles.includes(role.id)) return fail(i, 'هذه الرتبة غير مضافة.');
    g.staffRoles = g.staffRoles.filter((r) => r !== role.id);
    db.save();
    return i.reply({ content: `✅ تمت إزالة <@&${role.id}> من رتب استلام التذاكر.`, allowedMentions: { parse: [] } });
  }

  if (!isAdmin(i) && !isGuildOwner(i)) return fail(i, 'هذا الأمر لأصحاب صلاحية Administrator فقط.');

  if (sub === 'category') {
    const cat = i.options.getChannel('category');
    g.categoryId = cat.id;
    db.save();
    return i.reply(`✅ التذاكر الجديدة ستنشأ داخل **${cat.name}**.`);
  }
  if (sub === 'rating-channel') {
    const ch = i.options.getChannel('channel');
    g.ratingChannelId = ch.id;
    db.save();
    return i.reply(`✅ تقييمات الأعضاء ستصل في ${ch}.`);
  }
  if (sub === 'points-channel') {
    const ch = i.options.getChannel('channel');
    g.pointsChannelId = ch.id;
    db.save();
    return i.reply(`✅ أمر /points سيعمل في ${ch} فقط.`);
  }
  if (sub === 'panel') {
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('🎫 الدعم الفني')
      .setDescription('تحتاج مساعدة؟ اضغط على الزر بالأسفل لفتح تذكرة وسيتواصل معك أحد الإداريين.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:open').setLabel('فتح تذكرة').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
    await i.channel.send({ embeds: [embed], components: [row] });
    return i.reply({ content: '✅ تم إرسال اللوحة.', flags: EPH });
  }
}

/* ===================== فتح التذكرة ===================== */

async function openTicket(i) {
  await i.deferReply({ flags: EPH });
  const g = db.guild(i.guildId);

  if (!g.categoryId) return fail(i, 'لم يتم تحديد الكاتيجوري بعد. (/ticket category)');
  if (!g.staffRoles.length) return fail(i, 'لم يتم تحديد رتب الإدارة بعد. (/ticket staff-add)');

  const category = await i.guild.channels.fetch(g.categoryId).catch(() => null);
  if (!category) return fail(i, 'الكاتيجوري المحددة غير موجودة، تواصل مع الإدارة.');

  const existing = Object.values(g.tickets).find((t) => t.ownerId === i.user.id);
  if (existing) return fail(i, `عندك تذكرة مفتوحة بالفعل: <#${existing.id}>`);

  const staffRoles = g.staffRoles.filter((r) => i.guild.roles.cache.has(r));
  g.counter += 1;
  const number = g.counter;
  db.save();

  const base = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
  ];

  const overwrites = [
    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: base },
    {
      id: i.client.user.id,
      allow: [...base, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks],
    },
    ...staffRoles.map((r) => ({ id: r, allow: base })),
  ];

  let channel;
  try {
    channel = await i.guild.channels.create({
      name: `ticket-${String(number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `تذكرة ${i.user.tag} (${i.user.id})`,
      permissionOverwrites: overwrites,
    });
  } catch (e) {
    console.error(e);
    return fail(i, 'تعذر إنشاء القناة، تأكد من صلاحيات البوت (Manage Channels).');
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🎫 تذكرة #${number}`)
    .setDescription(
      `أهلاً <@${i.user.id}>، اكتب مشكلتك وسيقوم أحد الإداريين باستلام التذكرة.\n\n` +
        '• **🙋 استلام التذكرة:** للإدارة\n' +
        '• **🔔 استدعاء إداري:** إذا ما رد عليك أحد خلال 5 دقائق ننبّه الإدارة بالخاص\n' +
        '• **🔒 إغلاق:** سيُطلب منك تقييم الإداري قبل الإغلاق'
    )
    .setTimestamp();

  const msg = await channel.send({
    content: `<@${i.user.id}> ${staffRoles.map((r) => `<@&${r}>`).join(' ')}`,
    embeds: [embed],
    components: [buttons(false)],
    allowedMentions: { users: [i.user.id], roles: staffRoles },
  });

  g.tickets[channel.id] = {
    id: channel.id,
    number,
    ownerId: i.user.id,
    claimedBy: null,
    status: 'open',
    panelMessageId: msg.id,
    createdAt: Date.now(),
    callAt: null,
    lastCallAt: null,
    closeAt: null,
  };
  db.save();

  return i.editReply(`✅ تم فتح تذكرتك: ${channel}`);
}

/* ===================== الاستلام ===================== */

async function claim(i) {
  const g = db.guild(i.guildId);
  const t = g.tickets[i.channelId];
  if (!t) return fail(i, 'هذا ليس روم تذكرة.');
  if (!isStaffMember(i.member, g)) return fail(i, 'استلام التذاكر مخصص لرتب الإدارة المحددة فقط.');
  if (t.status !== 'open') return fail(i, 'هذه التذكرة قيد الإغلاق.');
  if (t.claimedBy) return fail(i, `التذكرة مستلمة من <@${t.claimedBy}>.`);
  if (t.ownerId === i.user.id) return fail(i, 'ما تقدر تستلم تذكرتك الخاصة.');

  t.claimedBy = i.user.id;
  t.claimedAt = Date.now();
  t.callAt = null;

  const s = db.staffStats(g, i.user.id);
  s.claimed += 1;
  const cfg = g.pointsConfig;
  const base = cfg.perClaim;
  const bonus = cfg.milestones[s.claimed] || 0;
  s.points += base + bonus;
  db.save();

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(
      `✅ تم استلام التذكرة بواسطة <@${i.user.id}>\n` +
        `🎯 **+${base}** نقطة` +
        (bonus ? ` 🎉 **+${bonus}** مكافأة لوصولك إلى ${s.claimed} تذكرة` : '') +
        `\nمجموع نقاطك: **${s.points}**`
    );

  // تعطيل زر الاستلام في رسالة التذكرة
  try {
    const m = await i.channel.messages.fetch(t.panelMessageId);
    await m.edit({ components: [buttons(true)] });
  } catch {}

  return i.reply({ content: `<@${t.ownerId}>`, embeds: [embed], allowedMentions: { users: [t.ownerId] } });
}

/* ===================== استدعاء إداري ===================== */

async function callAdmin(i) {
  const g = db.guild(i.guildId);
  const t = g.tickets[i.channelId];
  if (!t) return fail(i, 'هذا ليس روم تذكرة.');
  if (t.ownerId !== i.user.id) return fail(i, 'صاحب التذكرة فقط يقدر يستدعي إداري.');
  if (t.claimedBy) return fail(i, `التذكرة مستلمة من <@${t.claimedBy}> بالفعل.`);
  if (t.callAt) return fail(i, `تم تسجيل طلبك، سيتم تنبيه الإدارة <t:${Math.floor(t.callAt / 1000)}:R> إن لم يرد أحد.`);
  if (t.lastCallAt && Date.now() - t.lastCallAt < CALL_DELAY) {
    return fail(i, 'تم تنبيه الإدارة قبل قليل، انتظر شوي.');
  }

  t.callAt = Date.now() + CALL_DELAY;
  db.save();
  return i.reply(
    `🔔 تم تسجيل طلب الاستدعاء. إذا ما تم استلام التذكرة <t:${Math.floor(t.callAt / 1000)}:R> سيصل تنبيه بالخاص لجميع الإداريين.`
  );
}

async function notifyStaff(client, guildId, g, t) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = await guild.channels.fetch(t.id).catch(() => null);
  if (!channel) {
    delete g.tickets[t.id];
    db.save();
    return;
  }

  let members;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
  }
  const targets = members.filter((m) => !m.user.bot && m.id !== t.ownerId && isStaffMember(m, g));

  const url = `https://discord.com/channels/${guildId}/${t.id}`;
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🔔 تذكرة بدون رد')
    .setDescription(`<@${t.ownerId}> ينتظر رد منذ أكثر من 5 دقائق في تذكرة #${t.number}.\n\n[اضغط هنا للذهاب للتذكرة](${url})`)
    .setFooter({ text: guild.name })
    .setTimestamp();

  let sent = 0;
  for (const m of targets.values()) {
    try {
      await m.send({ embeds: [embed] });
      sent++;
    } catch {}
    await sleep(300);
  }

  channel.send({ content: `📨 تم إرسال تنبيه بالخاص إلى **${sent}** إداري.` }).catch(() => {});
}

/* ===================== الإغلاق والتقييم ===================== */

async function requestClose(i) {
  const g = db.guild(i.guildId);
  const t = g.tickets[i.channelId];
  if (!t) return fail(i, 'هذا ليس روم تذكرة.');

  const allowed = t.ownerId === i.user.id || isStaffMember(i.member, g) || isAdmin(i);
  if (!allowed) return fail(i, 'ما عندك صلاحية إغلاق هذه التذكرة.');
  if (t.status !== 'open') return fail(i, 'التذكرة قيد الإغلاق بالفعل.');

  // تذكرة غير مستلمة -> تغلق مباشرة بدون تقييم
  if (!t.claimedBy) {
    await i.reply('🔒 جاري إغلاق التذكرة...');
    return closeTicket(i.client, i.guildId, t.id);
  }

  t.status = 'rating';
  t.closeAt = Date.now() + RATE_TIMEOUT;
  db.save();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:rate')
    .setPlaceholder('قيّم الإداري من 1 إلى 5 نجوم')
    .addOptions(
      [5, 4, 3, 2, 1].map((n) => ({
        label: `${n} ${n === 1 ? 'نجمة' : 'نجوم'}`,
        value: String(n),
        description: ['', 'سيء', 'مقبول', 'جيد', 'ممتاز', 'رائع'][n],
        emoji: '⭐',
      }))
    );

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('⭐ قيّم الإداري')
    .setDescription(
      `<@${t.ownerId}> قبل إغلاق التذكرة، قيّم الإداري <@${t.claimedBy}> من القائمة بالأسفل.\n` +
        `ستُغلق التذكرة تلقائيًا <t:${Math.floor(t.closeAt / 1000)}:R> إذا لم يتم التقييم.`
    );

  return i.reply({
    content: `<@${t.ownerId}>`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
    allowedMentions: { users: [t.ownerId] },
  });
}

async function handleRating(i) {
  const g = db.guild(i.guildId);
  const t = g.tickets[i.channelId];
  if (!t || t.status !== 'rating') {
    return i.reply({ content: '❌ لا يوجد تقييم مطلوب هنا.', flags: EPH });
  }
  if (i.user.id !== t.ownerId) {
    return i.reply({ content: '❌ صاحب التذكرة فقط يقدر يقيّم.', flags: EPH });
  }

  const rating = parseInt(i.values[0], 10);
  const s = db.staffStats(g, t.claimedBy);
  s.ratingSum += rating;
  s.ratingCount += 1;
  t.status = 'closing';
  db.save();

  await i.update({
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`شكرًا لتقييمك! ${stars(rating)}\n🔒 سيتم إغلاق التذكرة خلال 5 ثواني.`),
    ],
    components: [],
  });

  // إرسال التقييم لروم التقييمات
  if (g.ratingChannelId) {
    const ch = await i.guild.channels.fetch(g.ratingChannelId).catch(() => null);
    if (ch) {
      const avg = (s.ratingSum / s.ratingCount).toFixed(2);
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('📝 تقييم جديد')
        .addFields(
          { name: 'الإداري', value: `<@${t.claimedBy}>`, inline: true },
          { name: 'العضو', value: `<@${t.ownerId}>`, inline: true },
          { name: 'التقييم', value: `${stars(rating)} (${rating}/5)`, inline: true },
          { name: 'التذكرة', value: `#${t.number}`, inline: true },
          { name: 'متوسط الإداري', value: `${avg} ⭐ من ${s.ratingCount} تقييم`, inline: true }
        )
        .setTimestamp();
      ch.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
    }
  }

  return closeTicket(i.client, i.guildId, t.id);
}

async function closeTicket(client, guildId, channelId, delay = 5000) {
  const g = db.guild(guildId);
  delete g.tickets[channelId];
  db.save();
  const guild = client.guilds.cache.get(guildId);
  const channel = guild && (await guild.channels.fetch(channelId).catch(() => null));
  if (channel) setTimeout(() => channel.delete('تم إغلاق التذكرة').catch(() => {}), delay);
}

/* ===================== المؤقت (استدعاء + إغلاق تلقائي) ===================== */

function startScheduler(client) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      for (const guildId of db.ids()) {
        const g = db.guild(guildId);
        for (const t of Object.values(g.tickets)) {
          if (t.status === 'open' && !t.claimedBy && t.callAt && t.callAt <= now) {
            t.callAt = null;
            t.lastCallAt = now;
            db.save();
            await notifyStaff(client, guildId, g, t);
          } else if (t.status === 'rating' && t.closeAt && t.closeAt <= now) {
            const guild = client.guilds.cache.get(guildId);
            const ch = guild && (await guild.channels.fetch(t.id).catch(() => null));
            if (ch) await ch.send('⌛ انتهت مهلة التقييم، سيتم إغلاق التذكرة.').catch(() => {});
            await closeTicket(client, guildId, t.id);
          }
        }
      }
    } catch (e) {
      console.error('scheduler error', e);
    } finally {
      running = false;
    }
  }, 15 * 1000);
}

function onChannelDelete(channel) {
  if (!channel.guild) return;
  const g = db.guild(channel.guild.id);
  if (g.tickets[channel.id]) {
    delete g.tickets[channel.id];
    db.save();
  }
}

/* ===================== الأزرار ===================== */

async function handleButton(i) {
  switch (i.customId) {
    case 'ticket:open':
      return openTicket(i);
    case 'ticket:claim':
      return claim(i);
    case 'ticket:call':
      return callAdmin(i);
    case 'ticket:close':
      return requestClose(i);
  }
}

module.exports = { handleCommand, handleButton, handleRating, startScheduler, onChannelDelete };
