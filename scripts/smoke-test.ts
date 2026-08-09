import http from 'http';
import https from 'https';

const TARGET_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface TestEndpoint {
  name: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  expectedStatus: number | number[];
}

const ENDPOINTS_TO_TEST: TestEndpoint[] = [
  { name: 'API Health Check', path: '/api/health', method: 'GET', expectedStatus: 200 },
  { name: 'Fetch Coupons', path: '/api/coupons', method: 'GET', expectedStatus: [200, 401, 403] },
  { name: 'Validate Coupon', path: '/api/coupons/validate', method: 'POST', body: { couponCode: 'WELCOME20', eventId: 'evt_001', totalAmount: 1000 }, expectedStatus: 200 },
  { name: 'Create Coupon (Admin Auth Check)', path: '/api/coupons/create', method: 'POST', body: { code: 'TEST_SMOKE', type: 'percentage', value: 10, validUntil: '2028-12-31', isActive: true }, expectedStatus: [200, 401, 403] },
  { name: 'Admin Fetch Reviews (Admin Auth Check)', path: '/api/admin/reviews', method: 'GET', expectedStatus: [200, 401, 403] },
  { name: 'Fetch Event Reviews', path: '/api/events/evt_001/reviews', method: 'GET', expectedStatus: 200 },
  { name: 'Toggle Review Visibility', path: '/api/admin/reviews/toggle-visibility', method: 'POST', body: { reviewId: 'rev_101' }, expectedStatus: [200, 401, 403] },
  { name: 'Delete Review (DELETE method)', path: '/api/admin/reviews/rev_test_smoke', method: 'DELETE', expectedStatus: [200, 401, 403] },
  { name: 'Delete Review (POST fallback method)', path: '/api/admin/reviews/delete', method: 'POST', body: { reviewId: 'rev_test_smoke' }, expectedStatus: [200, 401, 403, 404] },
  { name: 'Fetch Organizers List', path: '/api/organizers', method: 'GET', expectedStatus: [200, 401, 403] },
  { name: 'Register Organizer', path: '/api/organizers/register', method: 'POST', body: { userId: 'usr_smoke_1', name: 'Smoke Tester', email: 'smoke@test.com', organizationName: 'Smoke Events', phone: '1234567890' }, expectedStatus: 200 },
  { name: 'Organizer Status (GET)', path: '/api/organizers/status', method: 'GET', expectedStatus: [200, 401, 403] },
  { name: 'Organizer Status (POST)', path: '/api/organizers/status', method: 'POST', body: { organizerId: 'org_demo_1', status: 'approved' }, expectedStatus: [200, 401, 403] },
  { name: 'Auth Verify Endpoint', path: '/api/auth/verify', method: 'POST', body: {}, expectedStatus: [401, 403, 200] },
];

async function makeRequest(test: TestEndpoint): Promise<{ status: number; ok: boolean; body: string }> {
  const url = new URL(test.path, TARGET_URL);
  const client = url.protocol === 'https:' ? https : http;

  const requestData = test.body ? JSON.stringify(test.body) : undefined;
  const headers = {
    'Content-Type': 'application/json',
    ...(requestData ? { 'Content-Length': Buffer.byteLength(requestData) } : {}),
    ...(test.headers || {})
  };

  return new Promise((resolve, reject) => {
    const req = client.request(url, { method: test.method, headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const allowedStatuses = Array.isArray(test.expectedStatus) ? test.expectedStatus : [test.expectedStatus];
        resolve({
          status: res.statusCode || 0,
          ok: allowedStatuses.includes(res.statusCode || 0),
          body
        });
      });
    });

    req.on('error', reject);
    if (requestData) req.write(requestData);
    req.end();
  });
}

async function runSmokeTests() {
  console.log(`====================================================`);
  console.log(`🚀 RUNNING POST-DEPLOY API SMOKE TESTS ON ${TARGET_URL}`);
  console.log(`====================================================\n`);

  let passed = 0;
  let failed = 0;

  for (const test of ENDPOINTS_TO_TEST) {
    try {
      const result = await makeRequest(test);
      if (result.ok) {
        console.log(`✅ [PASS] ${test.method} ${test.path} - Status: ${result.status}`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${test.method} ${test.path} - Received Status: ${result.status}, Expected: ${JSON.stringify(test.expectedStatus)}`);
        console.error(`   Body: ${result.body.slice(0, 150)}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`❌ [ERROR] ${test.method} ${test.path} - ${err.message}`);
      failed++;
    }
  }

  console.log(`\n====================================================`);
  console.log(`📊 SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests();
