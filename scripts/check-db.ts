import { supabase } from './lib/supabase';

async function check() {
  // Sales Navigator count
  const { count: snCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'sales_navigator');

  // With email
  const { count: snWithEmail } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'sales_navigator')
    .not('email', 'is', null);

  console.log('=== SALES NAVIGATOR ===');
  console.log('Total:', snCount);
  console.log('With email:', snWithEmail);
  console.log('Without email:', (snCount || 0) - (snWithEmail || 0));

  // Sample
  const { data: sample } = await supabase
    .from('prospects')
    .select('name, contact_name, email, stage')
    .eq('source', 'sales_navigator')
    .limit(10);

  if (sample) {
    sample.forEach(p => {
      const name = (p.name || '').substring(0, 28).padEnd(28);
      const contact = (p.contact_name || '-').substring(0, 16).padEnd(16);
      const hasEmail = p.email ? 'EMAIL' : 'NONE';
      console.log(`  ${name} | ${contact} | ${hasEmail} | ${p.stage}`);
    });
  }

  // Enrichment - use the correct table name
  const { data: queue, count: queueCount } = await supabase
    .from('sales_nav_enrichment_queue')
    .select('*', { count: 'exact' })
    .limit(10);
  console.log('\n=== SALES NAV ENRICHMENT QUEUE ===');
  console.log('Total:', queueCount);

  // Count by status
  const { data: pendingQ } = await supabase
    .from('sales_nav_enrichment_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  console.log('Pending:', pendingQ);

  if (queue) {
    queue.forEach(q => {
      const name = (q.prospect_name || '').substring(0, 25).padEnd(25);
      console.log(`  ${name} | ${q.status}`);
    });
  }

  // Emails
  const { count: emailCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound');

  const { data: recentEmails } = await supabase
    .from('emails')
    .select('subject, created_at')
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== OUTBOUND EMAILS ===');
  console.log('Total sent:', emailCount);
  if (recentEmails) {
    recentEmails.forEach(e => {
      const date = (e.created_at || '').substring(0, 10);
      const subj = (e.subject || '').substring(0, 50);
      console.log(`  ${date} | ${subj}`);
    });
  }
}

check();
