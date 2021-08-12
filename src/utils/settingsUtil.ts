import {capFirstLetterEveryWord} from './stringsUtil';

// Array of settings modules
const modules = ['verification', 'birthdays', 'announcements', 'due dates', 'quotes'];

/**
 * Creates a pretty string to represent modules in the $settings command embed.
 *
 * @return {string} A pretty string representation of all settings modules.
 */
export const listModulesString = () => {
  const copy = [...modules];

  for (let i = 0; i < copy.length; i++) {
    copy[i] = '`' + capFirstLetterEveryWord(copy[i]) + '`';
  }

  return copy.join(' ');
};