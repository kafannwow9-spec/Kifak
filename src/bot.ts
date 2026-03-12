import * as pkg from 'discord.js';
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = pkg;
import db from './database.ts';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const genAI = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

if (!TOKEN) {
  console.error("❌ ERROR: DISCORD_TOKEN is not defined in environment variables!");
}

// Commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('طلب-اجازة')
    .setDescription('إرسال رسالة طلب الإجازة')
    .addChannelOption(opt => opt.setName('روم-الطلبات').setDescription('الروم الذي سترسل إليه الطلبات للمسؤولين').setRequired(true))
    .addChannelOption(opt => opt.setName('روم-الإجازات').setDescription('الروم العام للإجازات').setRequired(true))
    .addChannelOption(opt => opt.setName('لوق-الإجازات').setDescription('روم السجلات (اللوق)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('إرسال-رسالة')
    .setDescription('إرسال رسالة في الروم الحالي')
    .addStringOption(opt => opt.setName('الرسالة').setDescription('الكلمة التي تريد كتابتها').setRequired(true))
    .addStringOption(opt => opt.setName('رد-على').setDescription('اختر الرسالة التي تريد الرد عليها (اختياري)').setAutocomplete(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('إرسال-خاص')
    .setDescription('إرسال رسالة خاصة لعضو')
    .addUserOption(opt => opt.setName('user').setDescription('العضو الذي تريد الإرسال له').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('محتوى الرسالة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('إعداد-الاستقالة')
    .setDescription('إعداد رسالة طلب الاستقالة')
    .addStringOption(opt => opt.setName('عنوان-الايمبد').setDescription('عنوان الايمبد').setRequired(true))
    .addStringOption(opt => opt.setName('وصف-الايمبد').setDescription('وصف الايمبد').setRequired(true))
    .addChannelOption(opt => opt.setName('روم-الطلبات').setDescription('الروم الذي سترسل إليه الطلبات للمسؤولين').setRequired(true))
    .addChannelOption(opt => opt.setName('لوق-الاستقالات').setDescription('روم السجلات (اللوق)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('مسؤولين-الطلبات')
    .setDescription('تحديد رتب المسؤولين')
    .addRoleOption(opt => opt.setName('رتبة-مسؤول-الاجازات').setDescription('رتبة مسؤول قبول الإجازات'))
    .addRoleOption(opt => opt.setName('رتبة-مسؤول-الاستقالة').setDescription('رتبة مسؤول الاستقالة'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('عرض سرعة استجابة البوت'),

  new SlashCommandBuilder()
    .setName('الرسائل-الدائمة')
    .setDescription('عرض وإدارة الرسائل الدائمة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('إضافة-كلمات')
    .setDescription('إضافة رسالة دائمة لروم معين')
    .addChannelOption(opt => opt.setName('الروم').setDescription('الروم الذي ستظهر فيه الرسالة').setRequired(true))
    .addStringOption(opt => opt.setName('الرسالة').setDescription('محتوى الرسالة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

// Register commands
async function registerCommands(guildId: string) {
  if (!TOKEN) return;
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commands });
    console.log(`Successfully registered commands for guild ${guildId}`);
  } catch (error) {
    console.error(error);
  }
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  client.guilds.cache.forEach(guild => registerCommands(guild.id));
  
  // Expiration check every minute
  setInterval(checkExpiredLeaves, 60000);
});

client.on('guildCreate', (guild) => {
  registerCommands(guild.id);
});

client.on('interactionCreate', async (interaction: any) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'إرسال-رسالة') {
      const channel = interaction.channel;
      if (!channel) return;
      const messages = await channel.messages.fetch({ limit: 25 });
      const choices = messages.map((m: any) => ({
        name: `${m.author.username}: ${m.content.substring(0, 50)}...`,
        value: m.id
      }));
      await interaction.respond(choices);
    }
  }

  if (interaction.isChatInputCommand()) {
    const { commandName, guildId, options } = interaction;
    if (!guildId) return;

    if (commandName === 'مسؤولين-الطلبات') {
      const leaveRole = options.getRole('رتبة-مسؤول-الاجازات');
      const resignRole = options.getRole('رتبة-مسؤول-الاستقالة');

      db.prepare(`
        INSERT INTO settings (guildId, leaveManagerRoleId, resignationManagerRoleId)
        VALUES (?, ?, ?)
        ON CONFLICT(guildId) DO UPDATE SET
          leaveManagerRoleId = COALESCE(?, leaveManagerRoleId),
          resignationManagerRoleId = COALESCE(?, resignationManagerRoleId)
      `).run(guildId, leaveRole?.id || null, resignRole?.id || null, leaveRole?.id || null, resignRole?.id || null);

      await interaction.reply({ content: '✅ تم تحديث رتب المسؤولين بنجاح.', ephemeral: true });
    }

    if (commandName === 'ping') {
      const latency = Math.round(client.ws.ping);
      await interaction.reply({ content: `🏓 سرعة استجابة البوت هي: **${latency}ms**`, ephemeral: true });
    }

    if (commandName === 'الرسائل-الدائمة') {
      const messages: any[] = db.prepare('SELECT * FROM permanent_messages WHERE guildId = ?').all(guildId);
      
      let description = '';
      if (messages.length === 0) {
        description = 'لا توجد رسائل دائمة مضافة حالياً.';
      } else {
        messages.forEach(msg => {
          description += `- ${msg.content}\n← **فـي <#${msg.channelId}>**\n\n`;
        });
      }
      description += `*يــمـكــنـك إضــافـة رســائــل عــبــر /إضافة-كلمات`;

      const embed = new EmbedBuilder()
        .setTitle('**__الــرســائـل الــدائـمــة الـمــضـافــة<:accept:1480943220019040286>__**')
        .setDescription(description)
        .setColor('#2b2d31')
        .setImage('https://cdn.discordapp.com/attachments/1453338187740221504/1481644301183094795/84b7fd9ecfc22c82.jpg?ex=69b41049&is=69b2bec9&hm=611a5e745dd404f1d554136390e2918a5f8d3bf6658fa56776f1f58145c5e6f1&');

      const row = new ActionRowBuilder<any>().addComponents(
        new ButtonBuilder()
          .setCustomId('remove_words_btn')
          .setLabel('إزالــة كــلــمـات')
          .setEmoji('1481646503628898385')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('stop_word_btn')
          .setLabel('إيــقــاف كــلــمـة')
          .setEmoji('1481647211803709466')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('active_word_btn')
          .setLabel('تــفــعـيـل كــلــمـة')
          .setEmoji('1481647631234109593')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'إضافة-كلمات') {
      const channel = options.getChannel('الروم');
      const content = options.getString('الرسالة');

      const result = db.prepare('INSERT INTO permanent_messages (guildId, channelId, content) VALUES (?, ?, ?)').run(guildId, channel?.id, content);
      
      // Send initial message
      try {
        const msg = await (channel as any).send(content);
        db.prepare('UPDATE permanent_messages SET lastMessageId = ? WHERE id = ?').run(msg.id, result.lastInsertRowid);
      } catch (e) {
        console.error('Failed to send initial permanent message:', e);
      }

      await interaction.reply({ content: '✅ تم إضافة الرسالة الدائمة بنجاح.', ephemeral: true });
    }

    if (commandName === 'إرسال-خاص') {
      const targetUser = options.getUser('user');
      const message = options.getString('message');
      
      if (!targetUser || !message) return;

      try {
        await targetUser.send(message);
        await interaction.reply({ content: `✅ تم إرسال الرسالة بنجاح إلى <@${targetUser.id}>`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: '❌ تعذر إرسال رسالة خاصة لهذا العضو (قد تكون الرسائل الخاصة مغلقة).', ephemeral: true });
      }
    }

    if (commandName === 'إرسال-رسالة') {
      const message = options.getString('الرسالة');
      const replyToId = options.getString('رد-على');
      
      await interaction.reply({ content: 'جاري الإرسال...', ephemeral: true });
      
      try {
        if (replyToId) {
          const targetMsg = await interaction.channel.messages.fetch(replyToId).catch(() => null);
          if (targetMsg) {
            await targetMsg.reply(message);
          } else {
            await interaction.channel.send(message);
          }
        } else {
          await interaction.channel.send(message);
        }
        await interaction.editReply({ content: '✅ تم إرسال الرسالة بنجاح.' });
      } catch (e) {
        await interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة إرسال الرسالة.' });
      }
    }

    if (commandName === 'إعداد-الاستقالة') {
      const title = options.getString('عنوان-الايمبد');
      const desc = options.getString('وصف-الايمبد');
      const requestChannel = options.getChannel('روم-الطلبات');
      const logChannel = options.getChannel('لوق-الاستقالات');

      db.prepare(`
        INSERT INTO settings (guildId, resignationLogChannelId)
        VALUES (?, ?)
        ON CONFLICT(guildId) DO UPDATE SET resignationLogChannelId = ?
      `).run(guildId, logChannel?.id, logChannel?.id);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor('#2b2d31')
        .setImage('https://cdn.discordapp.com/attachments/1373379066127716454/1480947656787492934/29c156efac6e235a.jpg?ex=69b1877c&is=69b035fc&hm=8a610c2c2c4babc6a4a91f3355412582e774148418004142c3c17e2c4e1eb9e8&');

      const row = new ActionRowBuilder<any>().addComponents(
        new ButtonBuilder()
          .setCustomId(`request_resignation_${requestChannel?.id}`)
          .setLabel('طــلـب اســتـقـالة')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'طلب-اجازة') {
      const settings: any = db.prepare('SELECT * FROM settings WHERE guildId = ?').get(guildId);
      if (!settings || !settings.leaveManagerRoleId) {
        return interaction.reply({ content: '❌ يجب عليك إعداد مسؤولين الطلبات أولاً باستخدام أمر `/مسؤولين-الطلبات` قبل استخدام هذا الأمر.', ephemeral: true });
      }

      const requestChannel = options.getChannel('روم-الطلبات');
      const publicChannel = options.getChannel('روم-الإجازات');
      const logChannel = options.getChannel('لوق-الإجازات');

      db.prepare(`
        INSERT INTO settings (guildId, leaveLogChannelId, leavePublicChannelId)
        VALUES (?, ?, ?)
        ON CONFLICT(guildId) DO UPDATE SET 
          leaveLogChannelId = ?, 
          leavePublicChannelId = ?
      `).run(guildId, logChannel?.id, publicChannel?.id, logChannel?.id, publicChannel?.id);

      const embed = new EmbedBuilder()
        .setTitle('طلب اجازة')
        .setDescription(`
**__يــمـكـنـك طــلـب اجــازة مـن هــنـا__**

- **اقــصـى حـد لــطـلــب هـو 3 اشــهـر**
- **عند الــضــغـط عـلــى الــزر الــذي بـلاســفــل ضـع فــقــط عــدد الإيــام**
- **مــثــال: 60 أيام**
        `)
        .setColor('#2b2d31')
        .setImage('https://cdn.discordapp.com/attachments/1373379066127716454/1480947656787492934/29c156efac6e235a.jpg?ex=69b1877c&is=69b035fc&hm=8a610c2c2c4babc6a4a91f3355412582e774148418004142c3c17e2c4e1eb9e8&');

      const row = new ActionRowBuilder<any>().addComponents(
        new ButtonBuilder()
          .setCustomId(`request_leave_${requestChannel?.id}`)
          .setLabel('طــلـب اجــازة')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('request_leave_')) {
      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      // Check if user already has an active leave or pending request
      const activeLeave = db.prepare('SELECT * FROM active_leaves WHERE userId = ? AND guildId = ?').get(userId, guildId);
      const pendingRequest = db.prepare('SELECT * FROM pending_requests WHERE userId = ? AND guildId = ?').get(userId, guildId);

      if (activeLeave || pendingRequest) {
        return interaction.reply({ content: '❌ لديك بالفعل طلب إجازة معلق أو إجازة نشطة حالياً.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`leave_modal_${interaction.customId.split('_')[2]}`)
        .setTitle('طلب إجازة');

      const durationInput = new TextInputBuilder()
        .setCustomId('leave_duration')
        .setLabel('ضع فقط عدد الأيام (مثال: 60 أيام)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId('leave_reason')
        .setLabel('سبب طلب الإجازة')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<any>().addComponents(durationInput),
        new ActionRowBuilder<any>().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('request_resignation_')) {
      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      const pendingResignation = db.prepare('SELECT * FROM pending_resignations WHERE userId = ? AND guildId = ?').get(userId, guildId);

      if (pendingResignation) {
        return interaction.reply({ content: '❌ لديك بالفعل طلب استقالة معلق حالياً.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`resignation_modal_${interaction.customId.split('_')[2]}`)
        .setTitle('طلب استقالة');

      const reasonInput = new TextInputBuilder()
        .setCustomId('resignation_reason')
        .setLabel('سبب الاستقالة')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<any>().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('cancel_leave_')) {
      const userId = interaction.customId.split('_')[2];
      const guildId = interaction.guildId!;
      const settings: any = db.prepare('SELECT * FROM settings WHERE guildId = ?').get(guildId);
      const member = interaction.member as any;

      const canManage = member.permissions.has(PermissionFlagsBits.Administrator) || 
                        (settings?.leaveManagerRoleId && member.roles.cache.has(settings.leaveManagerRoleId));

      if (!canManage) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية إلغاء الإجازة.', ephemeral: true });
      }

      const leave: any = db.prepare('SELECT * FROM active_leaves WHERE userId = ? AND guildId = ?').get(userId, guildId);
      if (!leave) return interaction.reply({ content: '❌ لم يتم العثور على إجازة نشطة لهذا العضو.', ephemeral: true });

      const targetMember = await interaction.guild?.members.fetch(userId).catch(() => null);
      let nicknameError = false;
      if (targetMember) {
        try {
          if (targetMember.manageable) {
            await targetMember.setNickname(null);
          } else {
            nicknameError = true;
          }
        } catch (e) {
          nicknameError = true;
        }
      }

      const channel = client.channels.cache.get(leave.leaveChannelId);
      if (channel?.isTextBased()) {
        try {
          if (leave.leaveMessageId) {
            const msg = await (channel as any).messages.fetch(leave.leaveMessageId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
          }
          if (leave.imageMessageId) {
            const imgMsg = await (channel as any).messages.fetch(leave.imageMessageId).catch(() => null);
            if (imgMsg) await imgMsg.delete().catch(() => null);
          }
        } catch (e) {
          console.error('Error deleting leave messages:', e);
        }
      }

      const logChannel = client.channels.cache.get(settings?.leaveLogChannelId);
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`**__ إلــغــاء إجــازة <@${userId}>__**`)
          .setDescription(`
- **تــم الإلــغــاء بــواســطـة: <@${interaction.user.id}>**
- تم إرجاع العضو من الإجازة وحذف جميع السجلات بنجاح.
          `)
          .setColor('#ff0000')
          .setTimestamp();
        
        await (logChannel as any).send({ embeds: [embed] });
        await (logChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
      }

      db.prepare('DELETE FROM active_leaves WHERE id = ?').run(leave.id);
      await interaction.reply({ 
        content: nicknameError 
          ? '✅ تم إلغاء الإجازة بنجاح، ولكن تعذر إعادة اللقب الأصلي بسبب نقص الصلاحيات.' 
          : '✅ تم إلغاء الإجازة بنجاح.', 
        ephemeral: true 
      });
    }

    if (interaction.customId === 'remove_words_btn') {
      const messages: any[] = db.prepare('SELECT * FROM permanent_messages WHERE guildId = ?').all(interaction.guildId);
      if (messages.length === 0) return interaction.reply({ content: '❌ لا توجد رسائل لإزالتها.', ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId('remove_word_select')
        .setPlaceholder('اختر الكلمة لإزالتها')
        .addOptions(messages.map(m => ({
          label: m.content.substring(0, 100),
          value: m.id.toString()
        })));

      const row = new ActionRowBuilder<any>().addComponents(select);
      await interaction.reply({ content: 'اختر الكلمة التي تريد إزالتها:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'stop_word_btn') {
      const messages: any[] = db.prepare('SELECT * FROM permanent_messages WHERE guildId = ? AND isActive = 1').all(interaction.guildId);
      if (messages.length === 0) return interaction.reply({ content: '❌ لا توجد رسائل مفعلة لإيقافها.', ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId('stop_word_select')
        .setPlaceholder('اختر الكلمة لإيقافها')
        .addOptions(messages.map(m => ({
          label: m.content.substring(0, 100),
          value: m.id.toString()
        })));

      const row = new ActionRowBuilder<any>().addComponents(select);
      await interaction.reply({ content: 'اختر الكلمة التي تريد إيقافها:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'active_word_btn') {
      const messages: any[] = db.prepare('SELECT * FROM permanent_messages WHERE guildId = ? AND isActive = 0').all(interaction.guildId);
      if (messages.length === 0) return interaction.reply({ content: '❌ لا توجد رسائل متوقفة لتفعيلها.', ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId('active_word_select')
        .setPlaceholder('اختر الكلمة لتفعيلها')
        .addOptions(messages.map(m => ({
          label: m.content.substring(0, 100),
          value: m.id.toString()
        })));

      const row = new ActionRowBuilder<any>().addComponents(select);
      await interaction.reply({ content: 'اختر الكلمة التي تريد تفعيلها:', components: [row], ephemeral: true });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('leave_modal_')) {
      const requestChannelId = interaction.customId.split('_')[2];
      const durationInput = interaction.fields.getTextInputValue('leave_duration');
      const reason = interaction.fields.getTextInputValue('leave_reason');
      const channel = client.channels.cache.get(requestChannelId);

      // Validate duration
      const days = parseInt(durationInput.replace(/[^0-9]/g, ''));
      if (isNaN(days) || days <= 0) {
        return interaction.reply({ content: '❌ يرجى إدخال عدد أيام صحيح (أرقام فقط).', ephemeral: true });
      }
      if (days > 90) {
        return interaction.reply({ content: '❌ عذراً، أقصى مدة لطلب الإجازة هي 3 أشهر (90 يوماً).', ephemeral: true });
      }

      const duration = `${days} أيام`;

      if (channel?.isTextBased()) {
        // Track pending request
        db.prepare('INSERT OR IGNORE INTO pending_requests (userId, guildId) VALUES (?, ?)').run(interaction.user.id, interaction.guildId);

        const embed = new EmbedBuilder()
          .setTitle('**__طــلـب اجــازة جــديــد<:Bell:1480934304052679021>__**')
          .setDescription(`
- **مــعـلـومــات الــطــلـب<:Info:1480934636652859558>**

- **الــشـخــص<:Man:1480934978513539183>: <@${interaction.user.id}>**

- **الــمـدة<:Duration:1480935353778049075>: ${duration}**

- **الــســبـب<:question:1480935899117125704>: ${reason}**
          `)
          .setColor('#2b2d31')
          .setImage('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');

        const select = new StringSelectMenuBuilder()
          .setCustomId(`leave_action_${interaction.user.id}_${duration}`)
          .setPlaceholder('خــيـارات الـطــلـب')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('قبول')
              .setValue('accept')
              .setEmoji('1480943220019040286'),
            new StringSelectMenuOptionBuilder()
              .setLabel('رفض')
              .setValue('reject')
              .setEmoji('1480943473606529288')
          );

        const row = new ActionRowBuilder<any>().addComponents(select);

        await (channel as any).send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم إرسال طلبك للمسؤولين.', ephemeral: true });
      }
    }

    if (interaction.customId.startsWith('resignation_modal_')) {
      const requestChannelId = interaction.customId.split('_')[2];
      const reason = interaction.fields.getTextInputValue('resignation_reason');
      const channel = client.channels.cache.get(requestChannelId);

      if (channel?.isTextBased()) {
        db.prepare('INSERT OR IGNORE INTO pending_resignations (userId, guildId) VALUES (?, ?)').run(interaction.user.id, interaction.guildId);

        const embed = new EmbedBuilder()
          .setTitle('**__طــلـب اســتـقـالة جــديــد<:Bell:1480934304052679021>__**')
          .setDescription(`
- **مــعـلـومــات الــطــلـب<:Info:1480934636652859558>**

- **الــشـخــص<:Man:1480934978513539183>: <@${interaction.user.id}>**

- **الــســبـب<:question:1480935899117125704>: ${reason}**
          `)
          .setColor('#2b2d31')
          .setImage('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');

        const select = new StringSelectMenuBuilder()
          .setCustomId(`resignation_action_${interaction.user.id}`)
          .setPlaceholder('خــيـارات الـطــلـب')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('قبول')
              .setValue('accept')
              .setEmoji('1480943220019040286'),
            new StringSelectMenuOptionBuilder()
              .setLabel('رفض')
              .setValue('reject')
              .setEmoji('1480943473606529288')
          );

        const row = new ActionRowBuilder<any>().addComponents(select);

        await (channel as any).send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم إرسال طلب استقالتك للمسؤولين.', ephemeral: true });
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'remove_word_select') {
      const id = interaction.values[0];
      db.prepare('DELETE FROM permanent_messages WHERE id = ?').run(id);
      await interaction.update({ content: '✅ تم إزالة الكلمة بنجاح.', components: [] });
    }

    if (interaction.customId === 'stop_word_select') {
      const id = interaction.values[0];
      db.prepare('UPDATE permanent_messages SET isActive = 0 WHERE id = ?').run(id);
      await interaction.update({ content: '✅ تم إيقاف الكلمة بنجاح.', components: [] });
    }

    if (interaction.customId === 'active_word_select') {
      const id = interaction.values[0];
      db.prepare('UPDATE permanent_messages SET isActive = 1 WHERE id = ?').run(id);
      await interaction.update({ content: '✅ تم تفعيل الكلمة بنجاح.', components: [] });
    }

    if (interaction.customId.startsWith('resignation_action_')) {
      const userId = interaction.customId.split('_')[2];
      const action = interaction.values[0];
      const guildId = interaction.guildId!;
      
      const settings: any = db.prepare('SELECT * FROM settings WHERE guildId = ?').get(guildId);
      const member = interaction.member as any;

      const canManage = member.permissions.has(PermissionFlagsBits.Administrator) || 
                        (settings?.resignationManagerRoleId && member.roles.cache.has(settings.resignationManagerRoleId));

      if (!canManage) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية اتخاذ هذا القرار.', ephemeral: true });
      }

      const targetMember = await interaction.guild?.members.fetch(userId).catch(() => null);
      
      if (action === 'reject') {
        db.prepare('DELETE FROM pending_resignations WHERE userId = ? AND guildId = ?').run(userId, guildId);
        await interaction.message.delete();
        await interaction.reply({ content: '❌ تم رفض طلب الاستقالة.', ephemeral: true });

        const logChannel = client.channels.cache.get(settings?.resignationLogChannelId);
        if (logChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(`**__ رفــض طــلـب اســتـقـالة <@${userId}>__**`)
            .setDescription(`
- **تــم الـرفــض بــواســطـة: <@${interaction.user.id}>**
- **الــعـضـو: <@${userId}>**
            `)
            .setColor('#ff0000')
            .setTimestamp();
          
          await (logChannel as any).send({ embeds: [embed] });
          await (logChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
        }

        if (targetMember) {
          try {
            await targetMember.send(`**نعتذر، لقد تم رفض طلب استقالتك في سيرفر ${interaction.guild?.name}**`);
          } catch (e) {}
        }
        return;
      }

      if (action === 'accept') {
        db.prepare('DELETE FROM pending_resignations WHERE userId = ? AND guildId = ?').run(userId, guildId);
        
        const logChannel = client.channels.cache.get(settings?.resignationLogChannelId);
        if (logChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(`**__ قــبـول طــلـب اســتـقـالة <@${userId}>__**`)
            .setDescription(`
- **تــم الـقــبـول بــواســطـة: <@${interaction.user.id}>**
- **الــعـضـو: <@${userId}>**
            `)
            .setColor('#00ff00')
            .setTimestamp();
          
          await (logChannel as any).send({ embeds: [embed] });
          await (logChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
        }

        await interaction.message.delete();
        await interaction.reply({ content: '✅ تم قبول الاستقالة بنجاح.', ephemeral: true });

        if (targetMember) {
          try {
            await targetMember.send(`**لقد تم قبول استقالتك في سيرفر ${interaction.guild?.name}. نتمنى لك التوفيق!**`);
            // Optional: Kick or remove roles? The user didn't specify, so I'll just send the message.
          } catch (e) {}
        }
      }
    }

    if (interaction.customId.startsWith('leave_action_')) {
      const [, , userId, durationStr] = interaction.customId.split('_');
      const action = interaction.values[0];
      const guildId = interaction.guildId!;
      
      const settings: any = db.prepare('SELECT * FROM settings WHERE guildId = ?').get(guildId);
      const member = interaction.member as any;

      const canManage = member.permissions.has(PermissionFlagsBits.Administrator) || 
                        (settings?.leaveManagerRoleId && member.roles.cache.has(settings.leaveManagerRoleId));

      if (!canManage) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية اتخاذ هذا القرار.', ephemeral: true });
      }

      const targetMember = await interaction.guild?.members.fetch(userId);
      if (!targetMember) return interaction.reply({ content: '❌ لم يتم العثور على العضو.', ephemeral: true });

      if (action === 'reject') {
        db.prepare('DELETE FROM pending_requests WHERE userId = ? AND guildId = ?').run(userId, guildId);
        await interaction.message.delete();
        await interaction.reply({ content: '❌ تم رفض الطلب.', ephemeral: true });

        // Logging rejection
        const logChannel = client.channels.cache.get(settings?.leaveLogChannelId);
        if (logChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(`**__ رفــض طــلـب إجــازة <@${userId}>__**`)
            .setDescription(`
- **تــم الـرفــض بــواســطـة: <@${interaction.user.id}>**
- **الــعـضـو: <@${userId}>**
            `)
            .setColor('#ff0000')
            .setTimestamp();
          
          await (logChannel as any).send({ embeds: [embed] });
          await (logChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
        }

        try {
          await targetMember.send(`**نعتذر، لقد تم رفض طلب إجازتك في سيرفر ${interaction.guild?.name}**`);
        } catch (e) {}
        return;
      }

      if (action === 'accept') {
        db.prepare('DELETE FROM pending_requests WHERE userId = ? AND guildId = ?').run(userId, guildId);
        // Parse duration (assuming days for simplicity if not specified)
        const daysMatch = durationStr.match(/(\d+)/);
        const days = daysMatch ? parseInt(daysMatch[1]) : 1;
        const endTimestamp = Date.now() + days * 24 * 60 * 60 * 1000;

        const startDate = new Date();
        const endDate = new Date(endTimestamp);
        const dateStr = `${startDate.getFullYear()}/${startDate.getMonth() + 1}/${startDate.getDate()}`;
        const endDateStr = `${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()}`;

        const originalNickname = targetMember.nickname || targetMember.user.username;
        const newNickname = `إجازة من ${dateStr} الى ${endDateStr}`;

        let nicknameError = false;
        try {
          if (targetMember.manageable) {
            await targetMember.setNickname(newNickname);
          } else {
            nicknameError = true;
          }
        } catch (e) {
          console.error('Failed to set nickname:', e);
          nicknameError = true;
        }

        const publicChannel = client.channels.cache.get(settings?.leavePublicChannelId);
        let leaveMsgId = '';
        let imgMsgId = '';

        if (publicChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(`**__ إجــازة <@${userId}>__**`)
            .setThumbnail(targetMember.user.displayAvatarURL())
            .setDescription(`
- تفاصيل الإجازة
- **تــم الـقــبـول بــواســطـة: <@${interaction.user.id}>**
- ** تــم قــب-ول الاجــازة فـي (${dateStr})**
- ** وقــت انـتــهاء الاجــازة فـي (${endDateStr})**
- ** الـوقــت الـمــتـبــقـي لإنــتــهاء الاجــازة بــعـد <t:${Math.floor(endTimestamp / 1000)}:R>**
            `)
            .setColor('#2b2d31');

          const cancelRow = new ActionRowBuilder<any>().addComponents(
            new ButtonBuilder()
              .setCustomId(`cancel_leave_${userId}`)
              .setLabel('الــغــاء الإجــازة')
              .setStyle(ButtonStyle.Danger)
          );

          const msg = await (publicChannel as any).send({ embeds: [embed], components: [cancelRow] });
          const imgMsg = await (publicChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
          
          leaveMsgId = msg.id;
          imgMsgId = imgMsg.id;
        }

        db.prepare(`
          INSERT INTO active_leaves (guildId, userId, originalNickname, endTimestamp, leaveMessageId, leaveChannelId, imageMessageId)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(guildId, userId, originalNickname, endTimestamp, leaveMsgId, settings?.leavePublicChannelId, imgMsgId);

        // Logging acceptance
        const logChannel = client.channels.cache.get(settings?.leaveLogChannelId);
        if (logChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(`**__ قــبـول طــلـب إجــازة <@${userId}>__**`)
            .setDescription(`
- **تــم الـقــبـول بــواســطـة: <@${interaction.user.id}>**
- **الــعـضـو: <@${userId}>**
- **الــمـدة: ${durationStr}**
- **تــنـتـهـي فـي: <t:${Math.floor(endTimestamp / 1000)}:F>**
            `)
            .setColor('#00ff00')
            .setTimestamp();
          
          await (logChannel as any).send({ embeds: [embed] });
          await (logChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
        }

        await interaction.message.delete();
        await interaction.reply({ 
          content: nicknameError 
            ? '✅ تم قبول الطلب بنجاح، ولكن تعذر تغيير اللقب بسبب نقص الصلاحيات (تأكد من أن رتبة البوت أعلى من رتبة العضو).' 
            : '✅ تم قبول الطلب بنجاح.', 
          ephemeral: true 
        });

        try {
          await targetMember.send(`**لــقـد تـم قــبـول اجــازتــك فـي ســيرفـر ${interaction.guild?.name}**`);
        } catch (e) {}
      }
    }
  }
});

async function checkExpiredLeaves() {
  const now = Date.now();
  const expired = db.prepare('SELECT * FROM active_leaves WHERE endTimestamp <= ?').all(now);

  for (const leave of expired as any[]) {
    const guild = client.guilds.cache.get(leave.guildId);
    if (!guild) continue;

    const settings: any = db.prepare('SELECT * FROM settings WHERE guildId = ?').get(leave.guildId);
    const member = await guild.members.fetch(leave.userId).catch(() => null);

    if (member) {
      try {
        if (member.manageable) {
          await member.setNickname(null);
        }
      } catch (e) {}
    }

    const channel = client.channels.cache.get(leave.leaveChannelId);
    if (channel?.isTextBased()) {
      try {
        if (leave.leaveMessageId) {
          const msg = await (channel as any).messages.fetch(leave.leaveMessageId).catch(() => null);
          if (msg) await msg.delete().catch(() => null);
        }
        if (leave.imageMessageId) {
          const imgMsg = await (channel as any).messages.fetch(leave.imageMessageId).catch(() => null);
          if (imgMsg) await imgMsg.delete().catch(() => null);
        }
      } catch (e) {}
    }

    const logChannel = client.channels.cache.get(settings?.leaveLogChannelId);
    if (logChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(`**__ انـتـهـاء إجــازة <@${leave.userId}>__**`)
        .setDescription(`تم إرجاع العضو من الإجازة بنجاح.`)
        .setColor('#ff0000')
        .setTimestamp();
      
      await (logChannel as any).send({ embeds: [embed] });
      await (logChannel as any).send('https://cdn.discordapp.com/attachments/1373379066127716454/1480938731593531493/18e728ebe6975504.png?ex=69b17f2c&is=69b02dac&hm=bcd0207fd02e2658854910f5e25a666223cda4ed72663bdc4435fc0e97f0629e&');
    }

    db.prepare('DELETE FROM active_leaves WHERE id = ?').run(leave.id);
  }
}

client.on('messageCreate', async (message: any) => {
  if (!message.guild || message.author.bot) return;

  // AI Administrative Assistant
  if (message.mentions.has(client.user!) && message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    if (!genAI) {
      return message.reply("❌ عذراً، لم يتم إعداد مفتاح الذكاء الاصطناعي (GEMINI_API_KEY) في البيئة.");
    }

    const prompt = `أنت مساعد إداري محترف لسيرفر ديسكورد. قام مستخدم لديه صلاحيات المسؤول (Administrator) بإرسال رسالة تذكر البوت. مهمتك هي استخراج الإجراء الإداري المقصود بدقة.

الإجراءات الممكنة (يجب الرد بـ JSON فقط):
- TIMEOUT: { "action": "TIMEOUT", "target_id": "ID", "duration_minutes": 10, "reason": "سبب" }
- BAN: { "action": "BAN", "target_id": "ID", "reason": "سبب" }
- KICK: { "action": "KICK", "target_id": "ID", "reason": "سبب" }
- UNBAN: { "action": "UNBAN", "target_id": "ID", "reason": "سبب" }
- UNTIMEOUT: { "action": "UNTIMEOUT", "target_id": "ID" }
- CREATE_CHANNEL: { "action": "CREATE_CHANNEL", "name": "اسم", "type": "text|voice|category" }
- EDIT_CHANNEL: { "action": "EDIT_CHANNEL", "channel_id": "ID", "name": "اسم جديد", "topic": "وصف" }
- DELETE_CHANNEL: { "action": "DELETE_CHANNEL", "channel_id": "ID" }
- CREATE_ROLE: { "action": "CREATE_ROLE", "name": "اسم", "color": "HEX_COLOR" }
- EDIT_ROLE: { "action": "EDIT_ROLE", "role_id": "ID", "name": "اسم جديد", "color": "HEX_COLOR" }
- DELETE_ROLE: { "action": "DELETE_ROLE", "role_id": "ID" }
- ADD_ROLE: { "action": "ADD_ROLE", "target_id": "ID", "role_id": "ID" }
- REMOVE_ROLE: { "action": "REMOVE_ROLE", "target_id": "ID", "role_id": "ID" }
- SET_NICKNAME: { "action": "SET_NICKNAME", "target_id": "ID", "nickname": "اللقب الجديد" }
- CHANNEL_PERMS: { "action": "CHANNEL_PERMS", "channel_id": "ID", "target_id": "ID_ROLE_OR_USER", "allow": ["PERMISSION_NAME"], "deny": ["PERMISSION_NAME"] }

محتوى الرسالة: ${message.content}
الأعضاء المذكورون: ${message.mentions.users.map((u: any) => `${u.username} (${u.id})`).join(', ')}
الرتب المذكورة: ${message.mentions.roles.map((r: any) => `${r.name} (${r.id})`).join(', ')}
القنوات المذكورة: ${message.mentions.channels.map((c: any) => `${c.name} (${c.id})`).join(', ')}

قم بالرد فقط بكائن JSON. إذا لم يكن هناك إجراء واضح، رد بـ { "action": "NONE" }.`;

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
      });
      const responseText = result.text.replace(/```json|```/g, '').trim();
      const aiAction = JSON.parse(responseText);

      if (aiAction.action === 'NONE') return;

      const reason = aiAction.reason || "إجراء إداري عبر الذكاء الاصطناعي";

      switch (aiAction.action) {
        case 'TIMEOUT': {
          const target = await message.guild.members.fetch(aiAction.target_id).catch(() => null);
          if (!target) return message.reply("❌ لم أجد العضو.");
          await target.timeout((aiAction.duration_minutes || 10) * 60000, reason);
          await message.reply(`✅ تم إعطاء تايم أوت لـ <@${aiAction.target_id}>.`);
          break;
        }
        case 'BAN':
          await message.guild.members.ban(aiAction.target_id, { reason });
          await message.reply(`✅ تم حظر <@${aiAction.target_id}>.`);
          break;
        case 'KICK': {
          const target = await message.guild.members.fetch(aiAction.target_id).catch(() => null);
          if (target) await target.kick(reason);
          await message.reply(`✅ تم طرد <@${aiAction.target_id}>.`);
          break;
        }
        case 'UNBAN':
          await message.guild.members.unban(aiAction.target_id, reason);
          await message.reply(`✅ تم إلغاء حظر <@${aiAction.target_id}>.`);
          break;
        case 'UNTIMEOUT': {
          const target = await message.guild.members.fetch(aiAction.target_id).catch(() => null);
          if (target) await target.timeout(null, reason);
          await message.reply(`✅ تم إلغاء التايم أوت لـ <@${aiAction.target_id}>.`);
          break;
        }
        case 'CREATE_CHANNEL': {
          const typeMap: any = { 'text': 0, 'voice': 2, 'category': 4 };
          const channel = await message.guild.channels.create({
            name: aiAction.name,
            type: typeMap[aiAction.type] || 0,
            reason
          });
          await message.reply(`✅ تم إنشاء القناة <#${channel.id}>.`);
          break;
        }
        case 'EDIT_CHANNEL': {
          const channel = await message.guild.channels.fetch(aiAction.channel_id).catch(() => null);
          if (!channel) return message.reply("❌ لم أجد القناة.");
          await (channel as any).edit({
            name: aiAction.name || undefined,
            topic: aiAction.topic || undefined,
            reason
          });
          await message.reply(`✅ تم تعديل القناة <#${channel.id}>.`);
          break;
        }
        case 'DELETE_CHANNEL': {
          const channel = await message.guild.channels.fetch(aiAction.channel_id).catch(() => null);
          if (channel) await channel.delete(reason);
          await message.reply(`✅ تم حذف القناة.`);
          break;
        }
        case 'CREATE_ROLE': {
          const role = await message.guild.roles.create({
            name: aiAction.name,
            color: aiAction.color || undefined,
            reason
          });
          await message.reply(`✅ تم إنشاء الرتبة <@&${role.id}>.`);
          break;
        }
        case 'EDIT_ROLE': {
          const role = await message.guild.roles.fetch(aiAction.role_id).catch(() => null);
          if (!role) return message.reply("❌ لم أجد الرتبة.");
          await role.edit({
            name: aiAction.name || undefined,
            color: aiAction.color || undefined,
            reason
          });
          await message.reply(`✅ تم تعديل الرتبة <@&${role.id}>.`);
          break;
        }
        case 'DELETE_ROLE': {
          const role = await message.guild.roles.fetch(aiAction.role_id).catch(() => null);
          if (role) await role.delete(reason);
          await message.reply(`✅ تم حذف الرتبة.`);
          break;
        }
        case 'ADD_ROLE': {
          const member = await message.guild.members.fetch(aiAction.target_id).catch(() => null);
          if (member) await member.roles.add(aiAction.role_id, reason);
          await message.reply(`✅ تم إضافة الرتبة لـ <@${aiAction.target_id}>.`);
          break;
        }
        case 'REMOVE_ROLE': {
          const member = await message.guild.members.fetch(aiAction.target_id).catch(() => null);
          if (member) await member.roles.remove(aiAction.role_id, reason);
          await message.reply(`✅ تم إزالة الرتبة من <@${aiAction.target_id}>.`);
          break;
        }
        case 'SET_NICKNAME': {
          const member = await message.guild.members.fetch(aiAction.target_id).catch(() => null);
          if (member) await member.setNickname(aiAction.nickname, reason);
          await message.reply(`✅ تم تغيير لقب <@${aiAction.target_id}>.`);
          break;
        }
        case 'CHANNEL_PERMS': {
          const channel = await message.guild.channels.fetch(aiAction.channel_id).catch(() => null);
          if (!channel) return message.reply("❌ لم أجد القناة.");
          
          const allow: any[] = (aiAction.allow || []).map((p: string) => PermissionFlagsBits[p as keyof typeof PermissionFlagsBits]).filter(Boolean);
          const deny: any[] = (aiAction.deny || []).map((p: string) => PermissionFlagsBits[p as keyof typeof PermissionFlagsBits]).filter(Boolean);

          await (channel as any).permissionOverwrites.edit(aiAction.target_id, {
            ...Object.fromEntries(allow.map(p => [p, true])),
            ...Object.fromEntries(deny.map(p => [p, false])),
          }, { reason });
          
          await message.reply(`✅ تم تحديث صلاحيات القناة <#${channel.id}>.`);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error("AI Error:", error);
      await message.reply("❌ حدث خطأ أثناء تنفيذ الإجراء. تأكد من صحة الطلب وصلاحيات البوت.");
    }
  }

  const permMsgs: any[] = db.prepare('SELECT * FROM permanent_messages WHERE guildId = ? AND channelId = ? AND isActive = 1').all(message.guild.id, message.channel.id);
  
  for (const permMsg of permMsgs) {
    try {
      if (permMsg.lastMessageId) {
        const lastMsg = await message.channel.messages.fetch(permMsg.lastMessageId).catch(() => null);
        if (lastMsg) {
          await lastMsg.delete().catch(() => null);
        }
      }
      const newMsg = await message.channel.send(permMsg.content);
      db.prepare('UPDATE permanent_messages SET lastMessageId = ? WHERE id = ?').run(newMsg.id, permMsg.id);
    } catch (e) {
      console.error('Error handling permanent message:', e);
    }
  }
});

client.login(TOKEN);
