// One-off script: create (or promote) an admin user via the Supabase Admin API.
// Usage: node scripts/create-admin.js <email> <password>
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
const { createClient } = require('@supabase/supabase-js')

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password>')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  // Does a user with this email already exist?
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) throw listErr
  const existing = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let user
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { ...existing.app_metadata, role: 'admin' },
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
    console.log('Updated existing user ->', user.id)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    })
    if (error) throw error
    user = data.user
    console.log('Created new user ->', user.id)
  }

  // Keep public.profiles.role in sync too (some queries/UI may read it directly).
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', user.id)
  if (profileErr) console.warn('profiles.role update warning:', profileErr.message)

  console.log('Done. app_metadata.role =', user.app_metadata?.role)
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
