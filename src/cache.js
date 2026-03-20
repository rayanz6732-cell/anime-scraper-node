const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

const TTL = {
  SEARCH: 60 * 5,
  INFO: 60 * 60,
  EPISODES: 60 * 10,
  STREAM: 60 * 3,
};

module.exports = {
  get: (key) => cache.get(key),
  set: (key, value, ttl) => cache.set(key, value, ttl),
  TTL,
  stats: () => cache.getStats(),
};
