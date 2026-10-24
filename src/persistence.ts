// Small injection seam for offline service characterization. Native adapter tests
// import db.ts directly so module mocks never replace SQLite validation.
export { default, getDatabase, closeDatabase } from './db';
