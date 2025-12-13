/**
 * Prospect Data Cleanup Script
 *
 * Cleans up prospects database:
 * 1. Archives big hotel chains (Virgin, Hilton, Marriott, etc.)
 * 2. Marks bad email data (images, invalid formats)
 * 3. Identifies truly personal emails (firstname.lastname@)
 * 4. Flags generic emails
 */

import { supabase } from './lib/supabase';

// Big hotel chains to archive (they have dedicated guest messaging)
const BIG_CHAINS = [
  // Major international chains
  'hilton', 'marriott', 'ihg', 'intercontinental', 'holiday inn', 'crowne plaza',
  'hyatt', 'accor', 'novotel', 'ibis', 'sofitel', 'pullman', 'mercure',
  'radisson', 'wyndham', 'best western', 'choice hotels', 'la quinta',
  'ramada', 'days inn', 'super 8', 'motel 6', 'extended stay',

  // Luxury chains
  'four seasons', 'ritz-carlton', 'ritz carlton', 'st. regis', 'st regis',
  'w hotels', 'waldorf', 'conrad', 'park hyatt', 'andaz', 'jw marriott',
  'fairmont', 'raffles', 'swissôtel', 'swissotel', 'shangri-la', 'shangri la',
  'peninsula', 'mandarin oriental', 'rosewood', 'aman', 'banyan tree',
  'six senses', 'one&only', 'belmond', 'virgin hotels', 'virgin',

  // Resort chains
  'sandals', 'beaches', 'club med', 'dreams resorts', 'secrets resorts',
  'zoetry', 'breathless', 'now resorts', 'riu', 'barcelo', 'iberostar',
  'melia', 'palladium', 'hard rock hotel', 'loews', 'omni',

  // European chains
  'nh hotels', 'nh collection', 'leonardo', 'scandic', 'premier inn',
  'travelodge', 'jurys inn', 'motel one', 'b&b hotels', 'moxy',
  'citizenm', 'generator hostels', 'a&o hostels', 'hostelworld',

  // Asian chains
  'okura', 'nikko', 'prince hotels', 'ana hotels', 'imperial hotel',
  'oberoi', 'taj hotels', 'itc hotels', 'leela', 'trident',

  // Vacation rentals / aparthotels
  'airbnb', 'vrbo', 'booking.com', 'expedia', 'trivago',
  'aparthotel', 'sonder', 'stay alfred', 'kasa', 'mint house',
];

// Generic email prefixes (expanded)
const GENERIC_PREFIXES = [
  'info', 'contact', 'reservations', 'reservation', 'reception', 'booking',
  'bookings', 'hello', 'hi', 'support', 'sales', 'admin', 'office',
  'enquiries', 'enquiry', 'mail', 'email', 'general', 'frontdesk',
  'front-desk', 'reserva', 'reservas', 'recepcion', 'accueil', 'contato', 'contacto',
  'team', 'help', 'service', 'services', 'customerservice', 'feedback',
  'marketing', 'pr', 'press', 'media', 'events', 'concierge',
  'guestservices', 'guest.services', 'careers', 'jobs', 'hr', 'finance',
  'billing', 'accounts', 'webmaster', 'postmaster', 'noreply', 'no-reply',
  'welcome', 'stay', 'book', 'reserve', 'spa', 'restaurant', 'bar',
  'groups', 'group', 'corporate', 'mice', 'conference', 'banquet',
  'commercial', 'comercial', 'ventas', 'ventes', 'vendas',
  // More generic patterns
  'hotel', 'hola', 'bonjour', 'resa', 'front', 'desk', 'aide', 'rest',
  'prenom', 'nom', 'exemple', 'test', 'demo', 'guest', 'hostal', 'hot',
  'alojamiento', 'direccion', 'gerencia', 'management', 'recep', 'coord'
];

