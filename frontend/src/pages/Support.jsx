const faqs = [
  {
    q: 'How do I log in?',
    a: 'Use your real Linux username and password. SecureOps authenticates through PAM, so your OS credentials are the only ones needed. Members of the sudo/wheel/admin group get admin role; everyone else is auditor (read-only).',
  },
  {
    q: 'A scan returned demo data — why?',
    a: 'You\'re running SecureOps on a non-Linux machine (e.g. Windows for development). Permission audit, sudoers parsing, and PAM all require Linux. On the Ubuntu server everything switches to live data.',
  },
  {
    q: 'How do I add a file to integrity monitoring?',
    a: 'Open the Integrity page and enter the absolute path (e.g. /etc/passwd) in the "Add File to Monitor" form. The system computes its SHA256 hash on first scan and alerts when the hash changes.',
  },
  {
    q: 'Where are activity logs stored?',
    a: 'In the local SQLite database (backend/secureops.db). Every login, scan, and configuration change is logged with username, timestamp, and source IP.',
  },
  {
    q: 'Can I run multiple scans at once?',
    a: 'Yes — Permission Audit, Sudo Monitor, and File Integrity are independent endpoints, each non-blocking. Run them in parallel.',
  },
]

const links = [
  { icon: 'description', label: 'API Documentation', sub: 'OpenAPI Swagger UI',     href: '/docs' },
  { icon: 'code',        label: 'GitHub Repository', sub: 'Source code & issues',    href: 'https://github.com/suryaex/secureops' },
  { icon: 'mail',        label: 'Contact IT Team',   sub: 'it@polsri.ac.id',         href: 'mailto:it@polsri.ac.id' },
]

export default function Support() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support & Help</h1>
        <p className="text-gray-500 text-sm mt-0.5">Documentation, FAQs, and how to get help</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {links.map(l => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="card p-5 hover:shadow-md transition-shadow flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">{l.icon}</span>
            </div>
            <div>
              <p className="text-gray-900 font-semibold text-sm">{l.label}</p>
              <p className="text-gray-400 text-xs">{l.sub}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">help_outline</span>
          Frequently Asked Questions
        </h3>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details key={i} className="group border border-gray-100 rounded-xl overflow-hidden">
              <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 list-none">
                <span className="text-gray-800 font-medium text-sm">{f.q}</span>
                <span className="material-symbols-outlined text-gray-400 text-lg group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <p className="px-4 pb-4 text-gray-600 text-sm leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-gray-800 font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">terminal</span>
          Quick Commands (Ubuntu Server)
        </h3>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-xs overflow-x-auto leading-relaxed">
{`# Check service status
sudo systemctl status secureops-backend
sudo systemctl status secureops-frontend

# View recent logs
sudo journalctl -u secureops-backend -n 50

# Restart services
sudo systemctl restart secureops-backend secureops-frontend

# Add a user to sudo group (becomes SecureOps admin)
sudo usermod -aG sudo username`}
        </pre>
      </div>
    </div>
  )
}
