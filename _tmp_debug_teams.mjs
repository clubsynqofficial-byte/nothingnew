import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://iclxtjfxxlygagfgxhwg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbHh0amZ4eGx5Z2FnZmd4aHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODQ0NTMsImV4cCI6MjA5MzU2MDQ1M30.LbOgbutzVmFPKGvQt7kmvldN8_7_JFItEWEU-gqkz4k'
)

const TID = 'a0d68c26-a354-43da-b01d-19ce44c35cbf'
let receivedAny = false

const ch = supabase.channel('debug-teams-test')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_teams', filter: `tournament_id=eq.${TID}` }, (payload) => {
    console.log('RECEIVED EVENT:', JSON.stringify(payload).slice(0, 400))
    receivedAny = true
  })
  .subscribe((status, err) => {
    console.log('CHANNEL STATUS:', status, err ? err.message : '')
  })

await new Promise(r => setTimeout(r, 30000))
console.log('receivedAny:', receivedAny)
process.exit(0)
