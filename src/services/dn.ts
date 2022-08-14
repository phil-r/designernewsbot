import { DesignerNewsStory, stories } from '../apis/dn';
import { sendMessage, sendPhoto } from '../apis/telegram';
import cache from '../cache';
import { development, TELEGRAM_CHANNEL } from '../helpers';
import prisma from '../prisma';
import { encode } from '../shortener';

const MINIMUM_DN_STORY_VOTES = 10;

async function addDNStory(story: DesignerNewsStory) {
  console.log('adding', story.id);
  const storyId = parseInt(story.id);

  const cacheKey = `dn/${story.id}`;
  if (cache.get(cacheKey)) return;
  if (story.sponsored) return;
  if (story.vote_count < MINIMUM_DN_STORY_VOTES) return;

  const shortId = encode(storyId);

  const exisitngstory = await prisma.designerNewsStory.findUnique({
    where: { id: storyId },
  });
  if (exisitngstory) {
    cache.set(cacheKey, exisitngstory.url);
    return;
  }
  const buttons = [];

  const dnUrl = getDNStoryCommentsUrl(story.id);
  let shortUrl = `${
    development ? 'http://localhost:8080' : 'https://dsgnr.news'
  }/s/${shortId}`;
  let storyUrl = story.url;
  const shortDnUrl = `${
    development ? 'http://localhost:8080' : 'https://dsgnr.news'
  }/c/${shortId}`;

  if (!story.url) {
    shortUrl = shortDnUrl;
    storyUrl = dnUrl;
  } else {
    buttons.push({
      text: 'Read',
      url: storyUrl,
    });
  }

  buttons.push({
    text: `${story.comment_count}+ Comments`,
    url: dnUrl,
  });

  // TODO: add timeago

  let message = `<b>${story.title}</b> (Score: ${story.vote_count}+) #DN\n\n`;
  message += `<b>Link:</b> ${shortUrl}\n`;

  // Add comments Link(don't add it for `Ask dn`, etc)

  if (story.url) {
    message += `<b>Comments:</b> ${shortDnUrl}\n`;
  }

  // Add text

  if (story.comment) {
    message += `\n${story.comment
      .replace('<p>', '\n')
      .replace('&#x27;', "'")
      .replace('&#x2F;', '/')}\n`;
  }

  console.log('sending', story.id);

  const result = await sendMessage(TELEGRAM_CHANNEL, message, {
    inline_keyboard: [buttons],
  });

  console.log('Telegram response:', result);

  let telegramMessageId;

  if (result?.ok) {
    telegramMessageId = result.result.message_id;
    // TODO: in python version we actually ignored telegram errors to prevent double postings
    await prisma.designerNewsStory.create({
      data: {
        id: storyId,
        title: story.title,
        url: storyUrl,
        score: story.vote_count,
        text: story.comment,
        shortUrl,
        message,
        shortDnUrl,
        telegramMessageId,
      },
    });
    cache.set(cacheKey, story.url);
  }
}

export async function dnCron() {
  const dnStories = await stories();
  if (!dnStories?.stories) return;
  const storysList = dnStories.stories;
  console.log(
    'checking stories:',
    storysList.map((story) => story.id)
  );
  await Promise.all(storysList.map((story) => addDNStory(story)));
}

export async function getDNStoryUrl(id: number): Promise<string | null> {
  const cacheKey = `dn/${id}`;
  const cached = cache.get(cacheKey) as string;
  if (cached) return cached;

  const story = await prisma.designerNewsStory.findUnique({ where: { id } });
  if (story) {
    cache.set(cacheKey, story.url);
    return story.url;
  }
  return null;
}

export function getDNStoryCommentsUrl(id: number | string): string {
  return `https://www.designernews.co/stories/${id}`;
}
