// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1B4F72', light: '#2E86C1', dark: '#154360' },
        gold:    { DEFAULT: '#D4AC0D', light: '#FEF9E7' },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
