/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── Kratos-inspired palette ── */
        navy: {
          DEFAULT: '#0c1f3d',
          mid: '#1a3358',
          light: '#e8eef7',
        },
        orange: {
          DEFAULT: '#e85d20',
        },
        surface: {
          DEFAULT: '#f9fafb',
          card: '#ffffff',
          border: '#e5e7eb',
          hover: '#f3f4f6',
        },
        accent: {
          DEFAULT: '#0c1f3d',   /* navy as primary accent */
          hover: '#1a3358',
          muted: '#e8eef7',
          text: '#0c1f3d',
          orange: '#e85d20',
        },
        status: {
          green: '#1a7f4b',
          'green-light': '#e6f5ee',
          amber: '#b45309',
          'amber-light': '#fef3cd',
          red: '#b91c1c',
          'red-light': '#fde8e8',
          blue: '#1d4ed8',
          'blue-light': '#eff4ff',
          purple: '#6d28d9',
          'purple-light': '#f0ebff',
          teal: '#0f766e',
          'teal-light': '#f0fdfa',
        },
        g: {
          50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
          400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
          800: '#1f2937', 900: '#111827',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '6px',
        lg: '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        md: '0 4px 12px rgba(0,0,0,.08)',
      },
      animation: {
        'rx-pulse': 'rx-pulse 2s ease-in-out infinite',
        'rx-dot': 'rx-dot 1.4s ease-in-out infinite',
        'rx-fadein': 'rx-fadein 0.3s ease-out forwards',
        'rx-spin': 'rx-spin 1s linear infinite',
        'rx-breathe': 'rx-breathe 3s ease-in-out infinite',
        'rx-cursor-blink': 'rx-cursor-blink 0.8s step-end infinite',
        'pulse-dot': 'pulse-dot 1s infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.3 },
        },
      },
    },
  },
  plugins: [],
}
