const FLAGS = {
  'Netherlands': '🇳🇱',
  'Estonia': '🇪🇪',
  'Germany': '🇩🇪',
  'Finland': '🇫🇮',
  'France': '🇫🇷',
  'Sweden': '🇸🇪',
  'Poland': '🇵🇱',
  'Latvia': '🇱🇻',
  'Lithuania': '🇱🇹',
  'Turkey': '🇹🇷',
  'USA': '🇺🇸',
  'UK': '🇬🇧',
  'Singapore': '🇸🇬',
  'Japan': '🇯🇵',
};

const getFlag = (location) => FLAGS[location] || '🌍';

module.exports = { getFlag };
