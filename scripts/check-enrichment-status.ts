import { supabase } from './lib/supabase';

async function check() {
  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('stage, website, email, contact_name, source')
    .eq('archived', false);

  if (!prospects) {
    console.log('No data');
    return;
  }

  const stats = {
    total: prospects.length,
    byStage: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    hasWebsite: 0,
    hasEmail: 0,
    hasContact: 0,
    hasBoth: 0,
    needsEnrichment: 0,
    readyToEnrich: 0,
    hasWebsiteNoEmail: 0,
    hasContactNoEmail: 0
  };

  prospects.forEach(p => {
    stats.byStage[p.stage] = (stats.byStage[p.stage] || 0) + 1;
    stats.bySource[p.source || 'unknown'] = (stats.bySource[p.source || 'unknown'] || 0) + 1;

    if (p.website) stats.hasWebsite++;
    if (p.email) stats.hasEmail++;
    if (p.contact_name) stats.hasContact++;
    if (p.website && p.contact_name) stats.hasBoth++;

    if (p.stage === 'new' && !p.email) {
      stats.needsEnrichment++;
      if (p.website) stats.readyToEnrich++;
    }

    if (p.website && !p.email) stats.hasWebsiteNoEmail++;
    if (p.contact_name && !p.email) stats.hasContactNoEmail++;
  });

  console.log('=== PROSPECT STATUS ===');
  console.log('Total active:', stats.total);
  console.log('');

  console.log('By Stage:');
  Object.entries(stats.byStage).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`  ${s}: ${c}`);
  });
  console.log('');

  console.log('By Source:');
  Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`  ${s}: ${c}`);
  });
  console.log('');

  console.log('Data Quality:');
  console.log(`  Has website: ${stats.hasWebsite}`);
  console.log(`  Has email: ${stats.hasEmail}`);
  console.log(`  Has contact name: ${stats.hasContact}`);
  console.log(`  Has website + contact (no email): ${stats.hasBoth - stats.hasEmail}`);
  console.log('');

  console.log('Enrichment Opportunities:');
  console.log(`  Has website, no email: ${stats.hasWebsiteNoEmail}`);
  console.log(`  Has contact name, no email: ${stats.hasContactNoEmail}`);
  console.log(`  In "new" stage, no email: ${stats.needsEnrichment}`);
  console.log(`  Ready to enrich (new + website): ${stats.readyToEnrich}`);

  // Show sample of prospects ready to enrich
  console.log('\n=== SAMPLE: READY TO ENRICH (has website + contact, no email) ===');
  const readyProspects = prospects.filter(p =>
    p.stage === 'new' && !p.email && p.website && p.contact_name
  ).slice(0, 15);

  readyProspects.forEach(p => {
    const name = (p.contact_name || '').substring(0, 20).padEnd(20);
    const website = (p.website || '').substring(0, 40);
    console.log(`  ${name} | ${website}`);
  });

  console.log(`\nTotal ready with contact+website: ${prospects.filter(p =>
    p.stage === 'new' && !p.email && p.website && p.contact_name
  ).length}`);
}

check();
