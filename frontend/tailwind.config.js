/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          dark:    '#1D4ED8',
          light:   '#EFF6FF',
          border:  '#BFDBFE',
        },
        danger:  { DEFAULT: '#DC2626', light: '#FEF2F2', border: '#FECACA' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB', border: '#FDE68A' },
        success: { DEFAULT: '#16A34A', light: '#F0FDF4', border: '#BBF7D0' },
        info:    { DEFAULT: '#0891B2', light: '#E0F2FE', border: '#BAE6FD' },
        sidebar: '#FFFFFF',
        'page-bg': '#F1F5FB',
      },
      boxShadow: {
        card:    '0 1px 4px rgba(0,0,0,0.07), 0 0 1px rgba(0,0,0,0.06)',
        sidebar: '2px 0 8px rgba(0,0,0,0.06)',
        sm:      '0 1px 2px rgba(0,0,0,0.05)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}
