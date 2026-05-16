import { useEffect, useState } from 'react'
import api from '../api/client'
import { useServers } from '../context/ServerContext'

const formatUptime = (s) => {
  if (!s) return '—'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

function Bar({ percent, danger = 75, warn = 50 }) {
  const color = percent >= danger ? 'bg-danger' : percent >= warn ? 'bg-warning' : 'bg-success'
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  )
}

function Metric({ label, value, unit, percent, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-gray-400 text-xs">{sub}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}<span className="text-base text-gray-400 ml-1">{unit}</span></p>
      {percent !== undefined && <div className="mt-3"><Bar percent={percent} /></div>}
    </div>
  )
}

export default function SystemHealth() {
  const { queryParam, selected } = useServers() || { queryParam: {} }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => api.get('/system/health', { params: queryParam })
    .then(({ data }) => { setData(data); setError(null) })
    .catch(err => setError(err.response?.data?.detail || 'Failed to load'))
    .finally(() => setLoading(false))

  useEffect(() => {
    setLoading(true)
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line
  }, [selected?.id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )

  if (error) return <div className="card p-6 text-danger text-sm">{error}</div>
  if (!data?.available) return <div className="card p-6 text-gray-500 text-sm">{data?.reason || 'System metrics unavailable'}</div>

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Live · {data.hostname} · {data.system} {data.release}
          </p>
        </div>
        <button onClick={load} className="btn-secondary">
          <span className="material-symbols-outlined text-lg">refresh</span>Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="CPU Usage"    value={data.cpu.percent} unit="%" percent={data.cpu.percent}
                sub={`${data.cpu.cores_logical} cores`} />
        <Metric label="Memory"       value={data.memory.percent} unit="%" percent={data.memory.percent}
                sub={`${data.memory.used_gb}/${data.memory.total_gb} GB`} />
        <Metric label="Disk"         value={data.disk.percent} unit="%" percent={data.disk.percent}
                sub={`${data.disk.used_gb}/${data.disk.total_gb} GB`} />
        <Metric label="Uptime"       value={formatUptime(data.uptime_seconds)} unit=""
                sub={`Since ${new Date(data.boot_time).toLocaleDateString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-gray-800 font-semibold mb-4">CPU Per Core</h3>
          <div className="space-y-2">
            {data.cpu.per_cpu.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-500 w-12">core {i}</span>
                <div className="flex-1"><Bar percent={p} /></div>
                <span className="text-xs font-mono text-gray-700 w-12 text-right">{p.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-gray-400">Load 1m</p><p className="text-lg font-bold text-gray-800">{data.cpu.load_1m}</p></div>
            <div><p className="text-xs text-gray-400">Load 5m</p><p className="text-lg font-bold text-gray-800">{data.cpu.load_5m}</p></div>
            <div><p className="text-xs text-gray-400">Load 15m</p><p className="text-lg font-bold text-gray-800">{data.cpu.load_15m}</p></div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-gray-800 font-semibold mb-4">System Info</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              <Row k="Hostname"     v={data.hostname} />
              <Row k="Platform"     v={data.platform} />
              <Row k="Architecture" v={data.architecture} />
              <Row k="Python"       v={data.python_version} />
              <Row k="Processes"    v={data.processes} />
              <Row k="Memory Total" v={`${data.memory.total_gb} GB`} />
              <Row k="Swap"         v={`${data.swap.used_gb} / ${data.swap.total_gb} GB (${data.swap.percent}%)`} />
              <Row k="Disk Free"    v={`${data.disk.free_gb} GB`} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const Row = ({ k, v }) => (
  <tr><td className="py-2 text-gray-500 text-xs uppercase tracking-wider">{k}</td><td className="py-2 text-gray-800 font-medium text-right font-mono text-xs">{v}</td></tr>
)
