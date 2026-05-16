import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useServers } from '../context/ServerContext'
import api from '../api/client'

const bar = (p) => `${Math.min(100, Math.max(0, p || 0))}%`
const barColor = (p) => p >= 85 ? 'bg-danger' : p >= 65 ? 'bg-warning' : 'bg-success'

export default function Fleet() {
  const navigate = useNavigate()
  const { select } = useServers() || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => api.get('/system/fleet').then(({ data }) => setData(data)).finally(() => setLoading(false))

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )

  const pickServer = (id) => {
    select && select(id)
    navigate('/system-health')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fleet Overview</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data.online}/{data.total} servers online · auto-refresh every 10s
          </p>
        </div>
        <button onClick={load} className="btn-secondary">
          <span className="material-symbols-outlined text-lg">refresh</span>Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.servers.map(s => (
          <div
            key={s.server_id}
            onClick={() => pickServer(s.server_id)}
            className={`card p-5 cursor-pointer hover:shadow-md transition-all border-l-4 ${
              s.ok ? 'border-success' : 'border-danger'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-gray-800 font-semibold text-sm flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                  {s.server}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">{s.hostname || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                s.ok ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
              }`}>
                {s.ok ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            {s.ok ? (
              <div className="space-y-2.5 mt-3">
                <Metric label="CPU"    pct={s.cpu} />
                <Metric label="Memory" pct={s.memory} />
                <Metric label="Disk"   pct={s.disk} />
              </div>
            ) : (
              <p className="text-xs text-danger mt-3 truncate">{s.error || 'Unreachable'}</p>
            )}

            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-primary font-medium flex items-center gap-1">
              View details
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, pct }) {
  const p = pct ?? 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-bold text-gray-700">{p.toFixed?.(1) ?? p}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${barColor(p)}`} style={{ width: bar(p) }} />
      </div>
    </div>
  )
}
