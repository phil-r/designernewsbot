# designernewsbot

Telegram bot that posts new hot stories from Designer News to [telegram channel](https://telegram.me/designer_news)

## Backend

Bot runs on a small [Hetzner cloud](https://hetzner.cloud/?ref=gy7R6jM4nx5J) machine

[Old version](https://github.com/phil-r/designernewsbot/tree/old-python-version) of this bot was written in python and was running on [Google App Engine](https://cloud.google.com/appengine/)

## Designer News API

Bot uses [Designer News API](https://github.com/DesignerNews/dn_api_v2)

It loads [top stories](https://www.designernews.co/api/v2/stories) every minute and posts any story that reached _10+_ score

## Behance API

Bot uses [Behance API](https://www.behance.net/dev)

## Dribbble API

Bot uses [Unofficial Dribble API](https://github.com/phil-r/dribbble-top)

## Telegram API

Bot uses [Telegram Bot API](https://core.telegram.org/bots/api) to post messages to the [telegram channel](https://telegram.me/designer_news) with [sendMessage](https://core.telegram.org/bots/api#sendmessage) request

## URL shortening

Bot uses internal shortener

## How to run your own `designernewsbot`

- Clone this project
- Run `yarn` to install dependencies
- Run `yarn migrate:dev` to create a databse and apply migrations
- Register your bot via [BotFather](https://telegram.me/BotFather)
- Rename `.env.example` to `.env` and
  - replace `YOUR_TELEGRAM_BOT_TOKEN` with your bot token
  - replace `YOUR_BEHANCE_TOKEN` with your behance token
- Possibly you'll want to create your own channel and your bot as an admin. Also change `@designer_news` in `src/helpers.ts` to your channel id

## Local development

To run server locally you can run `yarn dev`

## See also

- [hackernewsbot](https://github.com/phil-r/hackernewsbot)
- [asciifacesbot](https://github.com/phil-r/asciifacesbot)
