import './block-network';
import { mock } from 'bun:test';

// Used only by isolated CLI tests: no root environment or actual network work.
mock.module('../../src/environment', () => ({}));
