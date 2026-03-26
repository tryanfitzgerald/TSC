/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0D1B2A',
          800: '#1A2E42',
          700: '#2E4A60',
        },
        accent: {
          teal: '#00B4D8',
          gold: '#F4A261',
          amber: '#EF9F27',
          green: '#2EC4B6',
          red: '#E63946',
          purple: '#7F77DD',
        },
        muted: '#8BAFC0',
      },
    },
  },
  plugins: [],
}
