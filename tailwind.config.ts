import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        brand: '#00753A', // verde principal Fort Fruit (fundo de sidebar/cabeçalhos)
        'brand-light': '#009345', // verde de logo, para acentos menores
        'brand-deep': '#00401F',
        accent: '#F6921E', // laranja Fort Fruit (botões/CTAs)
        'accent-dark': '#D97C0C',
        teal: '#00A69C',
        pink: '#EC297B',
        lime: '#8BC53F',
        ruby: '#BE1E2D',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -8px rgba(0,117,58,0.12)',
        'card-hover': '0 2px 4px rgba(16,24,40,0.06), 0 16px 32px -12px rgba(0,117,58,0.20)',
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px -8px rgba(0,0,0,0.35)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out both',
        'fade-in': 'fadeIn 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
