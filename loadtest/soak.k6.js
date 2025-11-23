// k6 Soak Test Script for Pythoughts API
// Tests system stability over extended period
// Run: k6 run --vus 50 --duration 2h loadtest/soak.k6.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const memoryUsage = new Gauge('api_memory_usage');
const responseTime = new Trend('response_time', true);
const requestsPerSecond = new Counter('requests_per_second');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2h',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.02'],
  },
};

// Monitor API health metrics
function checkHealth() {
  const res = http.get(`${BASE_URL}/health`);

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      if (body.memory) {
        memoryUsage.add(body.memory.percentage);
      }
    } catch {
      // Ignore
    }
  }

  return res.status === 200;
}

export default function () {
  const iteration = __ITER;

  // Check health every 100 iterations
  if (iteration % 100 === 0) {
    group('Health Monitoring', () => {
      const healthy = checkHealth();
      check(null, {
        'API is healthy': () => healthy,
      });
    });
  }

  // Standard read operations (80% of traffic)
  group('Read Operations', () => {
    // Feed
    let res = http.get(`${BASE_URL}/api/feed?page=${Math.floor(Math.random() * 10) + 1}&limit=10`);
    responseTime.add(res.timings.duration);
    requestsPerSecond.add(1);
    check(res, { 'feed ok': (r) => r.status === 200 });
    errorRate.add(res.status >= 400);

    sleep(0.2);

    // Tags
    res = http.get(`${BASE_URL}/api/tags/trending`);
    responseTime.add(res.timings.duration);
    requestsPerSecond.add(1);
    check(res, { 'tags ok': (r) => r.status === 200 });
    errorRate.add(res.status >= 400);

    sleep(0.2);

    // Search (random terms)
    const terms = ['javascript', 'python', 'tutorial', 'api', 'web', 'react', 'node'];
    const term = terms[Math.floor(Math.random() * terms.length)];
    res = http.get(`${BASE_URL}/api/search?q=${term}`);
    responseTime.add(res.timings.duration);
    requestsPerSecond.add(1);
    check(res, { 'search ok': (r) => r.status === 200 });
    errorRate.add(res.status >= 400);
  });

  sleep(Math.random() * 2 + 0.5);
}

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error('API not healthy at start of soak test');
  }
  console.log('Starting soak test...');
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000 / 60;
  console.log(`Soak test completed after ${duration.toFixed(2)} minutes`);

  // Final health check
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    console.error('WARNING: API not healthy at end of soak test!');
  }
}
