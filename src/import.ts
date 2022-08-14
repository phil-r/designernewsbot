import 'dotenv/config'

import fso from 'fs';
import prisma from './prisma';

const fs = fso.promises;

const TYPES = ['BehanceProject', 'DribbbleShot', 'StoryPost'];

type ExportBehance = {
  "created": number;
  "title": string;
  "telegram_message_id": number;
  "message": string;
  "url": string;
  "short_url": string;
  "score": number;
}

type DribbbleExport = ExportBehance;

type DNExport = ExportBehance & {
  "short_dn_url": string;
  "text": string;
};

const main = async () => {
  const files = await fs.readdir('./hidden/export/dest/');
  // console.log(files);

  // files.forEach(async (file) => {
  await files.reduce(async (memo, file) => {
    await memo;
    const contents = await fs.readFile('./export/dest/' + file);

    const parsed = JSON.parse(contents.toString());
    console.log(Object.keys(parsed));
    const fileObjects = Object.keys(parsed);
    // fileObjects.forEach(async (objectType) => {
    await fileObjects.reduce(async (memo, objectType) => {
      await memo;
      const objects = parsed[objectType];
      if (objectType === 'BehanceProject') {
        //createMany is not supported by SQLite. ;( 
        //https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#createmany
        // prisma.behanceProject.createMany()
        await Object.keys(objects).reduce(async (memo, id) => {
          await memo;
          const o: ExportBehance = objects[id];
          const fields = {
            id: Number(id),
            title: o.title,
            message: o.message,
            url: o.url,
            score: o.score,
            shortUrl: o.short_url,
            createdAt: new Date(o.created),
            updatedAt: new Date(o.created),
            telegramMessageId: o.telegram_message_id
          }
          await prisma.behanceProject.upsert({
            where: {
              id: Number(id),
            },
            create: fields,
            update: fields
          })
          console.log('behance id', id);

        }, Promise.resolve());
      }

      if (objectType === 'DribbbleShot') {

        await Object.keys(objects).reduce(async (memo, id) => {
          await memo;
          const o: DribbbleExport = objects[id];
          const fields = {
            id: Number(id),
            title: o.title,
            message: o.message,
            url: o.url,
            score: o.score,
            shortUrl: o.short_url,
            createdAt: new Date(o.created),
            updatedAt: new Date(o.created),
            telegramMessageId: o.telegram_message_id
          }
          await prisma.dribbbleShot.upsert({
            where: {
              id: Number(id),
            },
            create: fields,
            update: fields
          })
          console.log('dribble id', id);

        }, Promise.resolve());
      }

      
      if (objectType === 'StoryPost') {

        await Object.keys(objects).reduce(async (memo, id) => {
          await memo;
          const o: DNExport = objects[id];
          const fields = {
            id: Number(id),
            title: o.title,
            message: o.message,
            url: o.url,
            score: o.score,
            shortUrl: o.short_url,
            createdAt: new Date(o.created),
            updatedAt: new Date(o.created),
            telegramMessageId: o.telegram_message_id,
            shortDnUrl : o.short_dn_url,
            text: o.text,
          }
          await prisma.designerNewsStory.upsert({
            where: {
              id: Number(id),
            },
            create: fields,
            update: fields
          })
          console.log('dn id', id);

        }, Promise.resolve());
      }
    }, Promise.resolve());
  }, Promise.resolve());
}

main();
