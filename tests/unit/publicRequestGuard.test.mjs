import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createPublicRequestGuard } from '../../server/publicRequestGuard.js';

function createResponse() {
  const response = new EventEmitter();
  response.headers = {};
  response.statusCode = 200;
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.set = (name, value) => {
    response.headers[name] = value;
    return response;
  };
  response.json = (payload) => {
    response.payload = payload;
    return response;
  };
  return response;
}

test('public Scores guard applies a bounded per-IP request bucket', () => {
  const guard = createPublicRequestGuard({ maxRequests: 2, maxConcurrent: 10, now: () => 1_000 });
  const invoke = () => {
    const response = createResponse();
    let called = false;
    guard({ ip: '203.0.113.7' }, response, () => {
      called = true;
      response.emit('finish');
    });
    return { response, called };
  };

  assert.equal(invoke().called, true);
  assert.equal(invoke().called, true);
  const blocked = invoke();
  assert.equal(blocked.called, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.response.headers['Retry-After'], '60');
});

test('public Scores guard caps concurrent work and releases slots on completion', () => {
  const guard = createPublicRequestGuard({ maxRequests: 10, maxConcurrent: 1, now: () => 1_000 });
  const firstResponse = createResponse();
  let firstCalled = false;
  guard({ ip: '203.0.113.8' }, firstResponse, () => { firstCalled = true; });

  const blockedResponse = createResponse();
  let blockedCalled = false;
  guard({ ip: '203.0.113.9' }, blockedResponse, () => { blockedCalled = true; });
  assert.equal(firstCalled, true);
  assert.equal(blockedCalled, false);
  assert.equal(blockedResponse.statusCode, 503);

  firstResponse.emit('close');
  const releasedResponse = createResponse();
  let releasedCalled = false;
  guard({ ip: '203.0.113.9' }, releasedResponse, () => {
    releasedCalled = true;
    releasedResponse.emit('finish');
  });
  assert.equal(releasedCalled, true);
});
