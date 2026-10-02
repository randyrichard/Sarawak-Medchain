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
        'accent-solid': 'var(--accent-solid)',
        'accent-solid-hover': 'var(--accent-solid-hover)',
        good: 'var(--good)',
        warning: 'var(--warning)',
        // The soft variant already existed as a CSS variable but was never exposed here, so
        // `bg-warning-soft` generated no class at all and the element rendered transparent -
        // a silent failure, since Tailwind does not complain about a class it has not heard
        // of. Its accent and critical counterparts were already listed.
        'warning-soft': 'var(--warning-soft)',
        // Same story as warning-soft: --good-soft existed and was never exposed, so every
        // `bg-good-soft` in the app rendered transparent.
        'good-soft': 'var(--good-soft)',
        serious: 'var(--serious)',
        critical: 'var(--critical)',
        'critical-solid': 'var(--critical-solid)',
        'critical-soft': 'var(--critical-soft)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      /*
       * The type scale — the only sizes the app uses.
       *
       * Every step moved up one. The scale used to sit a full step below web convention:
       * `base` was 14px where the browser default and nearly every other product is 16, and
       * the rest followed from there.
       *
       * That was not an abstract problem. Counted across the app, 650 of about 1,250 size
       * declarations were `2xs` — 11px was the single most-used size in the product, and
       * `base` appeared 15 times. So more than half of everything on screen was set at
       * eleven pixels.
       *
       * Consider who reads it. A supervisor in their forties or fifties, which is where
       * presbyopia starts; on a phone; in Bintulu daylight; sometimes through safety
       * glasses. Eleven pixels is a poor bet against all four at once, and the cost of
       * losing it is a near miss that does not get filed.
       *
       * Line heights move with the sizes to hold roughly a 1.45 ratio, which is what keeps
       * a wrapped label legible rather than merely larger.
       *
       * The deeper fix is not here. It is that the app reaches for `2xs` where it means
       * `sm`, and that is a judgement per component rather than a number in a config. This
       * raises the floor under all of it first.
       */
      fontSize: {
        '2xs': ['12px', '17px'],
        xs: ['13px', '19px'],
        sm: ['14px', '21px'],
        base: ['16px', '24px'],
        lg: ['18px', '27px'],
        xl: ['20px', '29px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '38px'],
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
