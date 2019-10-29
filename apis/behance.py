import os
import json

from urllib import urlencode
from google.appengine.api import urlfetch

BASE_URL = 'https://www.behance.net/v2/{method}?{query}'
TOKEN = os.environ['BEHANCE_TOKEN']


def call_method(method, query={}):
  query['api_key'] = TOKEN
  result = urlfetch.fetch(BASE_URL.format(method=method,
                          query=urlencode(query)),
                          deadline=10)
  if result.status_code == 200:
    return json.loads(result.content)
  return None


def projects(time='all', sort=''):
  return call_method('projects', {'time': time, 'sort': sort})
