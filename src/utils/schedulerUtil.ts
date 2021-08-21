import logger from './loggerUtil';

import Agenda, {Job} from 'agenda/dist/index';
import {BaseGuildTextChannel} from 'discord.js';
import {BediEmbed} from '../lib/BediEmbed';
import {getRandomQuote} from '../database/models/QuoteModel';
import {getUserFromMention, surroundStringWithBackTick} from './discordUtil';
import {getBirthdaysToday} from '../database/models/BirthdayModel';
import {getSettings} from '../database/models/SettingsModel';
import {getDueDatesInGuildForCategoryAndCourse, removeOldDueDatesInGuild} from '../database/models/DueDateModel';
import {container} from '@sapphire/framework';

const humanInterval = require('human-interval');

export const UNLOCK_JOB_NAME = 'Unlock Channel for Role';
export const MORN_ANNOUNCE_JOB_NAME = 'Send Morning Announcement';
export const BIRTH_ANNOUNCE_JOB_NAME = 'Send Birthday Announcement';
export const DUE_DATE_UPDATE_JOB_NAME = 'Update Due Dates';

export const agenda = new Agenda();

export const startAgenda = async () => {
  agenda.database(process.env.MONGO_URI as string);
  await agenda.start();
  logger.info('Agenda Started!');

  agenda.on('start', (job) => {
    logger.verbose(`Job ${job.attrs.name} started`);
  });

  agenda.on('success', (job) => {
    logger.verbose(`Job ${job.attrs.name} succeeded`);
  });

  agenda.on('fail', (err, job) => {
    logger.error(`Job ${job.attrs.name} failed with error: ${err.message}`);
  });
};

export const isValidDurationOrTime = (string: string) => {
  if (string.length === 0) return false;
  if (isValidTime(string)) return true;
  return !isNaN(humanInterval(string).valueOf());
};

export const isValidTime = (string: string) => {
  const re12 = /((1[0-2]|0?[1-9]):([0-5][0-9]) ?([AaPp][Mm]))/;
  const re12Short = /(1[0-2]|0?[1-9] ?([AaPp][Mm]))/;
  const re24 = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
  if (re12.test(string) || re24.test(string) || re12Short.test(string)) return true;
  return false;
};

agenda.define(UNLOCK_JOB_NAME, async (job: Job) => {
  const client = container.client;

  const guildId = job.attrs.data?.guildId;
  const channelId = job.attrs.data?.channelId;
  const roleId = job.attrs.data?.roleId;
  const messageId = job.attrs.data?.messageId;

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const channel = await guild.channels.fetch(channelId) as BaseGuildTextChannel;
    const role = await guild.roles.fetch(roleId);
    if (channel && role) {
      await channel.permissionOverwrites.edit(role, {SEND_MESSAGES: true});

      const message = await channel.messages.fetch(messageId);
      if (message) {
        const embed = new BediEmbed()
            .setTitle('Lockdown Reply')
            .setDescription(`Channel has been unlocked for ${role.toString()}`);
        await message.reply({embeds: [embed]});
      } else {
        job.fail('Message not found. This means either the message has been deleted.');
      }
    } else {
      job.fail('Channel or Role not found. This means either the channel or role has been deleted.');
    }
  } else {
    job.fail('Guild not found. This means BediBot is no longer in this guild.');
  }
  await job.remove();
});

agenda.define(MORN_ANNOUNCE_JOB_NAME, async (job: Job) => {
  const client = container.client;

  const guildId = job.attrs.data?.guildId;
  const channelId = job.attrs.data?.channelId;

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const channel = await guild.channels.fetch(channelId) as BaseGuildTextChannel;
    if (channel) {
      const quote = await getRandomQuote(guildId);
      const user = await getUserFromMention(quote?.author as string);

      let description: string;
      if (quote?.date) {
        if (user) description = `Quote: ${surroundStringWithBackTick(quote?.quote as string)}
        Author: ${quote?.author}
        Date: ${surroundStringWithBackTick(quote?.date.toDateString() as string)}`;
        else description = `Quote: ${surroundStringWithBackTick(quote?.quote as string)}
        Author: ${surroundStringWithBackTick(quote?.author as string)}
        Date: ${surroundStringWithBackTick(quote?.date.toDateString() as string)}`;
      } else {
        if (user) description = `Quote: ${surroundStringWithBackTick(quote?.quote as string)}
        Author: ${quote?.author}`;
        else description = `Quote: ${surroundStringWithBackTick(quote?.quote as string)}
        Author: ${surroundStringWithBackTick(quote?.author as string)}`;
      }

      const embed = new BediEmbed()
          .setTitle('Good Morning!')
          .setDescription(description);
      await channel.send({embeds: [embed]});
    } else {
      job.fail('Channel not found. This means that the channel has been deleted.');
      await job.remove();
    }
  } else {
    job.fail('Guild not found. This means BediBot is no longer in this guild.');
    await job.remove();
  }
});

