/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sarawak State Colors
        sarawak: {
          blue: {
            50: '#e6f3ff',
            100: '#b3daff',
            200: '#80c1ff',
            300: '#4da8ff',
            400: '#1a8fff',
            500: '#007BFF', // Primary Sarawak Blue
            600: '#0062cc',
            700: '#004999',
            800: '#003166',
            900: '#001833',
            950: '#000c1a',
          },
          red: {
            50: '#fef2f2',
            100: '#fee2e2',
            200: '#fecaca',
            300: '#fca5a5',
            400: '#f87171',
            500: '#C8102E', // Primary Sarawak Red
            600: '#b30d27',
            700: '#9a0b21',
            800: '#7f091b',
            900: '#650716',
            950: '#4a0510',
          },
          yellow: {
            50: '#fffef7',
            100: '#fffce8',
            200: '#fff9c2',
            300: '#fff394',
            400: '#ffe566',
            500: '#FFD700', // Primary Sarawak Gold/Yellow
            600: '#e6c200',
            700: '#bfa000',
            800: '#997f00',
            900: '#736000',
            950: '#4d4000',
          },
          black: {
            50: '#f6f6f6',
            100: '#e7e7e7',
            200: '#d1d1d1',
            300: '#b0b0b0',
            400: '#888888',
            500: '#1A1A1A', // Primary Sarawak Black
            600: '#151515',
            700: '#111111',
            800: '#0d0d0d',
            900: '#080808',
            950: '#000000',
          },
        },
      },
    },
  },
  plugins: [],
}
