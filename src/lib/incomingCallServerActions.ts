import { supabase } from './supabase';

export async function declineIncomingCallOnServer(callId: string): Promise<void> {
  await supabase
    .from('call_history')
    .update({
      status: 'missed',
      ended_at: new Date().toISOString(),
      ended_by: 'rescuer',
    })
    .eq('id', callId);
}
