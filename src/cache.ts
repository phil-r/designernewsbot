import { LRUCache } from 'lru-cache';

const options = {
  max: 1000,
};

export default new LRUCache<string, string>(options);
