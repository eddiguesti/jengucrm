/**
 * Debug why auto-email isn't finding eligible prospects
 */

import { supabase } from './lib/supabase';

const GENERIC_EMAIL_PREFIXES = [
  /^info@/i, /^contact@/i, /^reception@/i, /^reservation@/i, /^reservations@/i,
  /^booking@/i, /^bookings@/i, /^sales@/i, /^hello@/i, /^enquiries@/i, /^enquiry@/i,
  /^front\.?desk@/i, /^guestservices@/i, /^guest\.?service@/i, /^hotel@/i, /^mail@/i,
  /^admin@/i, /^office@/i, /^support@/i, /^marketing@/i, /^team@/i, /^rsvp@/i, /^stay@/i, /^bienvenue@/i,
];

async function main() {
  console.log('=== DEBUG AUTO-EMAIL QUERY ===\n');

  // Same query as auto-email route
  const minScore = 50;
  const maxEmails = 20;

  console.log('Query parameters:');
  console.log('  minScore:', minScore);
  console.log('  stages: [new, researching]');
  console.log('  archived: false');
  console.log('  email: not null');

  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, email, score, stage, archived, source')
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .not('email', 'is', null)
    .gte('score', minScore)
    .order('score', { ascending: false })
    .limit(maxEmails * 20);

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log('\nQuery returned:', prospects?.length || 0, 'prospects\n');

  if (!prospects || prospects.length === 0) {
    console.log('=== CHECKING INDIVIDUAL FILTERS ===\n');

    // Check score filter
    const { data: byScore, count: scoreCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'sales_navigator')
      .gte('score', 50);
    console.log('Prospects with score >= 50 (Sales Nav):', scoreCount);

    // Check stage filter
    const { data: byStage, count: stageCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'sales_navigator')
      .in('stage', ['new', 'researching']);
    console.log('Prospects in new/researching stage (Sales Nav):', stageCount);

    // Check archived filter
    const { data: byArchived, count: archivedCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'sales_navigator')
      .eq('archived', false);
    console.log('Non-archived prospects (Sales Nav):', archivedCount);

    // Check email filter
    const { data: byEmail, count: emailCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'sales_navigator')
      .not('email', 'is', null);
    console.log('Prospects with email (Sales Nav):', emailCount);

    // Check combined filters
    const { data: combined } = await supabase
      .from('prospects')
      .select('id, name, email, score, stage, archived, source')
      .eq('source', 'sales_navigator')
      .gte('score', 50)
      .limit(10);

    console.log('\n=== Sample high-score Sales Nav prospects ===');
    for (const p of combined || []) {
      console.log(`${p.score} | ${p.stage?.padEnd(12)} | ${p.archived ? 'ARCHIVED' : 'active'} | ${p.email?.substring(0, 30).padEnd(32)} | ${p.name.substring(0, 20)}`);
    }

    return;
  }

  // Show first 10
  console.log('Score | Source          | Stage         | Email');
  console.log('-'.repeat(90));
  for (const p of prospects.slice(0, 20)) {
    console.log(`${p.score.toString().padEnd(5)} | ${(p.source || 'N/A').padEnd(15)} | ${(p.stage || 'N/A').padEnd(13)} | ${p.email?.substring(0, 35).padEnd(37)} | ${p.name.substring(0, 20)}`);
  }

  // Now filter like auto-email does
  const eligibleProspects = prospects.filter(p => {
    if (!p.email) return false;
    if (GENERIC_EMAIL_PREFIXES.some(pattern => pattern.test(p.email!))) return false;
    return true;
  });

  console.log('\nAfter filtering generic emails:', eligibleProspects.length, 'eligible\n');

  if (eligibleProspects.length > 0) {
    console.log('=== ELIGIBLE PROSPECTS ===');
    for (const p of eligibleProspects.slice(0, 20)) {
      console.log(`${p.score} | ${p.source?.padEnd(15)} | ${p.email?.substring(0, 35).padEnd(37)} | ${p.name.substring(0, 20)}`);
    }
  }
}

main().catch(console.error);
