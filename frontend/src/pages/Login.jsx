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
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #C7D9F8 0%, #DCE8FF 30%, #E8E4FF 60%, #D6E4FF 100%)',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Logo header area */}
          <div
            className="flex flex-col items-center pt-10 pb-8 px-8"
            style={{
              background: 'radial-gradient(ellipse at 50% 0%, #DBEAFE 0%, #F0F4FF 60%, white 100%)',
            }}
          >
            <div className="relative mb-5">
              <div className="absolute inset-0 scale-150 rounded-full bg-blue-100/60 blur-xl" />
              <div className="relative w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-md">
                <span
                  className="material-symbols-outlined text-white text-3xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  shield
                </span>
              </div>
            </div>
            <h1 className="text-gray-900 text-2xl font-bold tracking-tight">SecureOps</h1>
            <p className="text-gray-500 text-sm mt-1">State Polytechnic of Sriwijaya</p>
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
                <label className="text-gray-700 text-sm font-medium mb-1.5 block">Username</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xl">person</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="Enter your username"
                    required
                    className="input pl-11"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-700 text-sm font-medium">Password</label>
                  <button type="button" className="text-primary text-xs font-semibold hover:underline">
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xl">key</span>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Enter your password"
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
              <span className="material-symbols-outlined text-sm">lock</span>
              Protected by End-to-End Encryption
            </div>

            <p className="text-center text-gray-300 text-xs mt-3">
              Demo: <span className="text-gray-400">admin / Admin@123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
