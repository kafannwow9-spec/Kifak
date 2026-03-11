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

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ ERROR: DISCORD_TOKEN is not defined in environment variables!");
}

// Commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('طلب-اجازة')
    .setDescription('إعداد رسالة طلب الإجازة')
    .addStringOption(opt => opt.setName('عنوان-الايمبد').setDescription('عنوان الايمبد').setRequired(true))
    .addStringOption(opt => opt.setName('وصف-الايمبد').setDescription('وصف الايمبد').setRequired(true))
    .addChannelOption(opt => opt.setName('روم-الطلبات').setDescription('الروم الذي سترسل إليه الطلبات للمسؤولين').setRequired(true))
    .addChannelOption(opt => opt.setName('روم-الإجازات').setDescription('الروم العام للإجازات').setRequired(true))
    .addChannelOption(opt => opt.setName('لوق-الإجازات').setDescription('روم السجلات (اللوق)').setRequired(true))
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

    if (commandName === 'إعداد-الاستقالة') {
      const title = options.getString('عنوان-الايمبد');
      const desc = options.getString('وصف-الايمبد');
      const requestChannel = options.getChannel('روم-الطلبات');
      const logChannel = options.getChannel('لوق-الاستقالات');

      db.prepare(`
        INSERT INTO settings (guildId, resignationLogChannelId)
        VALUES (?, ?)
        ON CONFLICT(guildId) DO UPDATE SET
          resignationLogChannelId = excluded.resignationLogChannelId
      `).run(guildId, logChannel?.id);

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
      const title = options.getString('عنوان-الايمبد');
      const desc = options.getString('وصف-الايمبد');
      const requestChannel = options.getChannel('روم-الطلبات');
      const publicChannel = options.getChannel('روم-الإجازات');
      const logChannel = options.getChannel('لوق-الإجازات');

      db.prepare(`
        INSERT INTO settings (guildId, leaveLogChannelId, leavePublicChannelId)
        VALUES (?, ?, ?)
        ON CONFLICT(guildId) DO UPDATE SET
          leaveLogChannelId = excluded.leaveLogChannelId,
          leavePublicChannelId = excluded.leavePublicChannelId
      `).run(guildId, logChannel?.id, publicChannel?.id);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
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
        .setLabel('مدة الإجازة (مثال: 10 أيام)')
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

      if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.roles.cache.has(settings?.leaveManagerRoleId)) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية إلغاء الإجازة.', ephemeral: true });
      }

      const leave: any = db.prepare('SELECT * FROM active_leaves WHERE userId = ? AND guildId = ?').get(userId, guildId);
      if (!leave) return interaction.reply({ content: '❌ لم يتم العثور على إجازة نشطة لهذا العضو.', ephemeral: true });

      const targetMember = await interaction.guild?.members.fetch(userId).catch(() => null);
      if (targetMember) {
        try {
          await targetMember.setNickname(leave.originalNickname);
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
        } catch (e) {
          console.error('Error deleting leave messages:', e);
        }
      }

      const logChannel = client.channels.cache.get(settings?.leaveLogChannelId) || await client.channels.fetch(settings?.leaveLogChannelId).catch(() => null);
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
      await interaction.reply({ content: '✅ تم إلغاء الإجازة بنجاح.', ephemeral: true });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('leave_modal_')) {
      const requestChannelId = interaction.customId.split('_')[2];
      const duration = interaction.fields.getTextInputValue('leave_duration');
      const reason = interaction.fields.getTextInputValue('leave_reason');
      const channel = client.channels.cache.get(requestChannelId);

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
    if (interaction.customId.startsWith('resignation_action_')) {
      const userId = interaction.customId.split('_')[2];
      const action = interaction.values[0];
      const guildId = interaction.guildId!;
      
      const settings: any = db.prepare('SELECT * FROM settings WHERE guildId = ?').get(guildId);
      const member = interaction.member as any;

      if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.roles.cache.has(settings?.resignationManagerRoleId)) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية اتخاذ هذا القرار.', ephemeral: true });
      }

      const targetMember = await interaction.guild?.members.fetch(userId).catch(() => null);
      
      if (action === 'reject') {
        db.prepare('DELETE FROM pending_resignations WHERE userId = ? AND guildId = ?').run(userId, guildId);
        await interaction.message.delete();
        await interaction.reply({ content: '❌ تم رفض طلب الاستقالة.', ephemeral: true });

        const logChannel = client.channels.cache.get(settings?.resignationLogChannelId) || await client.channels.fetch(settings?.resignationLogChannelId).catch(() => null);
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
        
        const logChannel = client.channels.cache.get(settings?.resignationLogChannelId) || await client.channels.fetch(settings?.resignationLogChannelId).catch(() => null);
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

      if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.roles.cache.has(settings?.leaveManagerRoleId)) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية اتخاذ هذا القرار.', ephemeral: true });
      }

      const targetMember = await interaction.guild?.members.fetch(userId);
      if (!targetMember) return interaction.reply({ content: '❌ لم يتم العثور على العضو.', ephemeral: true });

      if (action === 'reject') {
        db.prepare('DELETE FROM pending_requests WHERE userId = ? AND guildId = ?').run(userId, guildId);
        await interaction.message.delete();
        await interaction.reply({ content: '❌ تم رفض الطلب.', ephemeral: true });

        // Logging rejection
        const logChannel = client.channels.cache.get(settings?.leaveLogChannelId) || await client.channels.fetch(settings?.leaveLogChannelId).catch(() => null);
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

        try {
          await targetMember.setNickname(newNickname);
        } catch (e) {
          console.error('Failed to set nickname:', e);
        }

        const publicChannel = client.channels.cache.get(settings?.leavePublicChannelId) || await client.channels.fetch(settings?.leavePublicChannelId).catch(() => null);
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
        const logChannel = client.channels.cache.get(settings?.leaveLogChannelId) || await client.channels.fetch(settings?.leaveLogChannelId).catch(() => null);
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
        await interaction.reply({ content: '✅ تم قبول الطلب بنجاح.', ephemeral: true });

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
        await member.setNickname(leave.originalNickname);
      } catch (e) {}
    }

    const channel = client.channels.cache.get(leave.leaveChannelId) || await client.channels.fetch(leave.leaveChannelId).catch(() => null);
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

    const logChannel = client.channels.cache.get(settings?.leaveLogChannelId) || await client.channels.fetch(settings?.leaveLogChannelId).catch(() => null);
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

client.login(TOKEN);
