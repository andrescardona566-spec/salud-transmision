/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17171b',
        panel: '#212127',
        line: '#32323b',
        ok: '#2fbf71',
        warn: '#f0b429',
        crit: '#ef4444',
      },
    },
  },
  plugins: [],
};
