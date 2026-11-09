import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../../cloudflare/down-page-worker/src/index.js'

const pageRequest = (path = '/', method = 'GET') =>
  new Request(`https://gridshift.test${path}`, {
    method,
    headers: { accept: 'text/html,application/xhtml+xml', 'sec-fetch-mode': 'navigate' },
  })

const apiRequest = (path = '/api/fantasy/rankings') =>
  new Request(`https://gridshift.test${path}`, { headers: { accept: '*/*' } })

const originReturns = (status, body = 'origin') => async () => new Response(body, { status })
const originThrows = async () => { throw new Error('connection refused') }

test('passes healthy origin responses through untouched', async () => {
  const res = await handleRequest(pageRequest(), originReturns(200, 'app'))
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'app')
})

test('passes ordinary origin errors through', async () => {
  const res = await handleRequest(pageRequest('/nope'), originReturns(404))
  assert.equal(res.status, 404)
})

for (const status of [502, 503, 504, 530]) {
  test(`serves the down page for a page load when the origin returns ${status}`, async () => {
    const res = await handleRequest(pageRequest('/matchups'), originReturns(status))
    assert.equal(res.status, 503)
    assert.match(res.headers.get('content-type'), /text\/html/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.match(await res.text(), /GridShift is down/)
  })
}

test('serves the down page when the origin fetch throws', async () => {
  const res = await handleRequest(pageRequest(), originThrows)
  assert.equal(res.status, 503)
  assert.match(await res.text(), /GridShift is down/)
})

test('HEAD page requests get the down status without a body', async () => {
  const res = await handleRequest(pageRequest('/', 'HEAD'), originReturns(530))
  assert.equal(res.status, 503)
  assert.equal(await res.text(), '')
})

test('API requests keep the origin error response', async () => {
  const res = await handleRequest(apiRequest(), originReturns(502, 'bad gateway'))
  assert.equal(res.status, 502)
  assert.equal(await res.text(), 'bad gateway')
})

test('API navigations never get the HTML page', async () => {
  const res = await handleRequest(pageRequest('/api/live/status'), originReturns(530))
  assert.equal(res.status, 530)
})

test('API requests get a JSON 503 when the origin fetch throws', async () => {
  const res = await handleRequest(apiRequest(), originThrows)
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: 'unavailable' })
})
