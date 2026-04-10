import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path: '.local.env'});
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  const { data: d1 } = await supabase.from('dispatches').select('*').limit(1);
  console.log('dispatches keys:', d1?.[0] ? Object.keys(d1[0]) : 'empty');
  
  const { data: d2 } = await supabase.from('incidents').select('*').limit(1);
  console.log('incidents keys:', d2?.[0] ? Object.keys(d2[0]) : 'empty');
}
run();
