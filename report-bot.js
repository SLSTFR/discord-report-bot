const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, StringSelectMenuBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const token = 'token';
const guildId = 'serverid';
const channelId = 'channelidforbutton';
const adminReportChannelId = 'reportchannelforsilandcagir';

let userReports = loadReports();

client.once('ready', () => {
    console.log(`Bot is ready!`);

    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('report_button')
                .setLabel('Rapor Oluştur')
                .setStyle(ButtonStyle.Primary)
        );

    
    const rest = new REST({ version: '10' }).setToken(token);
    rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
        body: [
            {
                name: 'kapat',
                description: 'Rapor kanalını kapatır',
                type: 1
            },
            {
                name: 'kaydet',
                description: 'Raporu kaydeder',
                type: 1
            },
            {
                name: 'cagir',
                description: '[kullanıcıadı] - Kullanıcının raporlarını çağırır',
                options: [{
                    name: 'kullanıcı',
                    type: 6,
                    description: 'Raporlarını görmek istediğiniz kullanıcıyı seçin',
                    required: true
                }],
                type: 1
            },
            {
                name: 'sil',
                description: '[kullanıcıadı] [id] - Kullanıcının raporunu siler',
                options: [
                    {
                        name: 'kullanıcı',
                        type: 6,
                        description: 'Silmek istediğiniz kullanıcının ID\'sini seçin',
                        required: true
                    },
                    {
                        name: 'id',
                        type: 4,
                        description: 'Silmek istediğiniz rapor ID\'sini girin',
                        required: true
                    }
                ],
                type: 1
            }
        ]
    }).then(() => console.log('Komutlar kaydedildi!'))
    .catch(console.error);

    
    const channel = client.channels.cache.get(channelId);
    if (channel) {
        channel.send({
            content: 'Aşağıdaki butona basarak rapor oluşturabilirsiniz:',
            components: [row]
        }).catch(console.error);
    } else {
        console.error('Kanal bulunamadı!');
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isCommand() && !interaction.isStringSelectMenu()) return;

    try {
        
        if (interaction.isButton() && interaction.customId === 'report_button') {
            const user = interaction.user;
            const channelName = `${user.username}-rapor`;
            const guild = interaction.guild;

            
            const existingChannel = guild.channels.cache.find(ch => ch.name === channelName);
            if (existingChannel) {
                if (!interaction.replied) {
                    await interaction.reply({ content: 'Halihazırda raporunuz mevcut.', ephemeral: true });
                }
                return;
            }

            
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel]
                    }
                ]
            });

            
            await channel.send({
                content: `${user} Sorununuzu anlatın.`,
            });

            if (!interaction.replied) {
                await interaction.reply({ content: `Rapor kanalınız ${channel} oluşturuldu.`, ephemeral: true });
            }

            
            if (!userReports[user.id]) {
                userReports[user.id] = { currentId: 1, reports: {} };
            } else {
                userReports[user.id].currentId++;
            }
            const reportId = userReports[user.id].currentId;
            userReports[user.id].reports[reportId] = {
                channelId: channel.id,
                saved: false
            };

            
            saveReports(userReports);
        }

        
        if (interaction.isCommand() && interaction.commandName === 'kapat') {
            if (interaction.channel && interaction.channel.type === ChannelType.GuildText && interaction.channel.name.endsWith('-rapor')) {
                await interaction.reply({ content: 'Rapor kanalınız siliniyor...', ephemeral: true }); 
                await interaction.channel.delete();
            } else {
                await interaction.reply({ content: 'Bu komutu sadece rapor kanallarında kullanabilirsiniz.', ephemeral: true });
            }
        }

        
        if (interaction.isCommand() && interaction.commandName === 'kaydet') {
            const user = interaction.user;
            const reportId = Object.keys(userReports[user.id]?.reports || {}).find(id => userReports[user.id].reports[id].channelId === interaction.channel.id);

            if (reportId && userReports[user.id]?.reports[reportId]) {
                
                userReports[user.id].reports[reportId].saved = true;
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const messageContent = messages.map(msg => `${msg.author.username}: ${msg.content}`).reverse().join('\n');

                
                userReports[user.id].reports[reportId].content = messageContent;
                saveReports(userReports);

                await interaction.reply({ content: `Rapor ID: ${reportId} kaydedildi.`, ephemeral: true });
            } else {
                await interaction.reply({ content: 'Bu kanalda rapor kaydedilemedi.', ephemeral: true });
            }
        }

        
        if (interaction.isCommand() && interaction.commandName === 'cagir') {
            
            if (interaction.channelId !== adminReportChannelId) {
                await interaction.reply({ content: 'Bu komut sadece admin-report kanalında kullanılabilir.', ephemeral: true });
                return;
            }

            const user = interaction.options.getUser('kullanıcı');
            const userReportData = userReports[user.id]?.reports;

            if (!userReportData || Object.keys(userReportData).length === 0) {
                await interaction.reply({ content: 'Bu kullanıcının raporu yok.', ephemeral: true });
                return;
            }

            const savedReports = Object.entries(userReportData)
                .filter(([id, report]) => report.saved)
                .map(([id, report]) => ({
                    label: `Rapor ID: ${id}`,
                    value: id
                }));

            if (savedReports.length === 0) {
                await interaction.reply({ content: 'Bu kullanıcı için kayıtlı rapor bulunamadı.', ephemeral: true });
                return;
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_report')
                        .setPlaceholder('Bir rapor seçin')
                        .addOptions(savedReports)
                );

            await interaction.reply({ content: 'Kullanıcının raporları:', components: [row], ephemeral: true });
        }

        
        if (interaction.isCommand() && interaction.commandName === 'sil') {
            
            if (interaction.channelId !== adminReportChannelId) {
                await interaction.reply({ content: 'Bu komut sadece admin-report kanalında kullanılabilir.', ephemeral: true });
                return;
            }

            const user = interaction.options.getUser('kullanıcı');
            const reportId = interaction.options.getInteger('id');
            const userReportData = userReports[user.id]?.reports;
            
            if (userReportData[reportId].saved === false) {
                await interaction.reply({ content: 'Bu ID\'ye sahip bir rapor kaydedilmemiş.', ephemeral: true });
                return;
            }

            if (userReports[user.id]?.reports[reportId]) {
                delete userReports[user.id].reports[reportId];

                
                if (Object.keys(userReports[user.id].reports).length === 0) {
                    delete userReports[user.id];
                }

                
                saveReports(userReports);

                await interaction.reply({ content: `Rapor ID: ${reportId} silindi.`, ephemeral: true });
            } else {
                await interaction.reply({ content: 'Belirtilen rapor bulunamadı.', ephemeral: true });
            }
        }

        
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_report') {
            const userId = interaction.user.id;
            const selectedReportId = interaction.values[0];
            const userReport = userReports[userId]?.reports[selectedReportId];

            if (userReport && userReport.saved) {
                await interaction.reply({ content: `Rapor ID: ${selectedReportId}\n\n${userReport.content}`, ephemeral: true });
            } else {
                await interaction.reply({ content: 'Bu rapor henüz kaydedilmemiş veya bulunamamış.', ephemeral: true });
            }
        }

    } catch (error) {
        console.error('Interaction handling error:', error);
    }
});


function loadReports() {
    try {
        const data = fs.readFileSync('userReports.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {}; 
    }
}


function saveReports(reports) {
    fs.writeFileSync('userReports.json', JSON.stringify(reports, null, 2));
}

client.login('token');
