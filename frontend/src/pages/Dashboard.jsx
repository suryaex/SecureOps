import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import api from '../api/client'

const SEV_COLORS = { Critical: '#DC2626', High: '#D97706', Medium: '#EAB308', Low: '#2563EB' }

const DUMMY_BAR = [
  { t: '00:00', v: 12 }, { t: '04:00', v: 18 }, { t: '08:00', v: 35 },
  { t: '12:00', v: 52 }, { t: '16:00', v: 28 }, { t: '20:00', v: 41 },
]

const ACTION_COLORS = {
  'Login': 'bg-blue-50 text-blue-700',
  'Permission Scan': 'bg-amber-50 text-amber-700',
  'Sudo Scan': 'bg-purple-50 text-purple-700',
  'File Integrity Scan': 'bg-teal-50 text-teal-700',
  'Add Monitored File': 'bg-green-50 text-green-700',
  'Login Failed': 'bg-red-50 text-red-600',
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-orange-500', 'bg-pink-500', 'bg-cyan-500',
]

function StatCard({ icon, iconColor, label, value, valueColor, sub, subColor, badge }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}`}>
          <span className="material-symbols-outlined text-xl" style={{fontVariationSettings:"'FILL' 1"}}>{icon}</span>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <p className={`text-3xl font-bold tracking-tight ${valueColor || 'text-gray-900'}`}>{value}</p>
        {badge && (
          <span className="mb-0.5 inline-flex items-center gap-1 px-2 py-0.5 bg-danger-light text-danger border border-danger-border rounded-full text-xs font-semibold">
            <span className="material-symbols-outlined text-xs">warning</span>
            {badge}
          </span>
        )}
        {sub && !badge && <p className={`mb-0.5 text-sm ${subColor || 'text-gray-500'}`}>{sub}</p>}
      </div>
    </div>
  )
}

function ActivityRow({ log, idx }) {
  const initials = log.admin_username?.slice(0, 2).toUpperCase() || 'AD'
  const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length]
  const actionClass = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'
  const timeStr = log.timestamp
    ? (() => {
        const diff = Date.now() - new Date(log.timestamp).getTime()
        const m = Math.floor(diff / 60000)
        if (m < 60) return `${m || 1} minute${m !== 1 ? 's' : ''} ago`
        const h = Math.floor(m / 60)
        if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`
        return `${Math.floor(h / 24)} day(s) ago`
      })()
    : '—'

  return (
    <tr className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className={`avatar ${avatarColor}`}>{initials}</div>
          <span className="text-gray-800 text-sm font-medium">{log.admin_username}</span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className={`action-tag ${actionClass}`}>{log.action}</span>
      </td>
      <td className="px-4 py-3.5 text-gray-500 text-sm">{timeStr}</td>
      <td className="px-4 py-3.5 font-mono text-gray-500 text-xs">{log.ip_address}</td>
    </tr>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats').then(({ data }) => setStats(data)).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const pieData = stats
    ? Object.entries(stats.severity_breakdown).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Overview</h1>
          <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-primary">sync</span>
            Last updated: Just now
          </p>
        </div>
        <button className="btn-secondary">
          <span className="material-symbols-outlined text-lg">download</span>
          Download Report
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="folder_open" iconColor="bg-blue-50 text-blue-500"
          label="Total Sudo Files" value={stats?.total_risky_files ?? 0}
          badge={`Critical: ${stats?.critical_files ?? 0}`}
        />
        <StatCard
          icon="manage_accounts" iconColor="bg-teal-50 text-teal-500"
          label="Sudo Users" value={stats?.sudo_users_count ?? 0}
          sub="active"
        />
        <StatCard
          icon="verified_user" iconColor="bg-green-50 text-green-500"
          label="Integrity Status"
          value={stats?.integrity_status ?? '—'}
          valueColor={stats?.integrity_status === 'Secure' ? 'text-success' : 'text-danger'}
        />
        <StatCard
          icon="notifications_active" iconColor="bg-orange-50 text-orange-500"
          label="New Alerts" value={stats?.new_alerts ?? 0}
          valueColor={stats?.new_alerts > 0 ? 'text-warning' : 'text-gray-900'}
          sub={stats?.new_alerts > 0 ? 'action needed' : 'all clear'}
          subColor={stats?.new_alerts > 0 ? 'text-warning' : 'text-success'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Donut chart */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-gray-800 font-semibold text-base mb-4">Severity Level Distribution</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={62} outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={SEV_COLORS[entry.name] || '#94A3B8'} />
                  ))}
                </Pie>
                <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
                  className="font-bold" style={{ fontSize: 22, fontWeight: 700, fill: '#111827' }}>
                  {pieData.reduce((s, d) => s + d.value, 0) || 114}
                </text>
                <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: 10, fill: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Issues
                </text>
                <Tooltip
                  formatter={(v, n) => [`${v}%`, n]}
                  contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #E5E7EB' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={v => <span style={{ color: '#6B7280', fontSize: 12 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
              No scan data — run a scan first
            </div>
          )}
        </div>

        {/* Bar chart */}
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-800 font-semibold text-base">System Scan Activity (24 Hours)</h2>
            <div className="flex gap-1">
              <button className="px-3 py-1 text-xs font-semibold bg-primary text-white rounded-lg">Today</button>
              <button className="px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">7 Days</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={DUMMY_BAR} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#F1F5F9' }}
                contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #E5E7EB' }}
              />
              <Bar dataKey="v" name="Scans" radius={[6, 6, 0, 0]}
                fill="#93C5FD"
                label={false}
              >
                {DUMMY_BAR.map((entry, i) => (
                  <Cell key={i} fill={
                    entry.v >= 50 ? '#DC2626' :
                    entry.v >= 35 ? '#D97706' :
                    '#93C5FD'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-gray-800 font-semibold">Recent Activity</h2>
          <Link to="/activity-logs" className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
            View All Logs
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </Link>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              {['Admin', 'Action', 'Time', 'IP Address'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats?.recent_activities?.length ? (
              stats.recent_activities.map((log, i) => <ActivityRow key={log.id} log={log} idx={i} />)
            ) : (
              <tr>
                <td colSpan={4} className="text-center py-10 text-gray-400">
                  No activity yet — login and run scans to populate
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
