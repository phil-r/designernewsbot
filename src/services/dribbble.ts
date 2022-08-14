import { DribbbleShot, dribbbleTop } from '../apis/dribbble';
import { sendPhoto, sendVideo } from '../apis/telegram';
import cache from '../cache';
import { development, TELEGRAM_CHANNEL } from '../helpers';
import prisma from '../prisma';
import { encode } from '../shortener';

const MINIMUM_DRIBBBLE_LIKES = 250; // TODO: reduce?

async function addDribbbleShot(shot: DribbbleShot) {
  console.log('adding', shot.id);

  const cacheKey = `d/${shot.id}`;
  if (cache.get(cacheKey)) return;
  if (shot.likes < MINIMUM_DRIBBBLE_LIKES) return;

  const shortId = encode(shot.id);

  const exisitngShot = await prisma.dribbbleShot.findUnique({
    where: { id: shot.id },
  });
  if (exisitngShot) {
    cache.set(cacheKey, shot.url);
    return;
  }
  const shortUrl = `${
    development ? 'http://localhost:8080' : 'https://dsgnr.news'
  }/d/${shortId}`;

  const buttons = [
    {
      text: 'Open shot',
      url: shot.url,
    },
  ];

  let message = `<b>${shot.title}</b> (Score: ${shot.likes}+) #dribbble\n\n`;
  message += `<b>Link:</b> ${shortUrl}\n`;

  console.log('sending', shot.id);

  const result = shot.video
    ? await sendVideo(TELEGRAM_CHANNEL, shot.video, message, {
        inline_keyboard: [buttons],
      })
    : await sendPhoto(TELEGRAM_CHANNEL, shot.img, message, {
        inline_keyboard: [buttons],
      });

  console.log('Telegram response:', result);

  let telegramMessageId;

  if (result?.ok) {
    telegramMessageId = result.result.message_id;
    // TODO: in python version we actually ignored telegram errors to prevent double postings
    await prisma.dribbbleShot.create({
      data: {
        id: shot.id,
        title: shot.title,
        url: shot.url,
        score: shot.likes,
        shortUrl,
        message,
        telegramMessageId,
      },
    });
    cache.set(cacheKey, shot.url);
  }
}

export async function dribbbleCron() {
  const shots = await dribbbleTop();
  if (!shots?.top) return;
  const shotsList = shots.top;
  console.log(
    'checking shots:',
    shotsList.map((shot) => shot.id)
  );
  await Promise.all(shotsList.map((shot) => addDribbbleShot(shot)));
}

export async function getDribbleShotUrl(id: number): Promise<string | null> {
  const cacheKey = `d/${id}`;
  const cached = cache.get(cacheKey) as string;
  if (cached) return cached;

  const shot = await prisma.dribbbleShot.findUnique({ where: { id } });
  if (shot) {
    cache.set(cacheKey, shot.url);
    return shot.url;
  }
  return null;
}
