// One-off script: create (or promote) an ERP admin user via the Supabase Admin API.
// This IS the login for the storefront admin panel too — /admin and /erp share
// one staff identity (erp_users.role = 'ADMIN'), gated at /erp/login.
// Usage: node scripts/create-admin.js <email> <password> [name]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
const { createClient } = require('@supabase/supabase-js')

const [, , email, password, name] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> [name]')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  // Does a Supabase Auth user with this email already exist?
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) throw listErr
  const existing = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let user
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
    console.log('Updated existing auth user ->', user.id)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
    console.log('Created new auth user ->', user.id)
  }

  // erp_users is the single source of truth for staff roles — this is what
  // requireAdmin()/adminGuard() and the ERP itself both check.
  const { data: existingStaff } = await supabase
    .from('erp_users')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (existingStaff) {
    const { error } = await supabase
      .from('erp_users')
      .update({ role: 'ADMIN', active: true, ...(name ? { name } : {}) })
      .eq('id', existingStaff.id)
    if (error) throw error
    console.log('Promoted existing erp_users row to ADMIN ->', existingStaff.id)
  } else {
    const { error } = await supabase
      .from('erp_users')
      .insert({
        auth_user_id: user.id,
        name: name || email.split('@')[0],
        email,
        role: 'ADMIN',
        active: true,
      })
    if (error) throw error
    console.log('Created erp_users row with role ADMIN')
  }

  console.log(`Done. Sign in at /erp/login with ${email}`)
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
