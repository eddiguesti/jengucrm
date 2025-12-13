import { supabase } from './lib/supabase';

async function checkColumns() {
  // Get one prospect to see all columns
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Prospect columns:');
  Object.keys(data).sort().forEach(key => {
    console.log(`  ${key}: ${typeof data[key]}`);
  });
}

checkColumns();