async function cleanup() {
  console.log('=== PROSPECT CLEANUP ===\n');

  // Get ALL prospects with pagination (Supabase has 1000 row limit)
  let allProspects: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: batch, error } = await supabase
      .from('prospects')
      .select('id, name, email, contact_name, stage, source, archived, company')
      .eq('archived', false)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching prospects:', error);
      return;
    }

    if (!batch || batch.length === 0) break;

    allProspects = allProspects.concat(batch);
    console.log(`Fetched ${allProspects.length} prospects...`);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const prospects = allProspects;

  if (prospects.length === 0) {
    console.log('No prospects found');
    return;
  }

  console.log('Total active prospects:', prospects.length);

  // Categorize prospects
  const toArchive: { id: string; reason: string }[] = [];
  const badEmails: { id: string; email: string; reason: string }[] = [];
  const genericEmails: { id: string; name: string; email: string }[] = [];
  const personalEmails: { id: string; name: string; email: string; contact: string }[] = [];

  for (const p of prospects) {
    const name = (p.name || '').toLowerCase();
    const company = (p.company || '').toLowerCase();
    const email = (p.email || '').toLowerCase();

    // 1. Check for big chains
    const isChain = BIG_CHAINS.some(chain =>
      name.includes(chain) || company.includes(chain) ||
      (email && email.includes(chain.replace(/\s+/g, '')))
    );
    if (isChain) {
      toArchive.push({ id: p.id, reason: 'big_chain' });
      continue;
    }

    // 2. Check for bad email data
    if (email) {
      if (email.includes('.png') || email.includes('.jpg') ||
          email.includes('.jpeg') || email.includes('.gif') ||
          email.includes('.svg') || email.includes('.webp') ||
          email.includes('@2x') || email.includes('@3x') ||
          email.includes('http') || !email.includes('@') ||
          !email.includes('.') || email.length < 6) {
        badEmails.push({ id: p.id, email: p.email || '', reason: 'invalid_format' });
        continue;
      }
    }

    // 3. Check for generic vs personal emails
    if (email && email.includes('@')) {
      const localPart = email.split('@')[0];
      const isGeneric = GENERIC_PREFIXES.some(prefix =>
        localPart === prefix || localPart.startsWith(prefix + '.') ||
        localPart.startsWith(prefix + '-') || localPart.startsWith(prefix + '_')
      );

      if (isGeneric) {
        genericEmails.push({ id: p.id, name: p.name || '', email: p.email || '' });
      } else {
        // Check if it looks like a TRULY personal email
        // Must have contact_name AND the first name should appear in email
        const contactName = (p.contact_name || '').toLowerCase().trim();
        const firstName = contactName.split(' ')[0];
        const lastName = contactName.split(' ').slice(-1)[0];

        // Email contains contact's first name (at least 3 chars to avoid false positives)
        const hasFirstName = firstName.length >= 3 && localPart.includes(firstName);
        // Email contains contact's last name
        const hasLastName = lastName && lastName.length >= 3 && firstName !== lastName && localPart.includes(lastName);
        // Email looks like firstname.lastname@ pattern with real names
        const parts = localPart.split(/[._-]/);
        const looksLikePersonal = parts.length >= 2 &&
          parts[0].length >= 2 && parts[0].length <= 15 &&
          parts[1].length >= 2 && parts[1].length <= 15 &&
          !/\d{4}/.test(localPart); // no years like 2024

        if ((hasFirstName || hasLastName) && contactName.length > 3) {
          personalEmails.push({
            id: p.id,
            name: p.name || '',
            email: p.email || '',
            contact: p.contact_name || ''
          });
        } else if (looksLikePersonal && email.includes('@gmail.com')) {
          // Gmail with name pattern - likely personal
          personalEmails.push({
            id: p.id,
            name: p.name || '',
            email: p.email || '',
            contact: p.contact_name || '(gmail personal)'
          });
        }
      }
    }
  }

  // Report
  console.log('\n=== CLEANUP REPORT ===');
  console.log('Big chains to archive:', toArchive.length);
  console.log('Bad email data:', badEmails.length);
  console.log('Generic emails:', genericEmails.length);
  console.log('Personal emails:', personalEmails.length);

  // Show samples
  console.log('\n=== CHAINS TO ARCHIVE (sample) ===');
  const chainProspects = prospects.filter(p =>
    toArchive.some(a => a.id === p.id)
  ).slice(0, 15);
  chainProspects.forEach(p => {
    console.log(`  ${(p.name || '').substring(0, 40)}`);
  });

  console.log('\n=== BAD EMAILS (sample) ===');
  badEmails.slice(0, 10).forEach(b => {
    console.log(`  ${b.email}`);
  });

  console.log('\n=== PERSONAL EMAILS (ready to verify) ===');
  const notContacted = personalEmails.filter(p => {
    const prospect = prospects.find(pr => pr.id === p.id);
    return ['new', 'enriched', 'ready', 'researching'].includes(prospect?.stage || '');
  });
  console.log('Not contacted yet:', notContacted.length);
  notContacted.slice(0, 20).forEach(p => {
    const name = p.name.substring(0, 25).padEnd(25);
    const contact = (p.contact || '-').substring(0, 15).padEnd(15);
    console.log(`  ${name} | ${contact} | ${p.email.substring(0, 35)}`);
  });

  // Ask for confirmation
  console.log('\n=== ACTIONS ===');
  console.log('To archive big chains, run with --archive-chains');
  console.log('To mark bad emails, run with --mark-bad-emails');
  console.log('To do both, run with --cleanup-all');

  // Check for flags
  const args = process.argv.slice(2);

  if (args.includes('--archive-chains') || args.includes('--cleanup-all')) {
    console.log('\n>>> Archiving big chains...');
    let archived = 0;
    for (const item of toArchive) {
      const { error } = await supabase
        .from('prospects')
        .update({
          archived: true,
          archive_reason: `big_chain_${item.reason}`,
          archived_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (!error) archived++;
    }
    console.log(`Archived ${archived} prospects`);
  }

  if (args.includes('--mark-bad-emails') || args.includes('--cleanup-all')) {
    console.log('\n>>> Marking bad emails...');
    let marked = 0;
    for (const item of badEmails) {
      const { error } = await supabase
        .from('prospects')
        .update({
          email: null,
          notes: `[BAD_EMAIL: ${item.email}] ${item.reason}`
        })
        .eq('id', item.id);

      if (!error) marked++;
    }
    console.log(`Marked ${marked} bad emails as null`);
  }

  console.log('\nDone!');
}

cleanup();
