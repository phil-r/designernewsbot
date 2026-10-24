import type { BehanceProject } from '../../src/apis/behance';
import type { DribbbleShot } from '../../src/apis/dribbble';

export const project: BehanceProject = {
  id: 42,
  name: 'Synthetic project',
  url: 'https://example.invalid/project',
  stats: { appreciations: 1800, views: 2000, comments: 3 },
  covers: { original: 'https://example.invalid/project.jpg' },
};
export const shot: DribbbleShot = {
  id: 42,
  title: 'Synthetic shot',
  url: 'https://example.invalid/shot',
  img: 'https://example.invalid/shot.jpg',
  likes: 250,
  author: { name: 'Fixture', url: 'https://example.invalid/author' },
};
