import { useLocation, Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const tabs = ['System Health', 'Network', 'Alerts']

const pageTitles = {
  '/dashboard':        'System Overview',
  '/permission-audit': 'Permission Audit',
  '/sudo-monitor':     'Sudo Privilege Monitor',
  '/file-integrity':   'File Integrity Monitoring',
  '/activity-logs':    'Admin Activity Logs',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('System Health')
  const [search, setSearch] = useState('')

  return (
    <header className="h-16 flex items-center gap-4 px-6 bg-white border-b border-gray-100 sticky top-0 z-20">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search logs, users, or alerts…"
          className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 pl-10 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tabs */}
      <nav className="hidden md:flex items-center gap-1">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
              activeTab === tab
                ? 'text-primary border-b-2 border-primary rounded-none pb-[13px]'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Icons */}
      <div className="flex items-center gap-2">
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 text-gray-500 transition-colors">
          <span className="material-symbols-outlined text-xl">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-white" />
        </button>
        <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 text-gray-500 transition-colors">
          <span className="material-symbols-outlined text-xl">security</span>
        </button>
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center cursor-pointer shrink-0">
          <span className="text-white text-xs font-bold">{user?.username?.slice(0,2).toUpperCase()}</span>
        </div>
      </div>
    </header>
  )
}
