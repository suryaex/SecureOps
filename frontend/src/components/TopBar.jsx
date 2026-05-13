import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const tabs = [
  { label: 'System Health', to: '/system-health' },
  { label: 'Network',       to: '/network' },
  { label: 'Alerts',        to: '/alerts' },
]

export default function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [search, setSearch] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const wrapRef = useRef(null)
  const userRef = useRef(null)
  const debounceRef = useRef(null)

  // Live debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!search.trim()) {
      setResults(null); setOpen(false); return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setOpen(true)
      try {
        const { data } = await api.get('/search', { params: { q: search.trim() } })
        setResults(data)
      } catch {
        setResults({ total: 0, logs: [], users: [], files: [], permissions: [] })
      } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  // Alert badge poll
  useEffect(() => {
    let active = true
    const load = () => api.get('/system/alerts').then(({ data }) => {
      if (active) setAlertCount(data.by_severity?.Critical + data.by_severity?.High || 0)
    }).catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => { active = false; clearInterval(t) }
  }, [])

  // Click outside to close dropdowns
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const go = (route) => {
    setOpen(false); setSearch('')
    navigate(route)
  }

  return (
    <header className="h-16 flex items-center gap-4 px-6 bg-white border-b border-gray-100 sticky top-0 z-20">
      {/* Search */}
      <div ref={wrapRef} className="relative flex-1 max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => search && setOpen(true)}
          placeholder="Search logs, users, or alerts…"
          className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 pl-10 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
        />

        {open && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden z-30 max-h-[420px] overflow-y-auto">
            {searching && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">Searching…</div>
            )}
            {!searching && results && results.total === 0 && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">No results for "{results.query}"</div>
            )}
            {!searching && results && results.total > 0 && (
              <div className="py-2">
                <SearchGroup title="Activity Logs" items={results.logs} onPick={go} icon="manage_history" />
                <SearchGroup title="Sudo Users"    items={results.users} onPick={go} icon="manage_accounts" />
                <SearchGroup title="Files"         items={results.files} onPick={go} icon="verified_user" />
                <SearchGroup title="Permissions"   items={results.permissions} onPick={go} icon="policy" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Tabs */}
      <nav className="hidden md:flex items-center gap-1">
        {tabs.map(tab => {
          const active = pathname === tab.to
          return (
            <Link
              key={tab.label}
              to={tab.to}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                active
                  ? 'text-primary border-b-2 border-primary rounded-none pb-[13px]'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* Icons */}
      <div className="flex items-center gap-2">
        <Link to="/alerts" className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 text-gray-500 transition-colors" title="Alerts">
          <span className="material-symbols-outlined text-xl">notifications</span>
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-danger rounded-full border-2 border-white text-[10px] text-white font-bold flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </Link>
        <Link to="/system-health" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-50 text-gray-500 transition-colors" title="System Health">
          <span className="material-symbols-outlined text-xl">security</span>
        </Link>

        {/* User dropdown */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUserMenu(v => !v)}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center cursor-pointer shrink-0 hover:opacity-90"
          >
            <span className="text-white text-xs font-bold">{user?.username?.slice(0,2).toUpperCase()}</span>
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-30">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-gray-900 font-semibold text-sm">{user?.username}</p>
                <p className="text-gray-400 text-xs capitalize">{user?.role} · Linux Account</p>
              </div>
              <Link to="/settings" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <span className="material-symbols-outlined text-base">settings</span> Settings
              </Link>
              <Link to="/support" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <span className="material-symbols-outlined text-base">help_outline</span> Support
              </Link>
              <button
                onClick={() => { setShowUserMenu(false); logout() }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-red-50 border-t border-gray-50"
              >
                <span className="material-symbols-outlined text-base">logout</span> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function SearchGroup({ title, items, onPick, icon }) {
  if (!items?.length) return null
  return (
    <div className="px-2 py-1">
      <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {items.map(it => (
        <button
          key={`${title}-${it.id}`}
          onClick={() => onPick(it.route)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left"
        >
          <span className="material-symbols-outlined text-base text-gray-400 shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 truncate">{it.title}</p>
            <p className="text-xs text-gray-400 truncate">{it.subtitle}</p>
          </div>
          {it.status && (
            <span className="text-[10px] uppercase tracking-wider text-gray-400 shrink-0">{it.status}</span>
          )}
        </button>
      ))}
    </div>
  )
}
