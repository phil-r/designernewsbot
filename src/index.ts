import 'dotenv/config';
import express from 'express';
import { projects } from './apis/behance';

import { getBehanceProjectUrl } from './services/behance';
import { getDNStoryCommentsUrl, getDNStoryUrl } from './services/dn';
import { getDribbleShotUrl } from './services/dribbble';
import { decode } from './shortener';

const app = express();

app.use(express.json());

const defaultRouter = express.Router();

defaultRouter.use('/', express.static('static'));

defaultRouter.get('/yo', async (req, res) => {
  res.send('yo');
});

defaultRouter.get('/s/:shortId', async (req, res) => {
  const storyId = decode(req.params.shortId);
  if (Number.isNaN(storyId)) {
    res.status(400).send('Malformed request');
    return;
  }
  const redirectUrl = await getDNStoryUrl(storyId);
  if (redirectUrl) {
    res.redirect(redirectUrl);
    return;
  }
  res
    .setHeader('Retry-After', 5)
    .status(503)
    .send('<h1>Service Unavailable</h1><p>Try again later</p>');
});

defaultRouter.get('/c/:shortId', async (req, res) => {
  const storyId = decode(req.params.shortId);
  if (Number.isNaN(storyId)) {
    res.status(400).send('Malformed request');
    return;
  }
  res.redirect(getDNStoryCommentsUrl(storyId));
});

defaultRouter.get('/b/:shortId', async (req, res) => {
  const projectId = decode(req.params.shortId);
  if (Number.isNaN(projectId)) {
    res.status(400).send('Malformed request');
    return;
  }
  const redirectUrl = await getBehanceProjectUrl(projectId);
  if (redirectUrl) {
    res.redirect(redirectUrl);
    return;
  }
  res
    .setHeader('Retry-After', 5)
    .status(503)
    .send('<h1>Service Unavailable</h1><p>Try again later</p>');
});

defaultRouter.get('/d/:shortId', async (req, res) => {
  const shotId = decode(req.params.shortId);
  if (Number.isNaN(shotId)) {
    res.status(400).send('Malformed request');
    return;
  }
  const redirectUrl = await getDribbleShotUrl(shotId);
  if (redirectUrl) {
    res.redirect(redirectUrl);
    return;
  }
  res
    .setHeader('Retry-After', 5)
    .status(503)
    .send('<h1>Service Unavailable</h1><p>Try again later</p>');
});

defaultRouter.all('/status', (req, res) => {
  res.send('ok');
});

app.use('/', defaultRouter);

const port = process.env.PORT || 8080;

const server = app.listen(port, () =>
  console.log(`
🚀 Server ready at: http://localhost:${port}`)
);
