# designernewsbot
Telegram bot that posts new hot stories from Designer News to [telegram channel](https://telegram.me/designer_news)

## Backend
Bot runs on [Google App Engine](https://cloud.google.com/appengine/)

## Designer News API
Bot uses [Designer News API](https://github.com/DesignerNews/dn_api_v2)

It loads [top stories](https://www.designernews.co/api/v2/stories) every 10 minutes and posts any story that reached *10+* score

## Behance API
Bot uses [Behance API](https://www.behance.net/dev)

## Telegram API
Bot uses [Telegram Bot API](https://core.telegram.org/bots/api) to post messages to the [telegram channel](https://telegram.me/designer_news) with [sendMessage](https://core.telegram.org/bots/api#sendmessage) request

## URL shortening
Bot uses internal shortener

## How to run your own `designernewsbot`
- Clone this project
- Run `pip install -r requirements.txt -t lib/` to install dependencies
- Download and install [Google Cloud SDK](https://cloud.google.com/appengine/docs/standard/python/download)
- Register your app in [Google Cloud console](https://console.cloud.google.com)
- Register your bot via [BotFather](https://telegram.me/BotFather)
- Rename `sample_app.yaml` to `app.yaml` and
  - replace `yourappid` with your App engine app id
  - replace `YOUR_TELEGRAM_BOT_TOKEN` with your bot token
  - replace `YOUR_BEHANCE_TOKEN` with your behance token
- Possibly you'll want to create your own channel and your bot as an admin. Also change `@designer_news` in `database.py` to your channel id
- Run `gcloud app deploy app.yaml --project [YOUR_PROJECT_NAME]` in the project folder
- Run `gcloud app deploy cron.yaml --project [YOUR_PROJECT_NAME]` in the project folder

## Local development
To run server locally you can use [`dev_appserver.py`](https://cloud.google.com/appengine/docs/standard/python/tools/using-local-server):

```
dev_appserver.py .
```


## See also
- [hackernewsbot](https://github.com/phil-r/hackernewsbot)
- [asciifacesbot](https://github.com/phil-r/asciifacesbot)
