import {MessageEmbed} from 'discord.js';

export class BediEmbed extends MessageEmbed {
  public constructor() {
    super();
    this.setFooter('For any concerns, contact a BediBot dev: Aadi, Carson, Joe, Sahil, & Zayd');
    this.setTimestamp();
  }
};