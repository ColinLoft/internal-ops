/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff5ff',
          100: '#dce9ff',
          200: '#b8d2ff',
          300: '#8eb8ff',
          400: '#5695FA',
          500: '#5695FA',
          600: '#2569F5',
          700: '#1f59d1',
          800: '#1948ad',
          900: '#153b8d',
          950: '#102b66',
        },
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        'glass-hover': '0 12px 40px 0 rgba(31, 38, 135, 0.12)',
        'subtle': '0 2px 10px rgba(0, 0, 0, 0.04)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
