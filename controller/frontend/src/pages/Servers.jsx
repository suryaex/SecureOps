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
  // 2 modes: 'quick' (auto-join via token) or 'manual' (paste API URL + key)
  const [mode, setMode] = useState('quick')

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-gray-800 font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_to_queue</span>
            Add a new server
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Mode switcher */}
        <div className="px-5 pt-4 pb-1 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('quick')}
              className={`px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                mode === 'quick'
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="material-symbols-outlined">bolt</span>
                <span>One-Liner (Recommended)</span>
              </div>
              <p className="text-[11px] font-normal opacity-75">
                Agent auto-registers itself. Zero copy-paste.
              </p>
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                mode === 'manual'
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="material-symbols-outlined">edit</span>
                <span>Manual Entry</span>
              </div>
              <p className="text-[11px] font-normal opacity-75">
                Paste API URL & Key from existing agent.
              </p>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {mode === 'quick'
            ? <QuickJoinFlow onClose={onClose} onSaved={onSaved} />
            : <ManualEntryForm onClose={onClose} onSaved={onSaved} />
          }
        </div>
      </div>
    </div>
  )
}


/* ============================================================
   QUICK JOIN (NEW) — Token-based one-liner
   ============================================================ */
function QuickJoinFlow({ onClose, onSaved }) {
  // Sub-states:
  //  'form'      = user fills name & tags
  //  'waiting'   = command generated, polling for agent to join
  //  'done'      = agent reported in — success
  const [step, setStep] = useState('form')
  const [form, setForm] = useState({ name: '', tags: '', os: 'linux' })
  const [tokenData, setTokenData] = useState(null)   // { token, install_command, expires_at, ... }
  const [status, setStatus] = useState(null)         // poll status
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Generate token
  const generate = async (e) => {
    e?.preventDefault?.()
    setErr(''); setBusy(true)
    try {
      const { data } = await api.post('/servers/join-token', {
        name: form.name.trim(),
        tags: form.tags.trim(),
        os:   form.os,
      })
      setTokenData(data)
      setStep('waiting')
    } catch (e2) {
      setErr(e2.response?.data?.detail || 'Failed to create install token')
    } finally { setBusy(false) }
  }

  // Poll status every 2s while waiting
  useEffect(() => {
    if (step !== 'waiting' || !tokenData) return
    let cancelled = false
    const poll = async () => {
      try {
        const { data } = await api.get(`/servers/join-token/${tokenData.token}/status`)
        if (cancelled) return
        setStatus(data)
        if (data.status === 'registered') {
          setStep('done')
          // notify parent (without closing — let user see success)
          onSaved && onSaved({ id: data.server_id })
        }
      } catch {}
    }
    poll()
    const t = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [step, tokenData])  // eslint-disable-line

  // Countdown timer
  useEffect(() => {
    if (!tokenData?.expires_at) return
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(tokenData.expires_at).getTime() - Date.now()) / 1000))
      setSecondsLeft(left)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [tokenData])

  const copy = () => {
    navigator.clipboard.writeText(tokenData.install_command)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const fmtTime = (s) => {
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ----- STEP 1: form -----
  if (step === 'form') {
    return (
      <form onSubmit={generate} className="p-5 space-y-4">
        {err && <p className="text-danger text-sm px-3 py-2 bg-danger-light border border-danger-border rounded-lg">{err}</p>}

        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary">bolt</span>
            <p className="text-sm font-semibold text-gray-800">How it works</p>
          </div>
          <ol className="text-xs text-gray-600 space-y-1.5 ml-1 list-decimal list-inside">
            <li>Pick a name for your new server below</li>
            <li>Copy the one-liner command (next screen)</li>
            <li>Paste it on the target server's terminal</li>
            <li>Agent installs itself and auto-registers — server appears here</li>
          </ol>
        </div>

        <FormField label="Operating System" required>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'linux',   label: 'Linux',   icon: '🐧', desc: 'Ubuntu, Debian, Mint, etc.' },
              { id: 'windows', label: 'Windows', icon: '🪟', desc: 'Win 10/11, Server 2019+' },
              { id: 'macos',   label: 'macOS',   icon: '🍎', desc: 'Monterey & newer' },
            ].map(o => (
              <button
                type="button"
                key={o.id}
                onClick={() => setForm(f => ({ ...f, os: o.id }))}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  form.os === o.id
                    ? 'bg-primary/10 border-primary'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{o.icon}</span>
                  <span className={`text-sm font-semibold ${form.os === o.id ? 'text-primary' : 'text-gray-700'}`}>{o.label}</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-tight">{o.desc}</p>
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Server name" required>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={form.os === 'windows' ? 'WIN-DESKTOP-01' : form.os === 'macos' ? 'mac-mini-01' : 'web-prod-01'}
            required
            minLength={1}
            maxLength={100}
            spellCheck="false"
            autoComplete="off"
            className="input"
          />
          <p className="text-[11px] text-gray-400 mt-1">Must be unique. Use lowercase letters, digits, and dashes.</p>
        </FormField>

        <FormField label="Tags (optional, comma-separated)">
          <input
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder={form.os === 'windows' ? 'desktop, finance' : 'production, web, db'}
            className="input"
          />
        </FormField>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center">
            {busy ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Generating…</>
            ) : (
              <><span className="material-symbols-outlined text-lg">arrow_forward</span>Generate install command</>
            )}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    )
  }

  // ----- STEP 2: waiting -----
  if (step === 'waiting') {
    return (
      <div className="p-5 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-xs text-blue-900 font-semibold mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">terminal</span>
            {tokenData.os === 'windows'
              ? <>Run this in <b>PowerShell as Administrator</b> on <b>{tokenData.name}</b></>
              : tokenData.os === 'macos'
                ? <>Run this in <b>Terminal</b> on macOS host <b>{tokenData.name}</b></>
                : <>Run this on the new Linux server&nbsp;<b>{tokenData.name}</b></>
            }
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-green-300 text-xs font-mono p-3 pr-12 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
              {tokenData.install_command}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-md transition-colors"
              title="Copy"
            >
              <span className="material-symbols-outlined text-base">{copied ? 'check' : 'content_copy'}</span>
            </button>
          </div>
          <p className="text-[11px] text-blue-700 mt-2">
            Token expires in {fmtTime(secondsLeft)}. Server name reserved as <code className="bg-blue-100 px-1 rounded">{tokenData.name}</code>.
          </p>
        </div>

        {/* Waiting indicator */}
        <div className="border-2 border-dashed border-primary/40 rounded-xl p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-full mb-3">
            <span className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
          <p className="text-gray-800 font-medium text-sm">Waiting for the agent to register…</p>
          <p className="text-gray-500 text-xs mt-1">This window auto-detects when the agent reports in.</p>
          {status?.status === 'expired' && (
            <p className="text-danger text-xs mt-2 font-semibold">⚠ Token expired. Please generate a new one.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStep('form')}
            className="btn-secondary flex-1 justify-center"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Generate new token
          </button>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
      </div>
    )
  }

  // ----- STEP 3: done -----
  return (
    <div className="p-8 text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-success-light rounded-full">
        <span className="material-symbols-outlined text-success text-4xl filled">check_circle</span>
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">Server connected!</p>
        <p className="text-gray-500 text-sm mt-1">
          <b>{status?.server_name || tokenData.name}</b> is now in your fleet.
        </p>
      </div>
      {status?.api_url && (
        <p className="text-xs text-gray-400 font-mono">{status.api_url}</p>
      )}
      <div className="flex gap-2 justify-center pt-2">
        <button onClick={onClose} className="btn-primary">
          <span className="material-symbols-outlined text-lg">done</span>
          Got it
        </button>
        <button
          onClick={() => { setStep('form'); setForm({ name: '', tags: '' }); setTokenData(null); setStatus(null) }}
          className="btn-secondary"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add another
        </button>
      </div>
    </div>
  )
}


/* ============================================================
   MANUAL ENTRY (legacy fallback) — Paste API URL + Key
   ============================================================ */
function ManualEntryForm({ onClose, onSaved }) {
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
    <form onSubmit={submit} className="p-5 space-y-4">
      {err && <p className="text-danger text-sm px-3 py-2 bg-danger-light border border-danger-border rounded-lg">{err}</p>}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
        Use this when the agent is already installed on the target server. Paste its API URL & Key from the installer output (or run <code className="bg-gray-200 px-1 rounded">sudo cat /etc/secureops-agent/key</code> to retrieve later).
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Server name" required>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="web-prod-01" required className="input" />
        </FormField>
        <FormField label="Hostname (display)">
          <input value={form.hostname} onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))} placeholder="(defaults to name)" className="input" />
        </FormField>
      </div>

      <FormField label="API URL" required>
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

      <FormField label="API Key" required>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={form.api_key}
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder="43-char token from agent"
            required
            minLength={20}
            className="input font-mono text-xs pr-20"
            spellCheck="false"
            autoComplete="off"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button type="button" onClick={() => setShowKey(s => !s)} className="text-gray-400 hover:text-gray-700 p-1">
              <span className="material-symbols-outlined text-base">{showKey ? 'visibility_off' : 'visibility'}</span>
            </button>
            <button
              type="button"
              onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setForm(f => ({ ...f, api_key: t.trim() })) } catch {} }}
              className="text-gray-400 hover:text-primary p-1" title="Paste from clipboard"
            >
              <span className="material-symbols-outlined text-base">content_paste</span>
            </button>
          </div>
        </div>
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
