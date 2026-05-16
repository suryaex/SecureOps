/**
 * SecureOps · Luminous Security design system
 * Inspired by macOS Tahoe glassmorphism.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Apple-blue accent (Stitch override color)
        primary: {
          DEFAULT: '#007AFF',
          dark:    '#0058BC',
          hover:   '#0070EB',
          light:   '#EAF4FF',
          border:  '#B8D6FF',
          fixed:   '#D8E2FF',
        },
        // Semantic palette
        danger:  { DEFAULT: '#BA1A1A', light: '#FFDAD6', border: '#FFB4AB', dark: '#93000A' },
        warning: { DEFAULT: '#9E3D00', light: '#FFDBCC', border: '#FFB595', dark: '#7C2E00' },
        success: { DEFAULT: '#198754', light: '#DCFCE7', border: '#86EFAC', dark: '#15803D' },
        info:    { DEFAULT: '#0891B2', light: '#E0F2FE', border: '#BAE6FD', dark: '#0E7490' },

        // Surface scale (from Luminous Security YAML)
        surface: {
          DEFAULT: '#F9F9FF',
          dim:     '#D8D9E5',
          bright:  '#F9F9FF',
          lowest:  '#FFFFFF',
          low:     '#F1F3FE',
          mid:     '#ECEDF9',
          high:    '#E6E8F3',
          highest: '#E0E2ED',
          inverse: '#2D3039',
        },
        outline: {
          DEFAULT: '#717786',
          variant: '#C1C6D7',
        },
        ink: {
          DEFAULT: '#181C23',
          muted:   '#414755',
          subtle:  '#5D5E63',
        },

        // Legacy aliases (so old code keeps working during migration)
        sidebar:  '#FFFFFF',
        'page-bg': '#F9F9FF',
      },
      boxShadow: {
        // Soft Bloom (Luminous Security spec)
        bloom:          '0 10px 30px rgba(0,0,0,0.04)',
        'bloom-lg':     '0 20px 60px rgba(0,0,0,0.06)',
        card:           '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
        sidebar:        '4px 0 24px rgba(0,0,0,0.04)',
        'inset-recess': 'inset 0 1px 2px rgba(0,0,0,0.06)',
        'glass-edge':   'inset 0 1px 0 0 rgba(255,255,255,0.55), inset 0 -1px 0 0 rgba(0,0,0,0.02)',
      },
      borderRadius: {
        DEFAULT: '8px',
        sm:  '4px',
        md:  '12px',
        lg:  '16px',
        xl:  '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      backdropBlur: {
        xs: '6px',
        glass: '20px',
        heavy: '30px',
      },
      spacing: {
        gutter: '20px',
        margin: '40px',
      },
      letterSpacing: {
        tightest: '-0.02em',
        tight:    '-0.01em',
        label:    '0.03em',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':     'fadeIn 200ms ease-out',
        'slide-up':    'slideUp 240ms cubic-bezier(0.4,0,0.2,1)',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%':   { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
