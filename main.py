import json
import logging
import shortener

from google.appengine.api import urlfetch, memcache
from google.appengine.ext import deferred, ndb

from flask import Flask, redirect, abort, make_response, jsonify
from apis.dn import stories
from apis.behance import projects
from database import StoryPost, BehanceProject

app = Flask(__name__)


@app.route('/yo')
def yo():
  # TODO: remove
  # return jsonify(stories())
  # return jsonify(projects())
  # behance_cron()
  return 'yo'


@app.route('/s/<short_id>')
def story_redirect(short_id):
  """Redirect to story url"""
  try:
    story_id = str(shortener.decode(short_id))
  except:
    return abort(400)
  redirect_url = memcache.get(story_id)
  if not redirect_url:
    story = ndb.Key(StoryPost, story_id).get()
    if not story:
      return make_response('<h1>Service Unavailable</h1><p>Try again later</p>', 503, {'Retry-After': 5})
    story.add_memcache()
    redirect_url = story.url
  return redirect(redirect_url)

@app.route('/b/<short_id>')
def behance_redirect(short_id):
  """Redirect to behance project url"""
  try:
    project_id = str(shortener.decode(short_id))
  except:
    return abort(400)
  redirect_url = memcache.get('b/{}'.format(project_id))
  if not redirect_url:
    project = ndb.Key(BehanceProject, project_id).get()
    if not project:
      return make_response('<h1>Service Unavailable</h1><p>Try again later</p>', 503, {'Retry-After': 5})
    project.add_memcache()
    redirect_url = project.url
  return redirect(redirect_url)

@app.route('/c/<short_id>')
def comments_redirect(short_id):
  """Redirect to comments url"""
  try:
    story_id = str(shortener.decode(short_id))
  except:
    return abort(400)
  dn_url = "https://www.designernews.co/stories/{}".format(story_id)
  return redirect(dn_url)

def dn_cron():
  stories_response = stories()
  if not stories_response:
    return
  stories_list = stories_response.get('stories')
  ids = set(story.get('id') for story in stories_list)
  logging.info('checking stories: {}'.format(ids))
  cached_stories = set(memcache.get_multi(ids).keys())
  logging.info('cached stories: {}'.format(cached_stories))
  for story in stories_list:
    if story.get('id') in cached_stories:
      continue
    if story.get('sponsored'):
      continue
    if story and story.get('vote_count') >= 10:
      StoryPost.add(story)
    elif story:
      logging.info('STOP: {id} has low vote_count ({vote_count})'.format(**story))
    else: # TODO: can this happen?
      logging.info('STOP: story was probably deleted/flagged')

def behance_cron():
  projects_response = projects(time='week', sort='appreciations')
  if not projects_response:
    return
  projects_list = projects_response.get('projects')
  ids = set('b/{}'.format(project.get('id')) for project in projects_list)
  logging.info('checking projects: {}'.format(ids))
  cached_projects = set(memcache.get_multi(ids).keys())
  logging.info('cached projects: {}'.format(cached_projects))
  for project in projects_list:
    if 'b/{}'.format(project.get('id')) in cached_projects:
      continue
    if project and project.get('stats').get('appreciations') >= 2000:
      logging.info('POST: {id}'.format(**project))
      BehanceProject.add(project)
    elif project:
      logging.info('STOP: {id} has low appreciations count'.format(**project))
    else: # TODO: can this happen?
      logging.info('STOP: project was probably deleted/flagged')

@app.route('/cron')
def cron():
  dn_cron()
  behance_cron()
  return 'OK'

@app.errorhandler(404)
def page_not_found(e):
  """Return a custom 404 error."""
  return 'Sorry, Nothing at this URL.', 404


@app.errorhandler(500)
def application_error(e):
  """Return a custom 500 error."""
  return 'Sorry, unexpected error: {}'.format(e), 500
