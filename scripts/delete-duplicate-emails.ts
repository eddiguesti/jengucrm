import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteDuplicates() {
  console.log('🗑️  Deleting duplicate emails...\n');

  // IDs of duplicates to delete (keeping the oldest in each group)
  const duplicatesToDelete = [
    'cd49d845-ac21-48cd-8080-021307df6c49', // Relais Chateaux duplicate
    'c3e63c56-dd18-4a20-ab64-6ed018fc40fb', // CGH Residences duplicate 1
    '34f78c09-62ef-40fa-a0ad-00ab8738b314', // CGH Residences duplicate 2
    '70c6c730-0f9c-413a-a4bc-8d5d2e16e3dc', // Monrif Hotels duplicate
  ];

  console.log(`📋 Will delete ${duplicatesToDelete.length} duplicate emails:\n`);

  for (const id of duplicatesToDelete) {
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('id, subject, from_email, sent_at')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error(`❌ Error fetching email ${id}:`, fetchError.message);
      continue;
    }

    console.log(`   - ${email.subject?.substring(0, 50)}... (${email.from_email})`);

    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error(`   ❌ Failed to delete: ${deleteError.message}`);
    } else {
      console.log(`   ✅ Deleted`);
    }
  }

  console.log(`\n✅ Cleanup complete!`);
  console.log(`\nYou can now run the CASCADE migration with the unique index.`);
}

deleteDuplicates().catch(console.error);
