/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08090c',
          900: '#0c0e12',
          850: '#11141a',
          800: '#161a22',
          750: '#1c212b',
          700: '#232936',
          600: '#313947',
          500: '#444e5e',
          400: '#6b7689',
          300: '#9aa4b6',
          200: '#c5ccd9',
          100: '#e3e7ee',
          50: '#f4f6fa',
        },
        gold: {
          500: '#e6b252',
          400: '#ecc074',
          300: '#f3d49b',
          600: '#c8973e',
          700: '#a87a2d',
        },
        teal: {
          500: '#3faeae',
          400: '#62c5c5',
          600: '#2d9090',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        floatUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.5s linear infinite',
        floatUp: 'floatUp 0.5s ease-out both',
        slideIn: 'slideIn 0.3s ease-out both',
        fadeIn: 'fadeIn 0.4s ease-out both',
        spinSlow: 'spinSlow 1.2s linear infinite',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
      },
      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
