import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club } from '../../types'
import CreateClub from './CreateClub'
import CommandCenter from './CommandCenter'

export default function LeadershipPage() {
  const { user } = useAuth()
  const [club, setClub] = useState<Club | null | undefined>(undefined)

  async function fetchClub() {
    if (!user) return
    const { data } = await supabase
      .from('clubs')
      .select('*, university:universities(*)')
      .eq('president_id', user.id)
      .maybeSingle()
    setClub(data)
  }

  useEffect(() => { fetchClub() }, [user])

  // undefined = still loading
  if (club === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  if (club === null) {
    return <CreateClub onCreated={fetchClub} />
  }

  return <CommandCenter club={club} />
}
