'use client'

import { useState, useEffect } from 'react'

interface Partner {
  id: string
  name: string
  display_name: string
  api_key: string | null
  api_secret: string | null
  account_code: string | null
  pickup_location_name: string | null
  pickup_pincode: string | null
  config: {
    pickup_address?: string
    pickup_city?: string
    pickup_state?: string
    pickup_phone?: string
    store_name?: string
    gst_number?: string
    base_url?: string
  }
  is_active: boolean
  created_at: string
}

const PARTNER_OPTIONS = [
  { value: 'delhivery',  label: 'Delhivery' },
  { value: 'shiprocket', label: 'Shiprocket' },
  { value: 'dtdc',       label: 'DTDC' },
  { value: 'bluedart',   label: 'BlueDart' },
  { value: 'other',      label: 'Other' },
]

const PARTNER_EMOJIS: Record<string, string> = {
  delhivery:  '🚚',
  shiprocket: '🚀',
  dtdc:       '📦',
  bluedart:   '✈️',
  other:      '🏷️',
}

function maskKey(key: string | null) {
  if (!key) return '—'
  if (key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}

const EMPTY_FORM = {
  name: '',
  display_name: '',
  api_key: '',
  api_secret: '',
  account_code: '',
  pickup_location_name: '',
  pickup_pincode: '',
  is_active: true,
  config: {
    pickup_address: '',
    pickup_city: '',
    pickup_state: '',
    pickup_phone: '',
    store_name: '',
    gst_number: '',
  },
}

type FormState = typeof EMPTY_FORM

export default function DeliveryPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]         = useState<FormState>({ ...EMPTY_FORM, config: { ...EMPTY_FORM.config } })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [testing, setTesting]   = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})
  const [warehouses, setWarehouses] = useState<{ name: string; address: string; pin: string; city: string; state: string; phone: string }[]>([])
  const [loadingWh, setLoadingWh]   = useState(false)
  const [whError, setWhError]       = useState<string | null>(null)

  useEffect(() => { loadPartners() }, [])

  async function loadPartners() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/delivery-partners')
      const json = await res.json()
      setPartners(json.data ?? [])
    } catch { setError('Failed to load delivery partners') }
    finally  { setLoading(false) }
  }

  function setField(key: keyof Omit<FormState, 'config'>, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function setConfig(key: keyof FormState['config'], val: string) {
    setForm(f => ({ ...f, config: { ...f.config, [key]: val } }))
  }

  function openAdd() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, config: { ...EMPTY_FORM.config } })
    setError(null)
    setShowForm(true)
  }

  function openEdit(p: Partner) {
    setEditingId(p.id)
    setForm({
      name:                 p.name,
      display_name:         p.display_name,
      api_key:              p.api_key ?? '',
      api_secret:           p.api_secret ?? '',
      account_code:         p.account_code ?? '',
      pickup_location_name: p.pickup_location_name ?? '',
      pickup_pincode:       p.pickup_pincode ?? '',
      is_active:            p.is_active,
      config: {
        pickup_address: p.config?.pickup_address ?? '',
        pickup_city:    p.config?.pickup_city ?? '',
        pickup_state:   p.config?.pickup_state ?? '',
        pickup_phone:   p.config?.pickup_phone ?? '',
        store_name:     p.config?.store_name ?? '',
        gst_number:     p.config?.gst_number ?? '',
      },
    })
    setError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false); setEditingId(null)
    setForm({ ...EMPTY_FORM, config: { ...EMPTY_FORM.config } }); setError(null)
    setWarehouses([]); setWhError(null)
  }

  async function loadWarehouses() {
    if (!form.api_key.trim()) { setWhError('Enter API key first'); return }
    setLoadingWh(true); setWhError(null); setWarehouses([])
    try {
      const res  = await fetch('/api/admin/delhivery/fetch-warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: form.api_key }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to fetch warehouses')
      if (!json.warehouses?.length) throw new Error('No warehouses found in your Delhivery account. Create one at app.delhivery.com → Settings → Pickup Locations.')
      setWarehouses(json.warehouses)
    } catch (e: any) { setWhError(e.message) }
    finally          { setLoadingWh(false) }
  }

  function selectWarehouse(wh: typeof warehouses[0]) {
    setForm(f => ({
      ...f,
      pickup_location_name: wh.name,
      pickup_pincode:       wh.pin,
      config: {
        ...f.config,
        pickup_address: wh.address,
        pickup_city:    wh.city,
        pickup_state:   wh.state,
        pickup_phone:   wh.phone,
      },
    }))
    setWarehouses([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const method = editingId ? 'PATCH' : 'POST'
      const body   = editingId ? { id: editingId, ...form } : form
      const res    = await fetch('/api/admin/delivery-partners', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      await loadPartners()
      cancelForm()
    } catch (e: any) { setError(e.message) }
    finally          { setSaving(false) }
  }

  async function toggleActive(p: Partner) {
    await fetch('/api/admin/delivery-partners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    })
    loadPartners()
  }

  async function testConnection(p: Partner) {
    setTesting(p.id)
    setTestResult(r => ({ ...r, [p.id]: '' }))
    try {
      const res  = await fetch(`/api/admin/delivery-partners/test?id=${p.id}`)
      const json = await res.json()
      setTestResult(r => ({ ...r, [p.id]: json.ok ? '✓ Connected' : `✗ ${json.error}` }))
    } catch (e: any) {
      setTestResult(r => ({ ...r, [p.id]: `✗ ${e.message}` }))
    } finally { setTesting(null) }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Partners</h1>
          <p className="text-sm text-gray-500 mt-1">Add carrier accounts — rates are fetched automatically when booking orders</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + Add Partner
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5">
            {editingId ? 'Edit Partner' : 'Add Delivery Partner'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section: Carrier */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Carrier</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Carrier *</label>
                  <select value={form.name} onChange={e => {
                    const opt = PARTNER_OPTIONS.find(o => o.value === e.target.value)
                    setForm(f => ({ ...f, name: e.target.value, display_name: opt?.label ?? f.display_name }))
                  }} className={inputCls} required>
                    <option value="">Select…</option>
                    {PARTNER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Display Name *</label>
                  <input type="text" value={form.display_name} onChange={e => setField('display_name', e.target.value)}
                    placeholder="e.g. Delhivery Express" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>API Key / Token</label>
                  <input type="text" value={form.api_key} onChange={e => setField('api_key', e.target.value)}
                    placeholder="Paste API token here" className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className={labelCls}>API Secret / Password</label>
                  <input type="password" value={form.api_secret} onChange={e => setField('api_secret', e.target.value)}
                    placeholder="Secret key (if required)" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Account Code / Client ID</label>
                  <input type="text" value={form.account_code} onChange={e => setField('account_code', e.target.value)}
                    placeholder="DTDC client ID, etc." className={inputCls} />
                </div>
              </div>
            </div>

            {/* Section: Pickup / Store */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pickup Location</p>

              {/* Delhivery: load from API */}
              {form.name === 'delhivery' && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-blue-800">Auto-fill from Delhivery</p>
                    <button type="button" onClick={loadWarehouses} disabled={loadingWh || !form.api_key}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
                      {loadingWh ? 'Loading…' : '↓ Load My Warehouses'}
                    </button>
                  </div>
                  <p className="text-xs text-blue-600">Fetches your registered pickup locations directly from Delhivery — no manual typing needed.</p>
                  {whError && <p className="text-xs text-red-600 mt-2">{whError}</p>}
                  {warehouses.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-blue-700">Select a warehouse:</p>
                      {warehouses.map(wh => (
                        <button key={wh.name} type="button" onClick={() => selectWarehouse(wh)}
                          className="w-full text-left p-2.5 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                          <p className="text-sm font-semibold text-gray-800">{wh.name}</p>
                          <p className="text-xs text-gray-500">{wh.address}, {wh.city}, {wh.state} — {wh.pin}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.pickup_location_name && (
                    <p className="text-xs text-green-700 mt-2 font-medium">✓ Using: <span className="font-mono">{form.pickup_location_name}</span></p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Pickup Location Name *</label>
                  <input type="text" value={form.pickup_location_name} onChange={e => setField('pickup_location_name', e.target.value)}
                    placeholder={form.name === 'delhivery' ? 'Use "Load My Warehouses" above' : 'Exact name from carrier dashboard'}
                    className={inputCls} required />
                  {form.name === 'delhivery' && <p className="text-xs text-amber-600 mt-1">⚠ Must exactly match your Delhivery warehouse name</p>}
                </div>
                <div>
                  <label className={labelCls}>Pickup Pincode *</label>
                  <input type="text" value={form.pickup_pincode} onChange={e => setField('pickup_pincode', e.target.value)}
                    placeholder="e.g. 302001" className={inputCls} maxLength={6} required />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Pickup Address</label>
                  <input type="text" value={form.config.pickup_address} onChange={e => setConfig('pickup_address', e.target.value)}
                    placeholder="Street address" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>City</label>
                  <input type="text" value={form.config.pickup_city} onChange={e => setConfig('pickup_city', e.target.value)}
                    placeholder="e.g. Jaipur" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input type="text" value={form.config.pickup_state} onChange={e => setConfig('pickup_state', e.target.value)}
                    placeholder="e.g. Rajasthan" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Contact Phone</label>
                  <input type="tel" value={form.config.pickup_phone} onChange={e => setConfig('pickup_phone', e.target.value)}
                    placeholder="10-digit number" className={inputCls} maxLength={10} />
                </div>
                <div>
                  <label className={labelCls}>Store / Seller Name</label>
                  <input type="text" value={form.config.store_name} onChange={e => setConfig('store_name', e.target.value)}
                    placeholder="Appears on shipping label" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>GST Number <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={form.config.gst_number} onChange={e => setConfig('gst_number', e.target.value)}
                    placeholder="22AAAAA0000A1Z5" className={`${inputCls} font-mono`} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active}
                onChange={e => setField('is_active', e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active (included in rate comparisons)</label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save Partner'}
              </button>
              <button type="button" onClick={cancelForm}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Partner Cards */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : partners.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <p className="text-2xl mb-3">🚚</p>
          <p className="text-sm font-semibold text-blue-800 mb-1">No delivery partners yet</p>
          <p className="text-xs text-blue-600">Add Delhivery (or any carrier) to start booking shipments directly from orders.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {partners.map(p => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{PARTNER_EMOJIS[p.name] ?? '🏷️'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.display_name}</p>
                    <p className="text-xs text-gray-400 capitalize">{p.name}</p>
                  </div>
                </div>
                <button onClick={() => toggleActive(p)}
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    p.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-gray-500 mb-3">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">API Key</span>
                  <span className="font-mono">{maskKey(p.api_key)}</span>
                </div>
                {p.pickup_pincode && (
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Pickup PIN</span>
                    <span>{p.pickup_pincode}</span>
                  </div>
                )}
                {p.config?.pickup_city && (
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">City</span>
                    <span>{p.config.pickup_city}{p.config.pickup_state ? `, ${p.config.pickup_state}` : ''}</span>
                  </div>
                )}
                {p.pickup_location_name && (
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Location</span>
                    <span className="truncate max-w-[140px]">{p.pickup_location_name}</span>
                  </div>
                )}
                {!p.api_key && (
                  <p className="text-amber-600 text-xs pt-1">⚠ No API key — mock rates will be shown</p>
                )}
              </div>

              {testResult[p.id] && (
                <p className={`text-xs mb-2 font-medium ${testResult[p.id].startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult[p.id]}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:underline">Edit</button>
                {p.api_key && (
                  <button onClick={() => testConnection(p)} disabled={testing === p.id}
                    className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50">
                    {testing === p.id ? 'Testing…' : 'Test API'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Setup Guide */}
      <details className="mt-8 bg-white border border-gray-200 rounded-xl overflow-hidden group">
        <summary className="flex items-center justify-between px-5 py-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 cursor-pointer transition-colors list-none">
          <span>Setup Guide — How to get API keys</span>
          <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-5 pb-6 space-y-5 border-t border-gray-100 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">🚚 Delhivery</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Go to <code className="text-xs bg-gray-100 px-1 rounded">app.delhivery.com</code> → Settings → API → copy your Token</li>
              <li>Paste token as "API Key / Token" above</li>
              <li>Click <strong>"↓ Load My Warehouses"</strong> — your registered pickup locations load automatically</li>
              <li>Select one — name, pincode and address all fill in automatically</li>
              <li>Warehouses are managed on Delhivery portal, not here</li>
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">🚀 Shiprocket</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Register at <code className="text-xs bg-gray-100 px-1 rounded">shiprocket.in</code></li>
              <li>Go to Settings → API → generate token</li>
              <li>Use your email as Account Code, token as API Key</li>
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">📦 DTDC</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Register at <code className="text-xs bg-gray-100 px-1 rounded">dtdc.com</code> → partner portal</li>
              <li>API Access → get Client ID (Account Code) + Bearer token (API Key)</li>
            </ol>
          </div>
          <p className="text-xs text-gray-400">Mock rates are shown until API keys are saved. You can still assign and book manually.</p>
        </div>
      </details>
    </div>
  )
}
