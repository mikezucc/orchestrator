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
        'te-orange': '#FF6B00',
        'te-yellow': '#FFD600',
        'te-gray': {
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#EEEEEE',
          300: '#E0E0E0',
          400: '#BDBDBD',
          500: '#9E9E9E',
          600: '#757575',
          700: '#616161',
          800: '#424242',
          900: '#212121',
          950: '#0A0A0A',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      borderRadius: {
        'none': '0',
        'sm': '0.125rem',
      },
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-in-out',
        'particle': 'particle 15s ease-in-out infinite',
        'gradient-rotate': 'gradientRotate 240s ease-in-out infinite',
        'gradient-fade': 'gradientFade 30s ease-in-out infinite',
        'gradient-fade-delayed': 'gradientFade 30s ease-in-out infinite 10s',
        'undulate': 'undulate 120s ease-in-out infinite',
        'undulate-delayed': 'undulate 120s ease-in-out infinite 4s',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        particle: {
          '0%': { 
            opacity: '0',
            transform: 'scale(0) blur(10px)',
          },
          '20%': { 
            opacity: '0.4',
            transform: 'scale(1) blur(2px)',
          },
          '80%': { 
            opacity: '0.4',
            transform: 'scale(1) blur(2px)',
          },
          '100%': { 
            opacity: '0',
            transform: 'scale(0.8) blur(10px)',
          },
        },
        gradientRotate: {
          '0%, 100%': { transform: 'rotate(0deg) scale(1)' },
          '33%': { transform: 'rotate(120deg) scale(1.1)' },
          '66%': { transform: 'rotate(240deg) scale(1.1)' },
        },
        gradientFade: {
          '0%, 100%': { opacity: '0' },
          '33%': { opacity: '1' },
          '66%': { opacity: '0' },
        },
        undulate: {
          '0%, 100%': { 
            transform: 'translateY(0) scaleY(1)',
            opacity: '0.3',
          },
          '50%': { 
            transform: 'translateY(-10%) scaleY(1.2)',
            opacity: '0.5',
          },
        },
      },
    },
  },
  plugins: [],
}