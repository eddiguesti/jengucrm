import { supabase } from './lib/supabase';

async function main() {
  // Get all Sales Navigator prospects
  const { data: salesNav, error } = await supabase
    .from('prospects')
    .select('id, name, email, score, stage, contact_name, source_job_title')
    .eq('source', 'sales_navigator')
    .order('score', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== Sales Navigator Prospects ===\n');
  console.log('Score | Title'.padEnd(40) + ' | Email'.padEnd(35) + ' | Name');
  console.log('-'.repeat(120));

  for (const p of salesNav || []) {
    const title = (p.source_job_title || 'N/A').substring(0, 35).padEnd(37);
    const email = (p.email || 'N/A').substring(0, 30).padEnd(32);
    const name = (p.name || '').substring(0, 25);
    console.log(String(p.score).padEnd(5) + ' | ' + title + ' | ' + email + ' | ' + name);
  }

  console.log('\nTotal:', salesNav?.length || 0);

  // Find prospects with GM/Director titles
  const gmDirectors = (salesNav || []).filter(p => {
    const title = (p.source_job_title || '').toLowerCase();
    return title.includes('general manager') ||
           title.includes('director') ||
           title.includes('gm') ||
           title.includes('owner') ||
           title.includes('ceo') ||
           title.includes('president') ||
           title.includes('vp') ||
           title.includes('vice president');
  });

  console.log('\n=== GM/Director/Owner prospects that should have higher scores ===\n');
  for (const p of gmDirectors) {
    console.log(p.score + ' | ' + p.source_job_title + ' | ' + p.email + ' | ' + p.name);
  }
  console.log('\nTotal GM/Director/Owner:', gmDirectors.length);
}

main();
