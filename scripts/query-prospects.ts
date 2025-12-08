import { supabase } from './lib/supabase';

async function main() {
  // Query with same filters as auto-email route
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, email, score, stage, archived, source, contact_name')
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .not('email', 'is', null)
    .gte('score', 50)
    .order('score', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Found ' + (prospects?.length || 0) + ' prospects matching auto-email criteria (score >= 50):\n');

  for (const p of prospects || []) {
    const sourceStr = (p.source || '').padEnd(15);
    const stageStr = (p.stage || '').padEnd(12);
    const emailStr = (p.email || '').substring(0, 35).padEnd(37);
    const nameStr = (p.name || '').substring(0, 25);
    console.log(p.score + ' | ' + sourceStr + ' | ' + stageStr + ' | ' + emailStr + ' | ' + nameStr);
  }

  // Also check lower score
  const { data: lowScore } = await supabase
    .from('prospects')
    .select('id, name, email, score, stage, source')
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .not('email', 'is', null)
    .gte('score', 30)
    .lt('score', 50)
    .order('score', { ascending: false })
    .limit(20);

  console.log('\nFound ' + (lowScore?.length || 0) + ' prospects with score 30-49:\n');
  for (const p of lowScore || []) {
    const sourceStr = (p.source || '').padEnd(15);
    const emailStr = (p.email || '').substring(0, 35).padEnd(37);
    const nameStr = (p.name || '').substring(0, 25);
    console.log(p.score + ' | ' + sourceStr + ' | ' + emailStr + ' | ' + nameStr);
  }
}

main();
