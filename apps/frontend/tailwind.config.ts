import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae3',
          300: '#b0b9c8',
          400: '#8492a8',
          500: '#65748c',
          600: '#505d74',
          700: '#424c5e',
          800: '#394150',
          900: '#1d2330',
          950: '#12151d',
        },
        brand: {
          50: '#eef4ff',
          100: '#dce7ff',
          200: '#c0d4ff',
          300: '#94b7ff',
          400: '#618eff',
          500: '#3b66f6',
          600: '#2547eb',
          700: '#1d35d8',
          800: '#1d2daf',
          900: '#1d2b8a',
        },
        accent: {
          400: '#f5b544',
          500: '#ea9a1d',
          600: '#c97a10',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      maxWidth: {
        prose: '68ch',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
