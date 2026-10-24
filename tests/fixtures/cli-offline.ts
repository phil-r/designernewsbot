import './block-network';
import { mock } from 'bun:test';

// Used only by isolated CLI tests: no root environment or actual network work.
mock.module('../../src/environment', () => ({}));
mock.module(import.meta.resolve('axios'), () => ({
  default: {
    get: async () => {
      throw new Error('Offline CLI forbids upstream requests');
    },
    post: async () => {
      throw new Error('Offline CLI forbids Telegram requests');
    },
  },
}));
