/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
       * Touch input, rather than a narrow window.
       *
       * `(pointer: coarse)` asks how the person is pointing, which is the question that
       * actually matters for hit size — a finger needs room whether it is on a phone or a
       * touchscreen laptop, and a mouse does not gain anything from a taller button just
       * because the window was dragged narrow. Keying this off a width breakpoint would get
       * both of those backwards.
       *
       * Used to raise controls to a comfortable target on touch while leaving the dense
       * desktop layout alone; this product is read at a desk as often as it is used on a
       * site, and the density there is deliberate.
       */
      screens: {
        coarse: { raw: '(pointer: coarse)' },
      },
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        grid: 'var(--grid)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        good: 'var(--good)',
        warning: 'var(--warning)',
        serious: 'var(--serious)',
        critical: 'var(--critical)',
        'critical-soft': 'var(--critical-soft)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        // type scale — the only sizes the app uses
        '2xs': ['11px', '16px'],
        xs: ['12px', '18px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        lg: ['16px', '24px'],
        xl: ['18px', '26px'],
        '2xl': ['22px', '30px'],
        '3xl': ['28px', '34px'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,11,11,0.04)',
        pop: '0 4px 24px rgba(11,11,11,0.14)',
        modal: '0 12px 48px rgba(11,11,11,0.22)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(4px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'scale-in': 'scale-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        rise: 'rise 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
