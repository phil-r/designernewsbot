import LRU from 'lru-cache';

const options = {
  max: 1000,
};

export default new LRU(options);
