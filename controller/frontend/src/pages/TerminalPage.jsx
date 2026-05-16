import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

import { useAuth } from '../context/AuthContext'
import { useServers } from '../context/ServerContext'
import { apiBaseURL } from '../api/client'

/**
 * Live SSH-like terminal page (admin only).
 *
 * Browser <-WS-> Controller <-WS-> Agent <-PTY-> /bin/bash
 * Server is chosen via the top-bar server selector (ServerContext).
 */
const THEME = {
  background: '#0B0F19',
  foreground: '#E5E7EB',
  cursor:     '#60A5FA',
  cursorAccent: '#0B0F19',
  selectionBackground: 'rgba(96,165,250,0.30)',
  black: '#111827',   red: '#F87171',     green: '#34D399',
  yellow: '#FBBF24',  blue: '#60A5FA',    magenta: '#C084FC',
  cyan: '#22D3EE',    white: '#F3F4F6',   brightBlack: '#374151',
  brightRed: '#FCA5A5', brightGreen: '#6EE7B7', brightYellow: '#FCD34D',
  brightBlue: '#93C5FD', brightMagenta: '#D8B4FE', brightCyan: '#67E8F9',
  brightWhite: '#FFFFFF',
}

function wsURL(serverId, token) {
  const base = apiBaseURL || ''                                 // e.g. "/api"  or  "https://x/api"
  // Strip trailing /api and convert http→ws
  const root = base.replace(/\/api\/?$/, '')
  let absolute = root
  if (!/^https?:\/\//.test(root)) {
    // relative path → use window.location
    absolute = `${window.location.protocol}//${window.location.host}${root}`
  }
  const wsRoot = absolute.replace(/^http/, 'ws')
  return `${wsRoot}/api/terminal/${serverId}/ws?token=${encodeURIComponent(token)}`
}

