import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '../api/client'

const ServerContext = createContext(null)

export function ServerProvider({ children }) {
  const [servers, setServers] = useState([])
  const [serverId, setServerId] = useState(() => {
    const saved = localStorage.getItem('so_server_id')
    return saved ? parseInt(saved, 10) : null
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/servers')
      setServers(data)
      // Auto-pick first server if nothing selected
      if (data.length > 0 && (!serverId || !data.find(s => s.id === serverId))) {
        const local = data.find(s => s.is_local) || data[0]
        setServerId(local.id)
        localStorage.setItem('so_server_id', local.id)
      }
    } catch {
      setServers([])
    } finally { setLoading(false) }
  }, [serverId])

  useEffect(() => { refresh() }, [])  // eslint-disable-line

  const select = (id) => {
    setServerId(id)
    localStorage.setItem('so_server_id', id)
  }

  // Auto-refresh server statuses every 30 s
  useEffect(() => {
    const t = setInterval(() => {
      api.post('/servers/ping-all').then(refresh).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [refresh])

  const selected = servers.find(s => s.id === serverId) || null
  const queryParam = serverId && !selected?.is_local ? { server_id: serverId } : {}

  return (
    <ServerContext.Provider value={{
      servers, serverId, selected, loading,
      select, refresh, queryParam,
    }}>
      {children}
    </ServerContext.Provider>
  )
}

export const useServers = () => useContext(ServerContext)
