import { supabase } from './lib/supabase';

// List of generic email prefixes to filter out
const GENERIC_PREFIXES = [
  'info@', 'contact@', 'reception@', 'reservation@', 'reservations@',
  'booking@', 'bookings@', 'sales@', 'hello@', 'enquiries@', 'enquiry@',
  'frontdesk@', 'front.desk@', 'guestservices@', 'guest.service@',
  'hotel@', 'mail@', 'admin@', 'office@', 'support@', 'marketing@',
  'team@', 'rsvp@', 'stay@', 'bienvenue@', 'welcome@', 'message@',
  'bonjour@', 'events@', 'hola@', 'restauration@'
];

function isPersonalEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  return !GENERIC_PREFIXES.some(prefix => lowerEmail.startsWith(prefix));
}

async function main() {
  // Get Sales Navigator prospects with emails
  const { data: salesNav, error } = await supabase
    .from('prospects')
    .select('id, name, email, score, contact_name, source_job_title, stage')
    .eq('source', 'sales_navigator')
    .not('email', 'is', null)
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .order('score', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Filter to only personal emails
  const personalEmails = (salesNav || []).filter(p => p.email && isPersonalEmail(p.email));

  console.log('=== Sales Navigator with PERSONAL Emails (eligible for auto-email) ===\n');
  console.log('Score | Contact Name'.padEnd(30) + ' | Email'.padEnd(35) + ' | Property');
  console.log('-'.repeat(110));

  for (const p of personalEmails) {
    const contact = (p.contact_name || 'N/A').substring(0, 25).padEnd(27);
    const email = (p.email || 'N/A').substring(0, 32).padEnd(34);
    const name = (p.name || '').substring(0, 25);
    console.log(String(p.score).padEnd(5) + ' | ' + contact + ' | ' + email + ' | ' + name);
  }

  console.log('\nTotal with personal emails:', personalEmails.length);

  // Also show what got filtered out
  const genericEmails = (salesNav || []).filter(p => p.email && !isPersonalEmail(p.email));
  console.log('\n=== Filtered out (generic emails) ===');
  console.log('Count:', genericEmails.length);
  if (genericEmails.length > 0) {
    console.log('Examples:', genericEmails.slice(0, 5).map(p => p.email).join(', '));
  }
}

main();
