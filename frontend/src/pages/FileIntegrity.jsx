import { useEffect, useState } from 'react'
import api from '../api/client'

const STATUS_BADGE = { safe: 'badge-safe', modified: 'badge-modified', missing: 'badge-missing' }
const STATUS_ICON  = { safe: 'check_circle', modified: 'edit_note', missing: 'error' }
const STATUS_COLOR = { safe: 'text-success', modified: 'text-danger', missing: 'text-warning' }

export default function FileIntegrity() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [newFile, setNewFile] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const fetchFiles = () => {
    setLoading(true)
    api.get('/file-integrity/files').then(({ data }) => setFiles(data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchFiles() }, [])

  const runScan = async () => {
    setScanning(true)
    setResult(null)
    try {
      const { data } = await api.post('/file-integrity/scan')
      setResult(data)
      fetchFiles()
    } finally {
      setScanning(false)
    }
  }

  const addFile = async (e) => {
    e.preventDefault()
    if (!newFile.trim()) return
    setAdding(true)
    setAddError('')
    try {
      await api.post('/file-integrity/add', { filename: newFile.trim() })
      setNewFile('')
      fetchFiles()
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Failed to add file')
    } finally {
      setAdding(false)
    }
  }

  const safe     = files.filter(f => f.status === 'safe').length
  const modified = files.filter(f => f.status === 'modified').length
  const missing  = files.filter(f => f.status === 'missing').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">File Integrity Monitoring</h1>
          <p className="text-gray-500 text-sm mt-0.5">SHA256 hash verification for critical system files</p>
        </div>
        <button onClick={runScan} disabled={scanning} className="btn-primary">
          {scanning ? (
            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Checking…</>
          ) : (
            <><span className="material-symbols-outlined text-xl">find_in_page</span>Scan Now</>
          )}
        </button>
      </div>

      {/* Alert banner */}
      {(modified > 0 || missing > 0) && (
        <div className="card p-4 border-l-4 border-danger flex items-start gap-3">
          <span className="material-symbols-outlined text-danger text-2xl mt-0.5" style={{fontVariationSettings:"'FILL' 1"}}>warning</span>
          <div>
            <p className="text-gray-800 font-semibold text-sm">Integrity Alert Detected</p>
            <p className="text-gray-500 text-xs mt-0.5">
              {modified} file(s) modified · {missing} file(s) missing — immediate review required
            </p>
          </div>
        </div>
      )}

      {result && (
        <div className="card p-4 flex items-center gap-3 border-l-4 border-success">
          <span className="material-symbols-outlined text-success text-xl" style={{fontVariationSettings:"'FILL' 1"}}>check_circle</span>
          <p className="text-gray-700 text-sm">
            {result.total_scanned} files checked · {result.issues_found} alert(s) · {result.duration_seconds}s
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Monitored', value: files.length, icon: 'folder_open',  color: 'text-gray-900',  bg: 'bg-blue-50 text-blue-500' },
          { label: 'Safe',      value: safe,         icon: 'check_circle', color: 'text-success',   bg: 'bg-success-light text-success' },
          { label: 'Modified',  value: modified,     icon: 'edit_note',    color: modified > 0 ? 'text-danger'  : 'text-gray-900', bg: modified > 0 ? 'bg-danger-light text-danger'   : 'bg-gray-50 text-gray-400' },
          { label: 'Missing',   value: missing,      icon: 'error',        color: missing  > 0 ? 'text-warning' : 'text-gray-900', bg: missing  > 0 ? 'bg-warning-light text-warning' : 'bg-gray-50 text-gray-400' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg}`}>
                <span className="material-symbols-outlined text-lg" style={{fontVariationSettings:"'FILL' 1"}}>{icon}</span>
              </div>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Add file */}
      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
          Add File to Monitor
        </h3>
        <form onSubmit={addFile} className="flex gap-3">
          <input
            type="text"
            value={newFile}
            onChange={e => setNewFile(e.target.value)}
            placeholder="/etc/passwd"
            className="input flex-1"
          />
          <button type="submit" disabled={adding} className="btn-primary shrink-0">
            {adding ? 'Adding…' : 'Add File'}
          </button>
        </form>
        {addError && <p className="text-danger text-xs mt-2">{addError}</p>}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-gray-800 font-semibold">Monitored Files ({files.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {['File Path', 'SHA256 Hash', 'Last Checked', 'Status', 'Alert'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12">
                  <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin inline-block" />
                </td></tr>
              ) : files.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                  No files monitored. Click "Scan Now" to initialize.
                </td></tr>
              ) : files.map(f => (
                <tr key={f.id}>
                  <td className="font-mono text-xs text-gray-600 max-w-xs truncate">{f.filename}</td>
                  <td className="font-mono text-primary text-xs">{f.hash_value.slice(0, 16)}…</td>
                  <td className="text-gray-400 text-xs whitespace-nowrap">
                    {f.last_checked ? new Date(f.last_checked).toLocaleString('id-ID') : '—'}
                  </td>
                  <td><span className={STATUS_BADGE[f.status] || 'badge'}>{f.status}</span></td>
                  <td>
                    {f.alert_sent ? (
                      <div className="flex items-center gap-1 text-danger">
                        <span className="material-symbols-outlined text-base" style={{fontVariationSettings:"'FILL' 1"}}>notifications_active</span>
                        <span className="text-xs font-medium">Sent</span>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
