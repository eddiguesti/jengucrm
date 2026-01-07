import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findPersonalEmails() {
  // Get all prospects with email and contact_name
  let all: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('prospects')
      .select('id, name, email, contact_name, stage, last_contacted_at')
      .eq('archived', false)
      .not('email', 'is', null)
      .not('contact_name', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) { console.error(error); return; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Total prospects with email AND contact_name: ${all.length}\n`);

  // Find where first name appears in email
  const matches: any[] = [];
  const GENERIC = ['info', 'contact', 'reserv', 'recep', 'book', 'hello', 'hi', 'support',
    'sales', 'admin', 'office', 'team', 'help', 'service', 'hotel', 'hola', 'front', 'desk',
    'resa', 'aide', 'guest', 'marketing', 'events', 'spa', 'bar', 'restaurant', 'concierge',
    'direccion', 'gerencia', 'management', 'comercial', 'groups', 'mice', 'corporate'];

  for (const p of all) {
    const email = (p.email || '').toLowerCase();
    const localPart = email.split('@')[0];

    // Skip generic
    if (GENERIC.some(g => localPart.startsWith(g))) continue;

    const contact = (p.contact_name || '').toLowerCase().trim();
    const names = contact.split(/\s+/).filter((n: string) => n.length >= 3);

    for (const name of names) {
      if (localPart.includes(name)) {
        matches.push({
          id: p.id,
          hotel: (p.name || '').substring(0, 30),
          contact: p.contact_name,
          email: p.email,
          matchedName: name,
          stage: p.stage,
          contacted: p.last_contacted_at ? 'YES' : 'NO'
        });
        break;
      }
    }
  }

  console.log(`Prospects with name in email: ${matches.length}\n`);
  console.log('=== NOT CONTACTED YET ===');
  const notContacted = matches.filter(m => m.contacted === 'NO' && ['new', 'enriched', 'ready', 'researching'].includes(m.stage));
  console.log(`Count: ${notContacted.length}\n`);

  notContacted.forEach(m => {
    const h = (m.hotel || '').padEnd(30);
    const c = (m.contact || '').substring(0, 20).padEnd(20);
    console.log(`${h} | ${c} | ${m.email} | MATCH: ${m.matchedName}`);
  });

  console.log('\n=== ALREADY CONTACTED ===');
  const contacted = matches.filter(m => m.contacted === 'YES' || m.stage === 'contacted');
  console.log(`Count: ${contacted.length}`);
}

findPersonalEmails();
