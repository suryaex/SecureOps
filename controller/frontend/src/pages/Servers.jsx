import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useServers } from '../context/ServerContext'
import api from '../api/client'

const STATUS_BADGE = {
  online:  'bg-success-light text-success border-success-border',
  offline: 'bg-danger-light text-danger border-danger-border',
  unknown: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default function Servers() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh, select } = useServers() || {}
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [pingingId, setPingingId] = useState(null)
  const isAdmin = user?.role === 'admin'

  const load = () =>
    api.get('/servers').then(({ data }) => setRows(data))
       .catch(() => setRows([]))
       .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const ping = async (id) => {
    setPingingId(id)
    try {
      await api.post(`/servers/${id}/ping`)
      await load()
      refresh && refresh()
    } finally { setPingingId(null) }
  }

  const pingAll = async () => {
    setLoading(true)
    await api.post('/servers/ping-all').catch(() => {})
    await load()
    refresh && refresh()
  }

  const remove = async (s) => {
    if (!confirm(`Remove server "${s.name}"? This cannot be undone.`)) return
    await api.delete(`/servers/${s.id}`).catch(e => alert(e.response?.data?.detail || 'Failed'))
    await load(); refresh && refresh()
  }

  const toggleEnabled = async (s) => {
    await api.patch(`/servers/${s.id}`, { enabled: !s.enabled }).catch(e => alert(e.response?.data?.detail || 'Failed'))
    await load(); refresh && refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitored Servers</h1>
          <p className="text-gray-500 text-sm mt-0.5">Fleet of agents this controller talks to</p>
        </div>
        <div className="flex gap-2">
          <button onClick={pingAll} className="btn-secondary">
            <span className="material-symbols-outlined text-lg">wifi_tethering</span>Ping All
          </button>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <span className="material-symbols-outlined text-lg">add</span>Add Server
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total"   value={rows.length} icon="dns"            bg="bg-blue-50 text-blue-500" />
        <Stat label="Online"  value={rows.filter(s => s.last_status === 'online' || s.is_local).length} icon="check_circle" bg="bg-success-light text-success" />
        <Stat label="Offline" value={rows.filter(s => s.last_status === 'offline').length} icon="cancel" bg="bg-danger-light text-danger" />
        <Stat label="Unknown" value={rows.filter(s => s.last_status === 'unknown' && !s.is_local).length} icon="help" bg="bg-gray-100 text-gray-500" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>{['Name', 'Hostname', 'URL', 'Status', 'Tags', 'Last Seen', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin inline-block" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No servers yet — click "Add Server" to register one.</td></tr>
              ) : rows.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        s.last_status === 'online' || s.is_local ? 'bg-success' :
                        s.last_status === 'offline' ? 'bg-danger' : 'bg-gray-300'
                      }`} />
                      <span className="text-gray-800 font-medium text-sm">{s.name}</span>
                      {s.is_local && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-bold uppercase">local</span>}
                    </div>
                  </td>
                  <td className="text-gray-600 text-xs font-mono">{s.hostname}</td>
                  <td className="text-gray-500 text-xs font-mono truncate max-w-xs">{s.api_url}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      STATUS_BADGE[s.last_status] || STATUS_BADGE.unknown
                    }`}>
                      {s.is_local ? 'local' : s.last_status}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(s.tags || '').split(',').filter(Boolean).map(t => (
                        <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t.trim()}</span>
                      ))}
                    </div>
                  </td>
                  <td className="text-gray-400 text-xs whitespace-nowrap">
                    {s.last_seen ? new Date(s.last_seen).toLocaleString() : '—'}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => ping(s.id)} disabled={pingingId === s.id} title="Ping" className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-40">
                        <span className="material-symbols-outlined text-base">{pingingId === s.id ? 'sync' : 'wifi_tethering'}</span>
                      </button>
                      {isAdmin && !s.is_local && (
                        <>
                          <button
                            onClick={() => { select && select(s.id); navigate('/terminal') }}
                            title="Open Terminal"
                            disabled={s.last_status !== 'online'}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-base">terminal</span>
                          </button>
                          <button onClick={() => toggleEnabled(s)} title={s.enabled ? 'Disable' : 'Enable'} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-600">
                            <span className="material-symbols-outlined text-base">{s.enabled ? 'visibility' : 'visibility_off'}</span>
                          </button>
                          <button onClick={() => remove(s)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600">
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <AddServerModal
          onClose={() => setShowAdd(false)}
          onSaved={async (data) => {
            setShowAdd(false)
            await load()
            // Auto-ping the new server to verify connectivity
            try { await api.post(`/servers/${data.id}/ping`) } catch {}
            await load()
            refresh && refresh()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, icon, bg }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
          <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  )
}

function AddServerModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', hostname: '', api_url: '', tags: '', api_key: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showKey, setShowKey] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const { data } = await api.post('/servers', {
        ...form,
        hostname: form.hostname.trim() || form.name.trim(),
        api_key: form.api_key.trim() || undefined,
      })
      onSaved(data)
    } catch (e2) {
      setErr(e2.response?.data?.detail || 'Failed to register server')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-gray-800 font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_to_queue</span>
            Register New Server
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Instructions panel */}
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-900 font-semibold mb-1.5 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">terminal</span>
            Install the agent first, then paste below
          </p>
          <pre className="bg-blue-900 text-green-300 text-[11px] font-mono p-2.5 rounded-md overflow-x-auto leading-relaxed">
{`sudo bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)`}
          </pre>
          <p className="text-[11px] text-blue-700 mt-1.5 leading-snug">
            The installer auto-generates an API key on the agent server. Copy <b>API URL</b> & <b>API Key</b> from its final output, then paste them into the form below.
          </p>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {err && <p className="text-danger text-sm px-3 py-2 bg-danger-light border border-danger-border rounded-lg">{err}</p>}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Server name" required>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="web-prod-01" required className="input" />
            </FormField>

            <FormField label="Hostname (display)">
              <input value={form.hostname} onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))} placeholder="(defaults to name)" className="input" />
            </FormField>
          </div>

          <FormField label="API URL — from agent installer output" required>
            <input
              value={form.api_url}
              onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
              placeholder="http://100.64.10.12:8001"
              required
              className="input font-mono text-xs"
              spellCheck="false"
              autoComplete="off"
            />
          </FormField>

          <FormField label="API Key — from agent installer output" required>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder="paste 43-char token from agent..."
                required
                minLength={20}
                className="input font-mono text-xs pr-20"
                spellCheck="false"
                autoComplete="off"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="text-gray-400 hover:text-gray-700 p-1"
                  title={showKey ? 'Hide' : 'Show'}
                >
                  <span className="material-symbols-outlined text-base">{showKey ? 'visibility_off' : 'visibility'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      if (text) setForm(f => ({ ...f, api_key: text.trim() }))
                    } catch {}
                  }}
                  className="text-gray-400 hover:text-primary p-1"
                  title="Paste from clipboard"
                >
                  <span className="material-symbols-outlined text-base">content_paste</span>
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Tip: in agent's terminal run <code className="bg-gray-100 px-1 rounded font-mono">sudo cat /etc/secureops-agent/key</code> if you forgot to copy.
            </p>
          </FormField>

          <FormField label="Tags (optional, comma-separated)">
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="production, web, db" className="input" />
          </FormField>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center">
              {busy ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Registering…</>
              ) : (
                <><span className="material-symbols-outlined text-lg">add</span>Register & Connect</>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  )
}

// (KeyRevealModal removed — agent now generates its own key during install)
