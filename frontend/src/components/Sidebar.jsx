import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/dashboard',        icon: 'grid_view',              label: 'Dashboard' },
  { to: '/permission-audit', icon: 'policy',                 label: 'Audit' },
  { to: '/sudo-monitor',     icon: 'manage_accounts',        label: 'Sudo' },
  { to: '/file-integrity',   icon: 'verified_user',          label: 'Integrity' },
  { to: '/activity-logs',    icon: 'manage_history',         label: 'Logs' },
]

const bottomItems = [
  { icon: 'settings', label: 'Settings' },
  { icon: 'help_outline', label: 'Support' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white shadow-sidebar border-r border-gray-100 flex flex-col z-30">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <span className="material-symbols-outlined text-white text-lg" style={{fontVariationSettings:"'FILL' 1"}}>shield</span>
          </div>
          <div>
            <p className="text-gray-900 font-bold text-sm leading-tight">SecureOps</p>
            <p className="text-gray-400 text-xs leading-tight mt-0.5">State Polytechnic of Sriwijaya</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {icon}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3 space-y-0.5">
        {bottomItems.map(({ icon, label }) => (
          <button
            key={label}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all duration-150"
          >
            <span className="material-symbols-outlined text-xl">{icon}</span>
            {label}
          </button>
        ))}

        {/* User row */}
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl hover:bg-gray-50 transition-colors cursor-default">
          <div className="avatar bg-primary text-xs shrink-0">
            {user?.username?.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-800 text-xs font-semibold truncate">{user?.username}</p>
            <p className="text-gray-400 text-xs capitalize">{user?.role}</p>
          </div>
          <button onClick={logout} title="Logout" className="text-gray-300 hover:text-danger transition-colors">
            <span className="material-symbols-outlined text-base">logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
