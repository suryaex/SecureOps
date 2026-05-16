import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  return (
    <div className="min-h-screen relative">
      <Sidebar />
      <div className="ml-[260px] flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 px-10 py-6 overflow-auto animate-fade-in">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