agenda.define(BIRTH_ANNOUNCE_JOB_NAME, async (job: Job) => {
  const client = container.client;

  const guildId = job.attrs.data?.guildId;
  const channelId = job.attrs.data?.channelId;
  const roleId = job.attrs.data?.roleId;

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const channel = await guild.channels.fetch(channelId) as BaseGuildTextChannel;
    if (channel) {
      const settingsData = await getSettings(guildId);
      const birthdays = await getBirthdaysToday(settingsData.timezone);
      const guildMembers = await guild.members.fetch();
      birthdays.filter(birthday => guildMembers.has(birthday._id));

      let role = null;
      if (roleId) {
        role = await guild.roles.fetch(roleId);
        if (role) {
          for (const member of guildMembers) {
            if (member[1].roles.cache.has(roleId)) await member[1].roles.remove(role);
          }
        }
      }

      if (birthdays.length === 0) return;

      let mentions = '';
      for (const birthday of birthdays) {
        const user = guildMembers.get(birthday._id);
        if (role) user?.roles.add(role);
        mentions += ` ${user?.toString()}`;
      }

      const embed = new BediEmbed()
          .setTitle('Happy Birthday!')
          .setDescription(mentions);

      await channel.send({embeds: [embed]});

    } else {
      job.fail('Channel not found. This means that the channel has been deleted.');
      await job.remove();
    }
  } else {
    job.fail('Guild not found. This means BediBot is no longer in this guild.');
    await job.remove();
  }
});

const MAX_NUM_EMBED_FIELDS = 25;

agenda.define(DUE_DATE_UPDATE_JOB_NAME, async (job: Job) => {
  const client = container.client;

  const guildId = job.attrs.data?.guildId;
  const channelId = job.attrs.data?.channelId;
  const messageId = job.attrs.data?.messageId;
  const category = job.attrs.data?.category;

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const channel = await guild.channels.fetch(channelId) as BaseGuildTextChannel;
    if (channel) {
      const message = await channel.messages.fetch(messageId);
      if (message) {
        // This should never return as you should never schedule this job with a messageID unless the client sent it
        if (message.author.id != client.id) return;

        await removeOldDueDatesInGuild(guildId);

        const settingsData = await getSettings(guildId);

        const embed = new BediEmbed().setTitle(`Due Dates for Category: ${category}`);

        for (const course of settingsData.courses) {
          if (embed.fields.length === MAX_NUM_EMBED_FIELDS) {
            break;
          }

          const dueDates = await getDueDatesInGuildForCategoryAndCourse(guildId, category, course);

          for (const dueDate of dueDates) {
            let emoji: string;
            switch (dueDate.type) {
              case 'Assignment':
                emoji = ':pushpin:';
                break;
              case 'Test':
                emoji = ':bulb:';
                break;
              case 'Exam':
                emoji = ':pen_ballpoint:';
                break;
              case 'Project':
                emoji = ':books:';
                break;
              case 'Quiz':
                emoji = ':pencil:';
                break;
              default:
                emoji = ':placard:';
            }

            let fieldName: string;
            if (dueDate === dueDates[0]) fieldName = `——————————**${course}**——————————\n\n${emoji} ${dueDate.title}`;
            else fieldName = `${emoji} ${dueDate.title}`;

            let fieldValue: string;
            if (dueDate.dateOnly) fieldValue = `**Type:** ${surroundStringWithBackTick(dueDate.type)}
            **Date:** ${surroundStringWithBackTick(dueDate.dateTime.toLocaleString('en-US', {timeZone: settingsData.timezone, dateStyle: 'full'}))}
            \u200b`;
            else fieldValue = `**Type:** ${surroundStringWithBackTick(dueDate.type)}
            **Date:** ${surroundStringWithBackTick(
                dueDate.dateTime.toLocaleString('en-US', {timeZone: settingsData.timezone, dateStyle: 'full', timeStyle: 'short'}))}
            \u200b`;

            if (embed.fields.length === (MAX_NUM_EMBED_FIELDS - 1)) {
              embed.addField('Maximum Limit Reached', 'Remaining Due Dates hidden');
              break;
            }

            embed.addField(fieldName, fieldValue, false);
          }
        }
        await message.edit({embeds: [embed]});
      } else {
        job.fail('Message not found. This means either the message has been deleted.');
        await job.remove();
      }
    } else {
      job.fail('Channel not found. This means that the channel has been deleted.');
      await job.remove();
    }
  } else {
    job.fail('Guild not found. This means BediBot is no longer in this guild.');
    await job.remove();
  }
});