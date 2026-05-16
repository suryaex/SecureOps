import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #ADC6FF 0%, #D8E2FF 30%, #F1F3FE 60%, #E6E8F3 100%)',
      }}
    >
      {/* Floating orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-32 w-[28rem] h-[28rem] rounded-full bg-primary-fixed/40 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-white/30 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 animate-slide-up">
        <div className="glass rounded-2xl overflow-hidden">
          {/* Logo header area */}
          <div className="flex flex-col items-center pt-10 pb-8 px-8 bg-white/30 border-b border-white/30">
            <div className="relative mb-5">
              <div className="absolute inset-0 scale-150 rounded-full bg-primary/20 blur-xl" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary to-primary-dark rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(0,122,255,0.4)]">
                <span className="material-symbols-outlined text-white text-3xl filled">shield</span>
              </div>
            </div>
            <h1 className="text-ink text-2xl font-bold tracking-tightest">SecureOps</h1>
            <p className="text-ink-muted text-sm mt-1">State Polytechnic of Sriwijaya</p>
          </div>

          {/* Form */}
          <div className="px-8 pb-8 pt-6">
            {error && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-danger-light border border-danger-border rounded-xl">
                <span className="material-symbols-outlined text-danger text-base shrink-0">error</span>
                <p className="text-danger text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="text-gray-700 text-sm font-medium mb-1.5 block">Linux Username</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xl">person</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="e.g. superadmin, root"
                    autoComplete="username"
                    spellCheck="false"
                    autoCapitalize="off"
                    required
                    className="input pl-11"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-700 text-sm font-medium">Linux Password</label>
                  <span className="text-gray-400 text-xs">Use `passwd` on server</span>
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xl">key</span>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Your OS account password"
                    autoComplete="current-password"
                    required
                    className="input pl-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPw ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center py-3 mt-2 rounded-xl text-base"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-center gap-2 mt-8 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              Authenticated via Linux PAM
            </div>

            <p className="text-center text-gray-300 text-[11px] mt-3 leading-relaxed">
              Sign in with your real OS account.<br/>
              <span className="text-gray-400">sudo / wheel members → admin role</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
