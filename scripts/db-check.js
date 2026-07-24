// One-off diagnostic script: reads the DB password directly from .env.local
// (never pass it as a literal CLI argument) and checks table state.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const envPath = path.join(__dirname, '..', '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')

const urlMatch = envText.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)
const pwMatch = envText.match(/password\s*=\s*(\S+)/i)

if (!urlMatch || !pwMatch) {
  console.error('Could not find project ref or DB password in .env.local')
  process.exit(1)
}

const ref = urlMatch[1]
const password = pwMatch[1]

const client = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

client.connect().then(async () => {
  console.log('CONNECTED to project:', ref)
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  )
  console.log('public tables (' + tables.rows.length + '):', tables.rows.map(r => r.table_name).join(', '))

  const policies = await client.query(
    "select policyname, tablename, qual from pg_policies where schemaname='public' and tablename='profiles'"
  )
  console.log('\npolicies on public.profiles:')
  for (const p of policies.rows) console.log(' -', p.policyname, '|', p.qual)

  await client.end()
}).catch(e => {
  console.error('CONNECT ERROR:', e.message)
  process.exit(1)
})
