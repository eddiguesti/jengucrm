import { supabase } from './lib/supabase';

async function check() {
  // Get ALL prospects with emails (no limit)
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, email, contact_name, stage, source, archived')
    .not('email', 'is', null);

  if (error) {
    console.error('Error:', error);
    return;
  }
  if (!prospects) {
    console.log('No prospects found');
    return;
  }

  // Generic email prefixes (expanded)
  const genericPrefixes = [
    'info@', 'contact@', 'reservations@', 'reservation@', 'reception@', 'booking@',
    'bookings@', 'hello@', 'hi@', 'support@', 'sales@', 'admin@', 'office@',
    'enquiries@', 'enquiry@', 'mail@', 'email@', 'general@', 'frontdesk@',
    'front-desk@', 'reserva@', 'recepcion@', 'accueil@', 'contato@', 'contacto@',
    'team@', 'help@', 'service@', 'services@', 'customerservice@', 'feedback@',
    'marketing@', 'pr@', 'press@', 'media@', 'events@', 'concierge@',
    'guestservices@', 'guest.services@', 'careers@', 'jobs@', 'hr@', 'finance@',
    'billing@', 'accounts@', 'webmaster@', 'postmaster@', 'noreply@', 'no-reply@',
    'welcome@', 'stay@', 'book@', 'reserve@'
  ];

  // Bad patterns (image URLs, etc.)
  const isBadData = (email: string) => {
    const lower = email.toLowerCase();
    return lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') ||
           lower.includes('.gif') || lower.includes('.svg') || lower.includes('.webp') ||
           lower.includes('http') || lower.includes('@2x') || lower.includes('@3x') ||
           lower.length < 6 || !lower.includes('@') || !lower.includes('.');
  };

  const isGeneric = (email: string) =>
    genericPrefixes.some(prefix => email.toLowerCase().startsWith(prefix));

  // Filter out bad data first
  const validEmails = prospects.filter(p => p.email && !isBadData(p.email) && !p.archived);
  const badData = prospects.filter(p => p.email && isBadData(p.email));
  const generic = validEmails.filter(p => isGeneric(p.email!));
  const personal = validEmails.filter(p => !isGeneric(p.email!));

  // Personal emails that look like real names (firstname@, firstname.lastname@, etc.)
  const looksLikeName = (email: string, contactName: string | null) => {
    const localPart = email.split('@')[0]?.toLowerCase() || '';

    // Has a dot (firstname.lastname pattern)
    if (localPart.includes('.') && localPart.length > 3) return true;

    // Contact name matches email prefix
    if (contactName) {
      const nameParts = contactName.toLowerCase().split(/\s+/);
      if (nameParts.some(part => localPart.includes(part) && part.length > 2)) return true;
    }

    // Common first name patterns
    return false;
  };

  const nameEmails = personal.filter(p => looksLikeName(p.email!, p.contact_name));
  const notContacted = personal.filter(p =>
    ['new', 'enriched', 'ready', 'researching'].includes(p.stage)
  );
  const nameNotContacted = nameEmails.filter(p =>
    ['new', 'enriched', 'ready', 'researching'].includes(p.stage)
  );

  console.log('=== EMAIL DATA QUALITY ===');
  console.log('Total with email:', prospects.length);
  console.log('Bad data (images, etc.):', badData.length);
  console.log('Valid emails:', validEmails.length);
  console.log('Generic (info@, etc.):', generic.length);
  console.log('Personal emails:', personal.length);
  console.log('  - Look like names:', nameEmails.length);
  console.log('Personal + Not contacted:', notContacted.length);
  console.log('Name-like + Not contacted:', nameNotContacted.length);
  console.log();

  // By stage
  const byStage: Record<string, number> = {};
  personal.forEach(p => { byStage[p.stage] = (byStage[p.stage] || 0) + 1; });
  console.log('=== PERSONAL EMAILS BY STAGE ===');
  Object.entries(byStage).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
    console.log(`  ${stage}: ${count}`);
  });
  console.log();

  console.log('=== NAME-LIKE EMAILS READY TO SEND (top 30) ===');
  nameNotContacted.slice(0, 30).forEach(p => {
    const name = (p.name || '').substring(0, 25).padEnd(25);
    const contact = (p.contact_name || '-').substring(0, 18).padEnd(18);
    const email = (p.email || '').substring(0, 35);
    console.log(`  ${name} | ${contact} | ${email}`);
  });

  // Export IDs for migration
  console.log('\n=== PROSPECT IDs READY FOR CLOUDFLARE (name-like, not contacted) ===');
  console.log('Total:', nameNotContacted.length);
  if (nameNotContacted.length > 0) {
    console.log('First 10 IDs:', nameNotContacted.slice(0, 10).map(p => p.id).join(', '));
  }
}

check();
