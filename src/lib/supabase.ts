import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://iclxtjfxxlygagfgxhwg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbHh0amZ4eGx5Z2FnZmd4aHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODQ0NTMsImV4cCI6MjA5MzU2MDQ1M30.LbOgbutzVmFPKGvQt7kmvldN8_7_JFItEWEU-gqkz4k'
)
