import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

import { useAuth } from '../context/AuthContext'
import { useServers } from '../context/ServerContext'
import api from '../api/client'

/**
 * Recorded session browser + replay.
 *
 * Fetches /api/terminal/{server_id}/recordings from the agent, lets admin
 * pick one, downloads the .cast file, and replays via xterm.js with timing
 * preserved (asciinema v2 format).
 */
const THEME = {
  background: '#0B0F19', foreground: '#E5E7EB',
  cursor: '#60A5FA', cursorAccent: '#0B0F19',
  black: '#111827', red: '#F87171', green: '#34D399',
  yellow: '#FBBF24', blue: '#60A5FA', magenta: '#C084FC',
  cyan: '#22D3EE', white: '#F3F4F6',
}

const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(1)} MB`
const fmtTime = (mtime) => new Date(mtime * 1000).toLocaleString()
const fmtDur  = (s) => {
  if (s < 60) return `${s.toFixed(1)}s`
  if (s < 3600) return `${Math.floor(s/60)}m ${Math.floor(s%60)}s`
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
}

export default function Recordings() {
  const { user } = useAuth()
  const { selected, servers } = useServers() || {}
  const isAdmin = user?.role === 'admin'

  const [recordings, setRecordings] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [active,     setActive]     = useState(null)
  const [speed,      setSpeed]      = useState(1)
  const [playing,    setPlaying]    = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [duration,   setDuration]   = useState(0)

  const wrapRef  = useRef(null)
  const termRef  = useRef(null)
  const playRef  = useRef({ stop: false })

  const load = async () => {
    if (!selected || selected.is_local) return
    setLoading(true); setRecordings([])
    try {
      const { data } = await api.get(`/terminal/${selected.id}/recordings`)
      setRecordings(data.recordings || [])
    } catch (e) {
      setRecordings([])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [selected?.id])  // eslint-disable-line

  const cleanup = () => {
    playRef.current.stop = true
    try { termRef.current?.dispose() } catch {}
    termRef.current = null
  }

  const replay = async (rec) => {
    cleanup()
    setActive(rec); setProgress(0); setDuration(0); setPlaying(true)

    const term = new Terminal({
      theme: THEME,
      fontFamily: '"SF Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: false,
      scrollback: 5000,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(wrapRef.current)
    requestAnimationFrame(() => { try { fit.fit() } catch {} })
    termRef.current = term

    // Fetch .cast file
    let text
    try {
      const res = await api.get(`/terminal/${selected.id}/recordings/${rec.name}`, { responseType: 'text', transformResponse: x => x })
      text = res.data
    } catch (e) {
      term.write(`\x1b[31m[error] cannot load recording: ${e.message}\x1b[0m\r\n`)
      setPlaying(false); return
    }

    const lines = text.split('\n').filter(Boolean)
    if (lines.length < 2) {
      term.write('\x1b[33m(empty recording)\x1b[0m')
      setPlaying(false); return
    }

    // Header
    let header = {}
    try { header = JSON.parse(lines[0]) } catch {}
    if (header.width && header.height) term.resize(header.width, header.height)

    // Find total duration (last event)
    let total = 0
    for (let i = lines.length - 1; i > 0; i--) {
      try { total = JSON.parse(lines[i])[0]; break } catch {}
    }
    setDuration(total)

    // Play
    playRef.current = { stop: false }
    const startWall = performance.now()
    for (let i = 1; i < lines.length; i++) {
      if (playRef.current.stop) break
      let ev
      try { ev = JSON.parse(lines[i]) } catch { continue }
      const [t, kind, data] = ev

      const targetWall = startWall + (t * 1000) / speed
      const wait = targetWall - performance.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      if (playRef.current.stop) break

      if (kind === 'o') term.write(data)        // skip input frames in replay
      setProgress(t)
    }
    setPlaying(false)
    setProgress(total)
  }

  const stopReplay = () => { playRef.current.stop = true; setPlaying(false) }

  const downloadCast = (rec) => {
    const url = `${api.defaults.baseURL}/terminal/${selected.id}/recordings/${rec.name}`
    const token = localStorage.getItem('token')
    // Use fetch with auth header, then create blob URL
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = rec.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      })
  }

  if (!isAdmin) {
    return (
      <div className="card p-10 text-center">
        <span className="material-symbols-outlined text-6xl text-warning filled">lock</span>
        <h2 className="text-xl font-bold text-ink mt-3">Admin Access Required</h2>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h-page">Session Replays</h1>
        <p className="text-ink-muted text-sm mt-0.5">
          {selected && !selected.is_local
            ? <>Recorded terminal sessions on <b className="text-ink">{selected.name}</b></>
            : 'Pick a remote agent from the top-bar selector.'}
        </p>
      </div>

      {(!selected || selected.is_local) ? (
        <div className="card p-4 border-l-4 border-warning flex items-start gap-3">
          <span className="material-symbols-outlined text-warning text-xl mt-0.5">info</span>
          <p className="text-sm text-ink-muted">Session recordings live on each agent. Use the top-bar to pick a remote server.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/30 flex items-center justify-between">
              <h3 className="h-card">Available recordings ({recordings.length})</h3>
              <button onClick={load} className="btn-ghost">
                <span className="material-symbols-outlined text-base">refresh</span>Refresh
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-white/20">
              {loading ? (
                <div className="p-8 text-center">
                  <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin inline-block" />
                </div>
              ) : recordings.length === 0 ? (
                <div className="p-10 text-center text-ink-muted text-sm">
                  No recordings yet.<br />
                  <span className="text-xs">
                    Enable on the agent: <code className="bg-black/5 px-1.5 py-0.5 rounded font-mono">SECUREOPS_RECORD_SESSIONS=1</code>
                  </span>
                </div>
              ) : recordings.map(r => (
                <div key={r.name} className="flex items-center gap-4 px-5 py-3 hover:bg-primary/5 cursor-pointer"
                     onClick={() => replay(r)}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active?.name === r.name ? 'bg-primary text-white' : 'bg-black/5 text-ink-muted'}`}>
                    <span className="material-symbols-outlined text-lg filled">play_circle</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-medium text-sm font-mono truncate">{r.name}</p>
                    <p className="text-ink-muted text-xs">{fmtTime(r.mtime)} · {fmtSize(r.size)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); downloadCast(r) }}
                          className="btn-ghost" title="Download .cast">
                    <span className="material-symbols-outlined text-base">download</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Player */}
          {active && (
            <div className="rounded-lg overflow-hidden border border-black/10"
                 style={{ background: '#0B0F19', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-black/30">
                <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
                <span className="text-white/50 text-xs font-mono ml-3">{active.name}</span>
                <div className="flex-1" />
                <span className="text-white/40 text-xs font-mono">{fmtDur(progress)} / {fmtDur(duration)}</span>
              </div>
              <div ref={wrapRef} style={{ height: '55vh', minHeight: 380, padding: '12px 14px' }} />
              {/* Controls */}
              <div className="px-4 py-3 border-t border-white/10 bg-black/40 flex items-center gap-3">
                {playing ? (
                  <button onClick={stopReplay} className="btn-danger">
                    <span className="material-symbols-outlined text-base">stop</span>Stop
                  </button>
                ) : (
                  <button onClick={() => replay(active)} className="btn-primary">
                    <span className="material-symbols-outlined text-base">replay</span>Replay
                  </button>
                )}
                <div className="flex items-center gap-1">
                  {[0.5, 1, 2, 4, 8].map(s => (
                    <button key={s} onClick={() => setSpeed(s)}
                            className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors ${
                              speed === s ? 'bg-primary text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
                            }`}>
                      {s}×
                    </button>
                  ))}
                </div>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all"
                       style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
