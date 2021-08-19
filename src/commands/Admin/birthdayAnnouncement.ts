import {Args, PieceContext} from '@sapphire/framework';
import {Message} from 'discord.js';
import {getSettings} from '../../database/models/SettingsModel';
import {BediEmbed} from '../../lib/BediEmbed';
import colors from '../../utils/colorUtil';
import {surroundStringWithBackTick} from '../../utils/discordUtil';
import {agenda, BIRTH_ANNOUNCE_JOB_NAME, isValidTime} from '../../utils/schedulerUtil';

const {Command} = require('@sapphire/framework');

module.exports = class BirthdayAnnouncementCommand extends Command {
  constructor(context: PieceContext) {
    super(context, {
      name: 'birthdayAnnouncement',
      aliases: ['ba'],
      description: 'Schedules Birthday Announcements in the Current Channel',
      preconditions: ['GuildOnly', ['AdminOnly', 'BotOwnerOnly']],
    });
  }

  async run(message: Message, args: Args) {
    const {guildId, channelId} = message;
    const settingsData = await getSettings(guildId as string);

    const announcementTime = await args.pickResult('string');

    if (!announcementTime.success) {
      const embed = new BediEmbed()
          .setColor(colors.ERROR)
          .setTitle('Birthday Announcement Reply')
          .setDescription(`Invalid Syntax!\n\nMake sure your command is in the format 
          ${surroundStringWithBackTick(settingsData.prefix + 'birthdayAnnouncement <time> <role:optional>')}`);
      return message.reply({embeds: [embed]});
    }

    if (!isValidTime(announcementTime.value)) {
      const embed = new BediEmbed()
          .setColor(colors.ERROR)
          .setTitle('Birthday Announcement Reply')
          .setDescription('That is not a valid time.');
      return message.reply({embeds: [embed]});
    }

    // Check if they even inputted a string
    let role = null;
    const roleString = await args.peekResult('string');
    if (roleString.success) {
      // Check if the string is a valid role
      const roleArg = await args.restResult('role');
      if (!roleArg.success) {
        const embed = new BediEmbed()
            .setColor(colors.ERROR)
            .setTitle('Birthday Announcement Reply')
            .setDescription('That is not a valid role.');
        return message.reply({embeds: [embed]});
      }
      role = roleArg.value;
    }

    await agenda.cancel({
      'name': BIRTH_ANNOUNCE_JOB_NAME,
      'data.guildId': guildId,
    });

    let data;

    if (role) {
      data = {
        guildId: guildId,
        channelId: channelId,
        roleId: role.id,
      };
    } else {
      data = {
        guildId: guildId,
        channelId: channelId,
      };
    }

    const job = await agenda.create(BIRTH_ANNOUNCE_JOB_NAME, data);

    await job.repeatEvery('one day', {skipImmediate: true})
             .schedule(announcementTime.value)
             .save();

    // Response message with next run time
    const nextRun = job.attrs.nextRunAt;
    const embed = new BediEmbed()
        .setTitle('Birthday Announcement Reply')
        .setDescription(`Birthday Announcements have been scheduled for ${surroundStringWithBackTick(`${nextRun?.toLocaleTimeString()}`)}`);
    return message.reply({embeds: [embed]});
  }
};
