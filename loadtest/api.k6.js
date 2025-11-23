// k6 Load Test Script for Pythoughts API
// Run: k6 run --vus 50 --duration 5m loadtest/api.k6.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const articlesCreated = new Counter('articles_created');
const commentsCreated = new Counter('comments_created');
const apiLatency = new Trend('api_latency', true);

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Test scenarios
export const options = {
  scenarios: {
    // Smoke test
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '1m',
      startTime: '0s',
      tags: { test_type: 'smoke' },
    },
    // Load test - ramp up
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { test_type: 'load' },
    },
    // Stress test
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '5m', target: 300 },
        { duration: '5m', target: 0 },
      ],
      startTime: '17m',
      tags: { test_type: 'stress' },
    },
    // Spike test
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 },
        { duration: '1m', target: 500 },
        { duration: '10s', target: 0 },
      ],
      startTime: '36m',
      tags: { test_type: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
  },
};

// Request headers
function getHeaders(authenticated = false) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (authenticated && AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

// Helper to make requests and track metrics
function makeRequest(method, url, body = null, authenticated = false) {
  const params = { headers: getHeaders(authenticated) };
  const startTime = Date.now();

  let response;
  switch (method.toUpperCase()) {
    case 'GET':
      response = http.get(url, params);
      break;
    case 'POST':
      response = http.post(url, body ? JSON.stringify(body) : null, params);
      break;
    case 'PUT':
      response = http.put(url, body ? JSON.stringify(body) : null, params);
      break;
    case 'DELETE':
      response = http.del(url, null, params);
      break;
    default:
      response = http.get(url, params);
  }

  const duration = Date.now() - startTime;
  apiLatency.add(duration);
  errorRate.add(response.status >= 400);

  return response;
}

// Test scenarios
export default function () {
  // Health check
  group('Health Endpoints', () => {
    const healthRes = makeRequest('GET', `${BASE_URL}/health`);
    check(healthRes, {
      'health check status 200': (r) => r.status === 200,
      'health check is healthy': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch {
          return false;
        }
      },
    });

    const readyRes = makeRequest('GET', `${BASE_URL}/health/ready`);
    check(readyRes, {
      'readiness check status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // Public endpoints
  group('Public Feed', () => {
    // Get feed
    const feedRes = makeRequest('GET', `${BASE_URL}/api/feed?page=1&limit=10`);
    check(feedRes, {
      'feed status 200': (r) => r.status === 200,
      'feed has articles': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.articles);
        } catch {
          return false;
        }
      },
    });

    // Get featured articles
    const featuredRes = makeRequest('GET', `${BASE_URL}/api/articles/featured`);
    check(featuredRes, {
      'featured status 200': (r) => r.status === 200,
    });

    // Get trending tags
    const tagsRes = makeRequest('GET', `${BASE_URL}/api/tags/trending`);
    check(tagsRes, {
      'tags status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // Search
  group('Search', () => {
    const searchTerms = ['javascript', 'react', 'nodejs', 'api', 'tutorial'];
    const term = randomItem(searchTerms);

    const searchRes = makeRequest('GET', `${BASE_URL}/api/search?q=${term}&limit=10`);
    check(searchRes, {
      'search status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // Article detail
  group('Article Detail', () => {
    // First get the feed to find an article ID
    const feedRes = makeRequest('GET', `${BASE_URL}/api/feed?limit=5`);

    if (feedRes.status === 200) {
      try {
        const body = JSON.parse(feedRes.body);
        if (body.articles && body.articles.length > 0) {
          const articleSlug = body.articles[0].slug;

          // Get article detail
          const articleRes = makeRequest('GET', `${BASE_URL}/api/articles/${articleSlug}`);
          check(articleRes, {
            'article detail status 200': (r) => r.status === 200,
          });

          // Get article comments
          const commentsRes = makeRequest('GET', `${BASE_URL}/api/articles/${articleSlug}/comments`);
          check(commentsRes, {
            'comments status 200': (r) => r.status === 200,
          });
        }
      } catch {
        // Ignore parsing errors
      }
    }
  });

  sleep(0.5);

  // User profile
  group('User Profiles', () => {
    const profileRes = makeRequest('GET', `${BASE_URL}/api/users/testuser`);
    // 200 or 404 are both valid
    check(profileRes, {
      'profile status valid': (r) => r.status === 200 || r.status === 404,
    });
  });

  sleep(1);

  // Authenticated actions (if token provided)
  if (AUTH_TOKEN) {
    group('Authenticated Actions', () => {
      // Get notifications
      const notifRes = makeRequest('GET', `${BASE_URL}/api/notifications`, null, true);
      check(notifRes, {
        'notifications status 200': (r) => r.status === 200,
      });

      // Get user feed
      const userFeedRes = makeRequest('GET', `${BASE_URL}/api/feed/following`, null, true);
      check(userFeedRes, {
        'user feed status 200': (r) => r.status === 200,
      });

      // Create draft (occasionally)
      if (Math.random() < 0.1) {
        const draft = {
          title: `Load Test Draft ${randomString(8)}`,
          content: 'This is a test draft created during load testing.',
          tags: ['test', 'loadtest'],
        };

        const draftRes = makeRequest('POST', `${BASE_URL}/api/drafts`, draft, true);
        check(draftRes, {
          'draft creation status 201': (r) => r.status === 201,
        });

        if (draftRes.status === 201) {
          articlesCreated.add(1);
        }
      }
    });
  }

  sleep(Math.random() * 2 + 1); // Random sleep between 1-3 seconds
}

// Setup function
export function setup() {
  // Verify the API is accessible
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`API not accessible: ${res.status}`);
  }

  console.log(`Load test starting against ${BASE_URL}`);
  return { startTime: Date.now() };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)} seconds`);
}

// Custom summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'loadtest/results/summary.json': JSON.stringify(data, null, 2),
    'loadtest/results/summary.html': htmlReport(data),
  };
}

// Simple text summary
function textSummary(data, options = {}) {
  const { indent = '', enableColors = false } = options;

  let output = `${indent}=== LOAD TEST SUMMARY ===\n\n`;

  // HTTP metrics
  if (data.metrics.http_req_duration) {
    const duration = data.metrics.http_req_duration;
    output += `${indent}HTTP Request Duration:\n`;
    output += `${indent}  avg: ${duration.values.avg.toFixed(2)}ms\n`;
    output += `${indent}  min: ${duration.values.min.toFixed(2)}ms\n`;
    output += `${indent}  max: ${duration.values.max.toFixed(2)}ms\n`;
    output += `${indent}  p(95): ${duration.values['p(95)'].toFixed(2)}ms\n`;
    output += `${indent}  p(99): ${duration.values['p(99)'].toFixed(2)}ms\n`;
  }

  if (data.metrics.http_reqs) {
    output += `\n${indent}Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    output += `${indent}Requests/sec: ${data.metrics.http_reqs.values.rate.toFixed(2)}\n`;
  }

  if (data.metrics.http_req_failed) {
    const failRate = data.metrics.http_req_failed.values.rate * 100;
    output += `${indent}Failed Requests: ${failRate.toFixed(2)}%\n`;
  }

  // Custom metrics
  if (data.metrics.errors) {
    const errorPct = data.metrics.errors.values.rate * 100;
    output += `\n${indent}Error Rate: ${errorPct.toFixed(2)}%\n`;
  }

  if (data.metrics.articles_created) {
    output += `${indent}Articles Created: ${data.metrics.articles_created.values.count}\n`;
  }

  // Thresholds
  output += `\n${indent}=== THRESHOLDS ===\n`;
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? '✓ PASS' : '✗ FAIL';
    output += `${indent}${name}: ${status}\n`;
  }

  return output;
}

// Simple HTML report
function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Load Test Results - Pythoughts API</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .pass { color: green; }
    .fail { color: red; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #333; color: white; }
  </style>
</head>
<body>
  <h1>Load Test Results - Pythoughts API</h1>
  <p>Test completed at: ${new Date().toISOString()}</p>

  <h2>HTTP Request Metrics</h2>
  <div class="metric">
    <strong>Duration:</strong>
    avg: ${data.metrics.http_req_duration?.values.avg.toFixed(2) || 'N/A'}ms,
    p95: ${data.metrics.http_req_duration?.values['p(95)'].toFixed(2) || 'N/A'}ms,
    p99: ${data.metrics.http_req_duration?.values['p(99)'].toFixed(2) || 'N/A'}ms
  </div>
  <div class="metric">
    <strong>Requests:</strong>
    Total: ${data.metrics.http_reqs?.values.count || 0},
    Rate: ${data.metrics.http_reqs?.values.rate.toFixed(2) || 0}/s
  </div>
  <div class="metric">
    <strong>Failed:</strong>
    ${((data.metrics.http_req_failed?.values.rate || 0) * 100).toFixed(2)}%
  </div>

  <h2>Thresholds</h2>
  <table>
    <tr><th>Threshold</th><th>Status</th></tr>
    ${Object.entries(data.thresholds || {}).map(([name, t]) =>
      `<tr><td>${name}</td><td class="${t.ok ? 'pass' : 'fail'}">${t.ok ? 'PASS' : 'FAIL'}</td></tr>`
    ).join('')}
  </table>
</body>
</html>
  `;
}