export default function TerminalPage() {
  const { user } = useAuth()
  const { selected, servers } = useServers() || {}
  const isAdmin = user?.role === 'admin'

  const wrapRef = useRef(null)
  const termRef = useRef(null)
  const fitRef  = useRef(null)
  const wsRef   = useRef(null)

  const [status, setStatus] = useState('idle')  // idle | connecting | connected | error | closed
  const [error,  setError]  = useState('')
  const [showVirtualKeys, setShowVirtualKeys] = useState(
    typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)
  )
  const [ctrlSticky, setCtrlSticky] = useState(false)

  const cleanup = () => {
    try { wsRef.current?.close() } catch {}
    try { termRef.current?.dispose() } catch {}
    wsRef.current = null
    termRef.current = null
    fitRef.current = null
  }

  const connect = () => {
    if (!selected || selected.is_local) {
      setStatus('error'); setError('Pick a remote agent server (not "controller") from the top-bar selector first.')
      return
    }
    if (!isAdmin) {
      setStatus('error'); setError('Terminal access requires admin role.')
      return
    }

    cleanup()
    const token = localStorage.getItem('token') || ''

    // Build terminal
    const term = new Terminal({
      theme: THEME,
      fontFamily: '"SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(wrapRef.current)
    requestAnimationFrame(() => {
      try { fit.fit() } catch {}
    })

    termRef.current = term
    fitRef.current  = fit

    term.writeln(`\x1b[1;36m  SecureOps Terminal\x1b[0m`)
    term.writeln(`\x1b[90m  Connecting to ${selected.name} (${selected.hostname})…\x1b[0m\r\n`)

    const ws = new WebSocket(wsURL(selected.id, token))
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    setStatus('connecting'); setError('')

    ws.onopen = () => {
      setStatus('connected')
      // Send initial size
      try {
        ws.send(JSON.stringify({ resize: [term.cols, term.rows] }))
      } catch {}
    }
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') term.write(e.data)
      else                            term.write(new Uint8Array(e.data))
    }
    ws.onerror = () => {
      setStatus('error'); setError('Connection failed. Check that the agent is online.')
    }
    ws.onclose = (e) => {
      setStatus('closed')
      term.writeln(`\r\n\x1b[33m  Session closed (code ${e.code}${e.reason ? ' · ' + e.reason : ''}).\x1b[0m`)
    }

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ resize: [cols, rows] }))
    })

    // Auto-fit on window resize
    const onResize = () => {
      try {
        fit.fit()
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ resize: [term.cols, term.rows] }))
      } catch {}
    }
    window.addEventListener('resize', onResize)
    term._cleanupResize = () => window.removeEventListener('resize', onResize)
  }

  const disconnect = () => {
    setStatus('closed')
    try { wsRef.current?.close() } catch {}
  }

  // Send raw input bytes (used by virtual keys)
  const send = (str) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(str)
    termRef.current?.focus()
  }

  // Ctrl-modified character (e.g. Ctrl+C → 0x03)
  const sendCtrl = (ch) => {
    const c = ch.toUpperCase().charCodeAt(0)
    if (c >= 64 && c <= 95) send(String.fromCharCode(c - 64))
  }

  // Tap-to-fire keys with optional sticky Ctrl
  const tapKey = (val) => {
    if (ctrlSticky && /^[a-zA-Z]$/.test(val)) {
      sendCtrl(val); setCtrlSticky(false); return
    }
    send(val)
  }

  // Auto-connect when the selected server changes
  useEffect(() => {
    if (selected && !selected.is_local && isAdmin) connect()
    return () => cleanup()
    // eslint-disable-next-line
  }, [selected?.id])

  if (!isAdmin) {
    return (
      <div className="card p-10 text-center">
        <span className="material-symbols-outlined text-6xl text-warning filled">lock</span>
        <h2 className="text-xl font-bold text-ink mt-3">Admin Access Required</h2>
        <p className="text-ink-muted text-sm mt-1">
          Terminal access is restricted to admin role for safety.
        </p>
      </div>
    )
  }

  const dotColor =
    status === 'connected'  ? 'bg-success animate-pulse' :
    status === 'connecting' ? 'bg-warning animate-pulse' :
    status === 'error'      ? 'bg-danger' :
                              'bg-outline-variant'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="h-page">SSH Terminal</h1>
          <p className="text-ink-muted text-sm mt-0.5 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span>{status}</span>
            {selected && <span className="text-outline">·</span>}
            {selected && <span>Connected to <b className="text-ink">{selected.name}</b> ({selected.hostname})</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowVirtualKeys(v => !v)}
            className="btn-secondary"
            title="Toggle virtual keys (useful on touch screens)"
          >
            <span className="material-symbols-outlined text-lg">keyboard</span>
            Keys
          </button>
          <Link to="/recordings" className="btn-secondary" title="Session recordings">
            <span className="material-symbols-outlined text-lg">history</span>
            Replays
          </Link>
          {status === 'connected' ? (
            <button onClick={disconnect} className="btn-danger">
              <span className="material-symbols-outlined text-lg">stop_circle</span>
              Disconnect
            </button>
          ) : (
            <button onClick={connect} className="btn-primary">
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              {status === 'closed' || status === 'error' ? 'Reconnect' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Pick server hint */}
      {(!selected || selected.is_local) && (
        <div className="card p-4 border-l-4 border-warning flex items-start gap-3">
          <span className="material-symbols-outlined text-warning text-xl mt-0.5">info</span>
          <div className="text-sm">
            <p className="text-ink font-medium">Pick a remote server</p>
            <p className="text-ink-muted mt-0.5">
              Use the top-bar server selector to choose an agent. The local controller does not expose a terminal endpoint over this proxy — SSH into it directly instead.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="card p-4 border-l-4 border-danger flex items-start gap-3">
          <span className="material-symbols-outlined text-danger text-xl mt-0.5">error</span>
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {/* Audit banner */}
      <div className="card p-3 flex items-center gap-3 border-l-4 border-primary text-xs">
        <span className="material-symbols-outlined text-primary text-base filled">fiber_manual_record</span>
        <span className="text-ink-muted">
          <b className="text-ink">Session is audited</b> — every connection (open/close) is recorded in Activity Logs with your username, source IP, and duration.
        </span>
      </div>

      {/* Terminal */}
      <div
        className="rounded-lg overflow-hidden border border-black/10"
        style={{
          background: '#0B0F19',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-black/30">
          <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
          <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
          <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
          <span className="text-white/50 text-xs font-mono ml-3">
            {selected ? `${user?.username}@${selected.name}` : 'no server selected'}
          </span>
        </div>
        <div
          ref={wrapRef}
          style={{ height: '60vh', minHeight: 420, padding: '12px 14px' }}
        />
        {showVirtualKeys && (
          <VirtualKeys
            send={send}
            sendCtrl={sendCtrl}
            ctrlSticky={ctrlSticky}
            toggleCtrl={() => setCtrlSticky(s => !s)}
            tapKey={tapKey}
            disconnect={disconnect}
            connected={status === 'connected'}
          />
        )}
      </div>
    </div>
  )
}

/** Virtual keyboard toolbar — essential keys missing from mobile keyboards. */
function VirtualKeys({ send, sendCtrl, ctrlSticky, toggleCtrl, tapKey, disconnect, connected }) {
  const Btn = ({ children, onPress, sticky, danger, wide }) => (
    <button
      onMouseDown={(e) => { e.preventDefault(); onPress() }}
      onTouchStart={(e) => { e.preventDefault(); onPress() }}
      className={`select-none ${wide ? 'px-3' : 'px-2.5'} h-9 rounded-md text-[12px] font-mono font-semibold transition-colors
        ${sticky
          ? 'bg-primary text-white shadow-[0_0_0_2px_rgba(0,122,255,0.4)]'
          : danger
          ? 'bg-red-900/40 text-red-200 hover:bg-red-900/60'
          : 'bg-white/8 text-white/90 hover:bg-white/15'}`}
    >
      {children}
    </button>
  )
  return (
    <div className="border-t border-white/10 bg-black/40 px-3 py-2 flex flex-wrap items-center gap-1.5">
      <Btn onPress={() => send('\x1b')}>Esc</Btn>
      <Btn onPress={() => send('\t')}>Tab</Btn>
      <Btn onPress={toggleCtrl} sticky={ctrlSticky}>Ctrl</Btn>
      <Btn onPress={() => sendCtrl('C')} danger>^C</Btn>
      <Btn onPress={() => sendCtrl('D')}>^D</Btn>
      <Btn onPress={() => sendCtrl('L')}>^L</Btn>
      <Btn onPress={() => sendCtrl('Z')}>^Z</Btn>
      <Btn onPress={() => sendCtrl('R')}>^R</Btn>
      <div className="w-px h-6 bg-white/10 mx-1" />
      <Btn onPress={() => send('\x1b[A')}>↑</Btn>
      <Btn onPress={() => send('\x1b[B')}>↓</Btn>
      <Btn onPress={() => send('\x1b[D')}>←</Btn>
      <Btn onPress={() => send('\x1b[C')}>→</Btn>
      <Btn onPress={() => send('\x1b[H')}>Home</Btn>
      <Btn onPress={() => send('\x1b[F')}>End</Btn>
      <div className="w-px h-6 bg-white/10 mx-1" />
      <Btn onPress={() => send('|')}>|</Btn>
      <Btn onPress={() => send('~')}>~</Btn>
      <Btn onPress={() => send('/')}>/</Btn>
      <Btn onPress={() => send('-')}>-</Btn>
      <div className="flex-1" />
      {connected && (
        <button
          onClick={disconnect}
          className="px-3 h-9 rounded-md bg-red-600/80 text-white text-[12px] font-semibold hover:bg-red-600 transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined" style={{fontSize:16}}>logout</span>
          Exit
        </button>
      )}
    </div>
  )
}
