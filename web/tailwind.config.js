/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#eeeeeb', surface: '#e1e1dd', ink: '#1c1d1f',
        muted: '#5c5e62', accent: '#c2501b', paper: '#ffffff', line: '#d3d3ce',
      },
      fontFamily: { sans: ['"Familjen Grotesk"', 'system-ui', 'sans-serif'], mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'] },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
}
