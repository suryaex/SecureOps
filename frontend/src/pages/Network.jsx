import { useEffect, useState } from 'react'
import api from '../api/client'

export default function Network() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => api.get('/system/network')
    .then(({ data }) => setData(data))
    .finally(() => setLoading(false))

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )

  if (!data?.available) return <div className="card p-6 text-gray-500 text-sm">{data?.reason || 'Network metrics unavailable'}</div>

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Network Status</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live network interfaces & traffic on {data.hostname}</p>
        </div>
        <button onClick={load} className="btn-secondary">
          <span className="material-symbols-outlined text-lg">refresh</span>Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Bytes Sent"     value={`${data.total.bytes_sent_mb.toLocaleString()} MB`} icon="upload"   color="text-blue-500 bg-blue-50" />
        <Stat label="Bytes Received" value={`${data.total.bytes_recv_mb.toLocaleString()} MB`} icon="download" color="text-emerald-500 bg-emerald-50" />
        <Stat label="Packets In"     value={data.total.packets_recv.toLocaleString()}          icon="south"    color="text-violet-500 bg-violet-50" />
        <Stat label="Errors"         value={data.total.errin + data.total.errout}              icon="error"    color={data.total.errin + data.total.errout > 0 ? 'text-danger bg-danger-light' : 'text-gray-400 bg-gray-50'} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-gray-800 font-semibold">Network Interfaces ({data.interfaces.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>{['Interface', 'IPv4', 'MAC', 'Status', 'Speed', 'Sent', 'Received'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.interfaces.map(i => (
                <tr key={i.name}>
                  <td className="font-mono text-sm font-medium text-gray-800">{i.name}</td>
                  <td className="font-mono text-xs text-gray-600">{i.ipv4 || '—'}</td>
                  <td className="font-mono text-xs text-gray-500">{i.mac || '—'}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      i.is_up ? 'bg-success-light text-success border-success-border' : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${i.is_up ? 'bg-success' : 'bg-gray-400'}`} />
                      {i.is_up ? 'UP' : 'DOWN'}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">{i.speed_mbps > 0 ? `${i.speed_mbps} Mbps` : '—'}</td>
                  <td className="text-xs text-gray-700 font-mono">{i.bytes_sent_mb} MB</td>
                  <td className="text-xs text-gray-700 font-mono">{i.bytes_recv_mb} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-gray-800 font-semibold">Listening Ports ({data.listening_ports.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>{['Protocol', 'Address', 'Port', 'PID'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.listening_ports.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">No listening ports visible (try running backend with sudo to enumerate)</td></tr>
              ) : data.listening_ports.map((p, i) => (
                <tr key={i}>
                  <td><span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-bold">{p.type}</span></td>
                  <td className="font-mono text-xs text-gray-600">{p.ip || '—'}</td>
                  <td className="font-mono text-sm font-bold text-primary">{p.port}</td>
                  <td className="font-mono text-xs text-gray-500">{p.pid || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const Stat = ({ label, value, icon, color }) => (
  <div className="stat-card">
    <div className="flex items-center justify-between">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{icon}</span>
      </div>
    </div>
    <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
  </div>
)
