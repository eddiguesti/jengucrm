const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const cleanLine = line.replace(/\r/g, '').trim();
  if (cleanLine && !cleanLine.startsWith('#')) {
    const [key, ...valueParts] = cleanLine.split('=');
    const value = valueParts.join('=');
    if (key && value) {
      process.env[key] = value;
    }
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestAndSend() {
  // Create test prospect (without job_pain_points since column may not exist)
  const { data: prospect, error } = await supabase.from('prospects').insert({
    name: 'Final Test Hotel',
    email: 'edd.guest@gmail.com',
    city: 'London',
    country: 'UK',
    property_type: 'boutique hotel',
    source_job_title: 'Guest Relations Manager',
    score: 85,
    tier: 'hot',
    stage: 'new',
    archived: false
  }).select().single();

  if (error) {
    console.log('Error creating prospect:', error.message);
    return;
  }

  console.log('Created test prospect:', prospect.id);
  console.log('Now triggering auto-email...');

  // Trigger auto-email
  const response = await fetch('http://localhost:3000/api/auto-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_emails: 1 })
  });

  const result = await response.json();
  console.log('Email result:', JSON.stringify(result, null, 2));
}

createTestAndSend();
