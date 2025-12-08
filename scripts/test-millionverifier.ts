/**
 * Test MillionVerifier Integration
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

const MILLIONVERIFIER_API_KEY = process.env.MILLIONVERIFIER_API_KEY;

async function testMillionVerifier() {
  console.log('Testing MillionVerifier integration...\n');

  if (!MILLIONVERIFIER_API_KEY) {
    console.error('MILLIONVERIFIER_API_KEY not set!');
    process.exit(1);
  }

  console.log(`API Key: ${MILLIONVERIFIER_API_KEY.slice(0, 8)}...`);

  // Test emails
  const testEmails = [
    'test@gmail.com',           // Should be valid (free email)
    'info@marriott.com',        // Should be valid but role-based
    'fakeemail12345@gmail.com', // Should be invalid
    'edd@jengu.ai',             // Valid personal email
  ];

  for (const email of testEmails) {
    console.log(`\nVerifying: ${email}`);

    try {
      const params = new URLSearchParams({
        api: MILLIONVERIFIER_API_KEY,
        email,
        timeout: '10',
      });

      const response = await fetch(
        `https://api.millionverifier.com/api/v3/?${params}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        console.error(`  HTTP Error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log(`  Result: ${data.result} (code: ${data.resultcode})`);
      console.log(`  Sub-result: ${data.subresult}`);
      console.log(`  Free: ${data.free}, Role: ${data.role}`);
      console.log(`  Credits remaining: ${data.credits}`);
    } catch (error) {
      console.error(`  Error: ${error}`);
    }
  }

  console.log('\n✓ Test complete!');
}

testMillionVerifier().catch(console.error);
