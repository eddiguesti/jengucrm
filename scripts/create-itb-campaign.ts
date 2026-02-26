import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: 'ITB Travel Industry',
      strategy_key: 'itb_travel',
      active: true,
      daily_limit: 50,
      emails_sent: 0,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating campaign:', error);
    return;
  }
  
  console.log('Created ITB campaign:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
