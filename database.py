import logging
import shortener
import timeago
import datetime

from google.appengine.ext import ndb
from google.appengine.api import memcache

from helper import development
from apis.telegram import send_message


class StoryPost(ndb.Model):
  title = ndb.StringProperty()
  text = ndb.TextProperty()
  message = ndb.TextProperty()
  url = ndb.TextProperty()
  short_url = ndb.TextProperty(indexed=False)
  short_dn_url = ndb.TextProperty(indexed=False)
  score = ndb.IntegerProperty(indexed=False)
  telegram_message_id = ndb.IntegerProperty()

  created = ndb.DateTimeProperty(auto_now_add=True)

  def add_memcache(self):
    memcache.set(self.key.id(), self.url)

  @classmethod
  def add(cls, story):
    story_id = story.get('id')
    story_id_int = int(story_id)
    short_id = shortener.encode(story_id_int)
    dn_url = "https://www.designernews.co/stories/{}".format(story_id)
    story_url = story.get('url')
    # TODO: handle sponsored?

    # Check memcache and databse, maybe this story was already sent
    if memcache.get(story_id):
      logging.info('STOP: {} in memcache'.format(story_id))
      return
    post = ndb.Key(cls, story_id).get()
    if post:
      logging.info('STOP: {} in DB'.format(story_id))
      post.add_memcache()
      return
    logging.info('SEND: {}'.format(story_id))

    story['title'] = story.get('title').encode('utf-8')
    comments_count = story.get('comment_count', 0)
    buttons = []

    if development():
      short_dn_url = 'http://localhost:8080/c/{}'.format(short_id)
    else:
      short_dn_url = 'https://dsgnr.news/c/{}'.format(short_id)

    if story_url:
      if development():
        short_url = 'http://localhost:8080/s/{}'.format(short_id)
      else:
        short_url = 'https://dsgnr.news/s/{}'.format(short_id)
      buttons.append({
          'text': 'Read',
          'url': story_url
      })
    else:
      short_url = short_dn_url
      story['url'] = dn_url

    buttons.append({
        'text': '{}+ Comments'.format(comments_count),
        'url': dn_url
    })

    # Get the difference between published date and when target score was reached
    now = datetime.datetime.now()
    published = datetime.datetime.strptime(story.get('created_at'), '%Y-%m-%dT%H:%M:%SZ')
    ago = timeago.format(now, published)

    # Add title
    message = '<b>{title}</b> (Score: {vote_count}+ {ago})\n\n'.format(ago=ago, **story)

    # Add link
    message += '<b>Link:</b> {}\n'.format(short_url)

    # Add comments Link(don't add it for `Ask dn`, etc)
    if story_url:
      message += '<b>Comments:</b> {}\n'.format(short_dn_url)

    # Add text
    text = story.get('comment')
    if text:
      text = text.replace('<p>', '\n').replace('&#x27;', "'") \
                 .replace('&#x2F;', '/').encode('utf-8')
      message += "\n{}\n".format(text)

    # Send to the telegram channel
    if development():
      result = send_message('@designer_news_st', message,
                            {'inline_keyboard': [buttons]})
    else:
      result = send_message('@designer_news', message,
                            {'inline_keyboard': [buttons]})

    logging.info('Telegram response: {}'.format(result))

    telegram_message_id = None
    if result and result.get('ok'):
      telegram_message_id = result.get('result').get('message_id')
    post = cls(id=story_id, title=story.get('title'), url=story.get('url'),
        score=story.get('vote_count'), text=story.get('comment'),
        short_url=short_url, short_dn_url=short_dn_url,
        message=message, telegram_message_id=telegram_message_id)
    post.put()
    post.add_memcache()
