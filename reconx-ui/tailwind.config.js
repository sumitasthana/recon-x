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
        surface: {
          DEFAULT: '#0f0f10',
          card: '#18181b',
          border: '#27272a',
          hover: '#1f1f23',
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
          muted: '#4c1d95',
          text: '#a78bfa',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        'rx-pulse': 'rx-pulse 2s ease-in-out infinite',
        'rx-dot': 'rx-dot 1.4s ease-in-out infinite',
        'rx-fadein': 'rx-fadein 0.3s ease-out forwards',
        'rx-spin': 'rx-spin 1s linear infinite',
        'rx-breathe': 'rx-breathe 3s ease-in-out infinite',
        'rx-cursor-blink': 'rx-cursor-blink 0.8s step-end infinite',
      },
    },
  },
  plugins: [],
}
