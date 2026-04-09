import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path: '.local.env'});
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  const { data } = await supabase.from('units').select('*').limit(1);
  console.log(Object.keys(data![0]));
}
run();
