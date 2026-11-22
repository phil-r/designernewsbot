# designernewsbot

Telegram bot that posts projects from Behance and shots from Dribbble to [telegram channel](https://telegram.me/designer_news)

## Backend

Bot runs on a small [Hetzner cloud](https://hetzner.cloud/?ref=gy7R6jM4nx5J) machine

[Old version](https://github.com/phil-r/designernewsbot/tree/old-python-version) of this bot was written in python and was running on [Google App Engine](https://cloud.google.com/appengine/)

## Behance API

Bot uses [Behance API](https://www.behance.net/dev)

## Dribbble API

Bot uses [Unofficial Dribble API](https://github.com/phil-r/dribbble-top)

## Telegram API

The bot posts to the [Telegram channel](https://telegram.me/designer_news) with the [Telegram Bot API](https://core.telegram.org/bots/api), using photos, videos, or a link message if media is missing.

## URL shortening

Bot uses internal shortener

## How to run your own `designernewsbot`

- Clone this project
- Run `bun install` to install dependencies
- For a new install, run `bun run db:init prisma/dev.db` to create the database.
- Register your bot via [BotFather](https://telegram.me/BotFather)
- Rename `.env.example` to `.env` and
  - replace `YOUR_TELEGRAM_BOT_TOKEN` with your bot token
  - replace `YOUR_BEHANCE_TOKEN` with your behance token
- Possibly you'll want to create your own channel and your bot as an admin. Also change `@designer_news` in `src/helpers.ts` to your channel id

**Already running the bot without the photo wall?** Before starting the new version, stop the server, posting jobs, and imports. Back up your SQLite database and test this command on a copy before running it on the original:

```sh
bun --no-env-file scripts/gallery-schema.ts apply /path/to/database.db
```

Older bot versions cannot open the updated database.

## Local development

To run server locally you can run `bun run dev`

## Photo wall API

`GET /api/gallery` returns `{ items, nextCursor }`, newest first. Each item has `title`, `url`, `imageUrl`, and `source` (`behance` or `dribbble`). For the next page, pass the returned token as `?cursor=<opaque>` until `nextCursor` is `null`.

The gallery shows successfully posted items with a saved HTTPS preview. Items without one still resolve through their short links. The migration does not populate previews for existing posts.

An empty archive returns `{ items: [], nextCursor: null }`.

## See also

- [hackernewsbot](https://github.com/phil-r/hackernewsbot)
- [asciifacesbot](https://github.com/phil-r/asciifacesbot)
