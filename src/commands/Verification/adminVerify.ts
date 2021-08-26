import {Args, PieceContext} from '@sapphire/framework';
import {Message} from 'discord.js';
import {BediEmbed} from '../../lib/BediEmbed';
import colors from '../../utils/colorUtil';
import {getSettings} from '../../database/models/SettingsModel';
import {addVerifiedUser} from '../../database/models/VerifiedUserModel';
import {addRoleToUser} from '../../utils/discordUtil';

const {Command} = require('@sapphire/framework');

module.exports = class AdminVerifyCommand extends Command {
  constructor(context: PieceContext) {
    super(context, {
      name: 'adminVerify',
      description: 'Forcibly verifies a user in the server.',
      preconditions: ['GuildOnly', ['BotOwnerOnly', 'AdminOnly'], 'VerificationEnabled'],
      detailedDescription: 'adminVerify <@User>`',
    });
  }

  async run(message: Message, args: Args) {
    const {guild, guildId, author} = message;
    const settingsData = await getSettings(guildId as string);

    if (!settingsData.verificationEnabled) {
      const embed = new BediEmbed()
          .setColor(colors.ERROR)
          .setTitle('Admin Verify Reply')
          .setDescription('Verification is not enabled on this server!'); // TODO: Explain how to enable verification when implemented
      return message.reply({embeds: [embed]});
    }

    const user = await args.pickResult('user');
    if (!user.success) {
      const embed = new BediEmbed()
          .setColor(colors.ERROR)
          .setTitle('Admin Verify Reply')
          .setDescription('Invalid Syntax!\n\nMake sure your command is in the format `' + settingsData.prefix + 'adminVerify <@User>`');
      return message.reply({embeds: [embed]});
    }

    await addRoleToUser(user.value.id, guild, settingsData.verifiedRole);
    await addVerifiedUser(user.value.id, guildId as string, 'Admin Verified');
    const embed = new BediEmbed()
        .setTitle('Admin Verify Reply')
        .setColor(colors.SUCCESS)
        .setDescription(`${user.value} has been verified.`);
    return message.reply({embeds: [embed]});
  }
};