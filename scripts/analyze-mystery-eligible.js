const http = require('http');

const req = http.request('http://localhost:3000/api/prospects?limit=1000', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const prospects = json.data?.prospects || [];

    // Count by stage
    const stages = {};
    prospects.forEach(p => {
      stages[p.stage || 'null'] = (stages[p.stage || 'null'] || 0) + 1;
    });
    console.log('By stage:', stages);

    // Count generic emails
    const genericPrefixes = ['info@', 'reservations@', 'reception@', 'frontdesk@', 'hello@', 'contact@', 'enquiries@'];
    const genericEmails = prospects.filter(p => {
      if (!p.email) return false;
      return genericPrefixes.some(prefix => p.email.toLowerCase().startsWith(prefix));
    });
    console.log('Generic emails:', genericEmails.length);

    // Count not yet sent mystery inquiry
    const eligible = genericEmails.filter(p => {
      return !p.tags || !p.tags.includes('mystery-inquiry-sent');
    });
    console.log('Eligible (no inquiry sent):', eligible.length);

    // Show first 5
    console.log('\nFirst 5 eligible:');
    eligible.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name}: ${p.email} (stage: ${p.stage})`);
    });
  });
});
req.end();
