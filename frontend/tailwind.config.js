/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /** MAGFIRAH CELL — merah logo (~#FF202E / accent #E61E2A) */
        brand: {
          50: '#fff5f6',
          100: '#ffe4e8',
          200: '#fecdd8',
          300: '#fda4b4',
          400: '#f9707c',
          500: '#FF202E',
          600: '#E61E2A',
          700: '#C31923',
          800: '#9B171F',
          900: '#6f1118',
          950: '#4a0c10',
        },
      },
    },
  },
  plugins: [],
};
