const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');

const EPH = MessageFlags.Ephemeral;
const COLOR = 0xf1c40f;
const fail = (i, msg) => i.reply({ content: '❌ ' + msg, flags: EPH });
const isAdmin = (i) => i.memberPermissions.has(PermissionFlagsBits.Administrator);

function sortedMilestones(cfg) {
  return Object.entries(cfg.milestones)
    .map(([k, v]) => [Number(k), v])
    .sort((a, b) => a[0] - b[0]);
}

async function handlePointsConfig(i) {
  if (!isAdmin(i)) return fail(i, 'هذا الأمر للأدمن فقط.');
  const g = db.guild(i.guildId);
  const cfg = g.pointsConfig;
  const sub = i.options.getSubcommand();

  if (sub === 'per-ticket') {
    cfg.perClaim = i.options.getInteger('points');
    db.save();
    return i.reply(`✅ صار كل تذكرة يتم استلامها = **${cfg.perClaim}** نقطة.`);
  }
  if (sub === 'milestone-set') {
    const t = i.options.getInteger('tickets');
    const p = i.options.getInteger('points');
    cfg.milestones[t] = p;
    db.save();
    return i.reply(`✅ عند استلام **${t}** تذكرة يحصل الإداري على **${p}** نقطة مكافأة.`);
  }
  if (sub === 'milestone-remove') {
    const t = i.options.getInteger('tickets');
    if (cfg.milestones[t] === undefined) return fail(i, 'ما فيه مكافأة بهذا العدد.');
    delete cfg.milestones[t];
    db.save();
    return i.reply(`✅ تم حذف مكافأة الـ ${t} تذكرة.`);
  }
  if (sub === 'list') {
    const lines = sortedMilestones(cfg).map(([k, v]) => `• عند **${k}** تذكرة → **+${v}** نقطة`);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('⚙️ إعدادات النقاط')
      .setDescription(
        `**كل تذكرة:** ${cfg.perClaim} نقطة\n\n**المكافآت:**\n${lines.join('\n') || 'لا يوجد'}`
      );
    return i.reply({ embeds: [embed], flags: EPH });
  }
}

async function handlePoints(i) {
  const g = db.guild(i.guildId);
  const staff = g.staffRoles.some((r) => i.member.roles.cache.has(r));
  if (!staff && !isAdmin(i)) return fail(i, 'هذا الأمر لإداريي التذاكر فقط.');

  if (g.pointsChannelId && i.channelId !== g.pointsChannelId) {
    return fail(i, `استخدم هذا الأمر في <#${g.pointsChannelId}>.`);
  }

  const type = i.options.getString('type');

  if (type === 'my') {
    const s = db.staffStats(g, i.user.id);
    const next = sortedMilestones(g.pointsConfig).find(([k]) => k > s.claimed);
    const avg = s.ratingCount ? (s.ratingSum / s.ratingCount).toFixed(2) : '—';
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
      .setTitle('📊 نقاطي')
      .addFields(
        { name: 'النقاط', value: `${s.points}`, inline: true },
        { name: 'التذاكر المستلمة', value: `${s.claimed}`, inline: true },
        { name: 'متوسط التقييم', value: s.ratingCount ? `${avg} ⭐ (${s.ratingCount})` : '—', inline: true }
      );
    if (next) embed.setFooter({ text: `باقي ${next[0] - s.claimed} تذكرة للمكافأة القادمة (+${next[1]} نقطة)` });
    return i.reply({ embeds: [embed] });
  }

  const top = Object.entries(g.staff)
    .filter(([, s]) => s.points !== 0 || s.claimed > 0)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map(([id, s], idx) => {
    const avg = s.ratingCount ? ` • ${(s.ratingSum / s.ratingCount).toFixed(1)}⭐` : '';
    return `${medals[idx] || `**${idx + 1}.**`} <@${id}> — **${s.points}** نقطة • ${s.claimed} تذكرة${avg}`;
  });
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🏆 أفضل الإداريين')
    .setDescription(lines.join('\n') || 'ما فيه بيانات للحين.');
  return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function handleAddPoints(i) {
  if (!isAdmin(i)) return fail(i, 'هذا الأمر لأصحاب صلاحية Administrator فقط.');
  const user = i.options.getUser('user');
  const amount = i.options.getInteger('amount');
  if (user.bot) return fail(i, 'ما تقدر تضيف نقاط لبوت.');
  const g = db.guild(i.guildId);
  const s = db.staffStats(g, user.id);
  s.points += amount;
  db.save();
  return i.reply(
    `✅ تم ${amount >= 0 ? 'إضافة' : 'خصم'} **${Math.abs(amount)}** نقطة ${amount >= 0 ? 'إلى' : 'من'} <@${user.id}>.\nمجموع نقاطه الآن: **${s.points}**`
  );
}

module.exports = { handlePointsConfig, handlePoints, handleAddPoints };
