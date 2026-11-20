const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const ticket = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('نظام التذاكر')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('open').setDescription('فتح تذكرة جديدة'))
  .addSubcommand((s) => s.setName('panel').setDescription('إرسال لوحة فتح التذاكر في هذا الروم (إدارة)'))
  .addSubcommand((s) =>
    s
      .setName('category')
      .setDescription('تحديد الكاتيجوري الذي تنشأ فيه التذاكر (إدارة)')
      .addChannelOption((o) =>
        o.setName('category').setDescription('الكاتيجوري').addChannelTypes(ChannelType.GuildCategory).setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('staff-add')
      .setDescription('إضافة رتبة تحق لها استلام التذاكر (الأونر فقط)')
      .addRoleOption((o) => o.setName('role').setDescription('الرتبة').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('staff-remove')
      .setDescription('إزالة رتبة من رتب الاستلام (الأونر فقط)')
      .addRoleOption((o) => o.setName('role').setDescription('الرتبة').setRequired(true))
  )
  .addSubcommand((s) => s.setName('staff-list').setDescription('عرض رتب الإدارة المسموح لها بالاستلام'))
  .addSubcommand((s) =>
    s
      .setName('rating-channel')
      .setDescription('تحديد روم تقييمات الأعضاء للإداريين (إدارة)')
      .addChannelOption((o) =>
        o.setName('channel').setDescription('الروم').addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('points-channel')
      .setDescription('تحديد الروم الذي تظهر فيه نقاط الإدارة (إدارة)')
      .addChannelOption((o) =>
        o.setName('channel').setDescription('الروم').addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
  )
  .addSubcommand((s) => s.setName('claim').setDescription('استلام التذكرة الحالية (للإدارة)'))
  .addSubcommand((s) => s.setName('call').setDescription('استدعاء إداري (ينبّه الإدارة بالخاص إذا ما رد أحد خلال 5 دقائق)'))
  .addSubcommand((s) => s.setName('close').setDescription('إغلاق التذكرة الحالية'));

const pointsConfig = new SlashCommandBuilder()
  .setName('points-config')
  .setDescription('ضبط نظام نقاط الاستلام')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) =>
    s
      .setName('per-ticket')
      .setDescription('عدد النقاط عن كل تذكرة يتم استلامها')
      .addIntegerOption((o) => o.setName('points').setDescription('النقاط').setMinValue(0).setMaxValue(1000).setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('milestone-set')
      .setDescription('إضافة/تعديل مكافأة عند الوصول لعدد معين من التذاكر')
      .addIntegerOption((o) => o.setName('tickets').setDescription('عدد التذاكر المستلمة').setMinValue(1).setMaxValue(100000).setRequired(true))
      .addIntegerOption((o) => o.setName('points').setDescription('نقاط المكافأة').setMinValue(0).setMaxValue(100000).setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('milestone-remove')
      .setDescription('حذف مكافأة')
      .addIntegerOption((o) => o.setName('tickets').setDescription('عدد التذاكر').setMinValue(1).setRequired(true))
  )
  .addSubcommand((s) => s.setName('list').setDescription('عرض الإعدادات الحالية'));

const points = new SlashCommandBuilder()
  .setName('points')
  .setDescription('عرض نقاط الإدارة')
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName('type')
      .setDescription('نوع العرض')
      .setRequired(true)
      .addChoices({ name: 'my point (نقاطي)', value: 'my' }, { name: 'top (الأعلى)', value: 'top' })
  );

const addPoints = new SlashCommandBuilder()
  .setName('add_points')
  .setDescription('إضافة نقاط لشخص (للأدمن فقط)')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName('user').setDescription('الشخص').setRequired(true))
  .addIntegerOption((o) =>
    o.setName('amount').setDescription('عدد النقاط (سالب للخصم)').setMinValue(-100000).setMaxValue(100000).setRequired(true)
  );

module.exports = [ticket, pointsConfig, points, addPoints].map((c) => c.toJSON());
