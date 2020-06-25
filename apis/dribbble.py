import os
import json
import logging

from urllib import urlencode
from google.appengine.api import urlfetch

BASE_URL = 'https://dribbble-top.herokuapp.com/{method}'

def call_method(method):
  result = urlfetch.fetch(BASE_URL.format(method=method),
                          deadline=15)
  if result.status_code == 200:
    return json.loads(result.content)
  logging.warning('Dribbble error code: {}'.format(result.status_code))
  return None


def dribbble_top():
  return call_method('top')
