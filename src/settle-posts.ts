// Drain every in-flight delivery before a one-shot job can close SQLite.
export async function settlePosts(posts: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(posts);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
