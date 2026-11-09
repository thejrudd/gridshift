// Cloudflare Worker that sits in front of the GridShift tunnel hostname.
// Requests pass straight through to the origin. When the tunnel is down
// (530 / error 1033) or cloudflared cannot reach the app (502/503/504),
// page loads get the GridShift down page instead of Cloudflare's error page.
// API and asset requests keep a machine-readable response.

import { DOWN_PAGE_HTML } from './downPage.js'

export const DOWN_STATUSES = new Set([502, 503, 504, 530])

export function isPageRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/api/')) return false
  if (request.headers.get('sec-fetch-mode') === 'navigate') return true
  return (request.headers.get('accept') || '').includes('text/html')
}

function downPageResponse(request) {
  return new Response(request.method === 'HEAD' ? null : DOWN_PAGE_HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '60',
    },
  })
}

function unavailableResponse() {
  return new Response(JSON.stringify({ error: 'unavailable' }), {
    status: 503,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'retry-after': '60',
    },
  })
}

export async function handleRequest(request, fetchOrigin = fetch) {
  let response = null
  try {
    response = await fetchOrigin(request)
  } catch {
    response = null
  }

  if (response && !DOWN_STATUSES.has(response.status)) return response
  if (isPageRequest(request)) return downPageResponse(request)
  return response ?? unavailableResponse()
}

export default {
  fetch(request) {
    return handleRequest(request)
  },
}
