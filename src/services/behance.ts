import { projects, BehanceProject } from '../apis/behance';
import { sendPhoto } from '../apis/telegram';
import cache from '../cache';
import { development, TELEGRAM_CHANNEL } from '../helpers';
import prisma from '../prisma';
import { encode } from '../shortener';

const MINIMUM_BEHANCE_APPRECIATIONS = 1800; // TODO: reduce?

export async function addBehanceProject(
  project: BehanceProject,
  ignoreLimit = false
) {
  console.log('adding', project.id);

  const cacheKey = `b/${project.id}`;
  if (cache.get(cacheKey)) return;
  if (
    !ignoreLimit &&
    project.stats.appreciations < MINIMUM_BEHANCE_APPRECIATIONS
  )
    return;

  const shortId = encode(project.id);

  const exisitngproject = await prisma.behanceProject.findUnique({
    where: { id: project.id },
  });
  if (exisitngproject) {
    cache.set(cacheKey, project.url);
    return;
  }
  const shortUrl = `${
    development ? 'http://localhost:8080' : 'https://dsgnr.news'
  }/b/${shortId}`;

  const buttons = [
    {
      text: 'Open project',
      url: project.url,
    },
  ];

  // TODO: add timeago

  const score = '(Score: ${project.stats.appreciations}+) ';
  let message = `<b>${project.name}</b> ${
    ignoreLimit ? '' : score
  }#Behance\n\n`;
  message += `<b>Link:</b> ${shortUrl}\n`;

  console.log('sending', project.id);

  const result = await sendPhoto(
    TELEGRAM_CHANNEL,
    project.covers.original,
    message,
    { inline_keyboard: [buttons] }
  );

  console.log('Telegram response:', result);

  let telegramMessageId;

  if (result?.ok) {
    telegramMessageId = result.result.message_id;
    // TODO: in python version we actually ignored telegram errors to prevent double postings
    await prisma.behanceProject.create({
      data: {
        id: project.id,
        title: project.name,
        url: project.url,
        score: project.stats.appreciations,
        shortUrl,
        message,
        telegramMessageId,
      },
    });
    cache.set(cacheKey, project.url);
  }
}

export async function behanceCron() {
  const behanceProjects = await projects();
  if (!behanceProjects?.projects) return;
  const projectsList = behanceProjects.projects;
  console.log(
    'checking projects:',
    projectsList.map((project) => project.id)
  );
  await Promise.all(projectsList.map((project) => addBehanceProject(project)));
}

export async function getBehanceProjectUrl(id: number): Promise<string | null> {
  const cacheKey = `b/${id}`;
  const cached = cache.get(cacheKey) as string;
  if (cached) return cached;

  const project = await prisma.behanceProject.findUnique({ where: { id } });
  if (project) {
    cache.set(cacheKey, project.url);
    return project.url;
  }
  return null;
}
