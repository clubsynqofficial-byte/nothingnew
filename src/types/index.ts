export interface University {
  id: string
  name: string
  short_name: string | null
  location: string | null
  logo_url: string | null
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  university_id: string | null
  role: 'student' | 'club_leader' | 'admin'
  bio: string | null
  skills: string[]
  interests: string[]
  karak_points: number
  onboarded: boolean
  created_at: string
  university?: University
}

export interface Club {
  id: string
  name: string
  description: string | null
  category: string | null
  university_id: string | null
  logo_url: string | null
  banner_url: string | null
  is_verified: boolean
  president_id: string | null
  member_count: number
  created_at: string
  university?: University
}

export interface Event {
  id: string
  club_id: string | null
  title: string
  description: string | null
  location: string | null
  university_id: string | null
  start_time: string | null
  end_time: string | null
  max_attendees: number | null
  qr_code: string | null
  karak_points_reward: number
  is_live: boolean
  attendee_count: number
  category: string | null
  created_at: string
  club?: Club
  university?: University
}

export interface KarakReward {
  id: string
  title: string
  description: string | null
  image_url: string | null
  points_cost: number
  vendor: string | null
  location: string | null
  is_available: boolean
  created_at: string
}

export interface SkillListing {
  id: string
  user_id: string
  title: string
  description: string | null
  skill_offered: string
  skill_wanted: string
  category: string | null
  is_active: boolean
  created_at: string
  profile?: Profile
}

export interface FounderProfile {
  id: string
  user_id: string
  project_title: string
  project_description: string | null
  skills_needed: string[]
  skills_offered: string[]
  university_id: string | null
  is_active: boolean
  created_at: string
  profile?: Profile
  university?: University
}
