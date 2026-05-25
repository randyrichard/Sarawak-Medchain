import { useState, useEffect, useRef } from 'react';

/**
 * Premium scroll-effect primitives. Zero dependencies. Used across the site
 * to give institutional pages a polished feel without a library like Framer.
 *
 * - <ScrollReveal direction="left|right|up"> wraps any block; it fades + slides
 *   in when it enters the viewport.
 * - <CountUp end={N} /> animates a number from 0 to N once visible.
 * - useScrollProgress() returns a 0-100 number for a sticky progress bar.
 *
 * All effects respect prefers-reduced-motion.
 */

export function ScrollReveal({ children, direction = 'up', delay = 0, className = '', style = {} }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const offset = {
    left: 'translate3d(-48px, 0, 0)',
    right: 'translate3d(48px, 0, 0)',
    up: 'translate3d(0, 32px, 0)',
  }[direction] || 'translate3d(0, 32px, 0)';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: visible ? 'translate3d(0, 0, 0)' : offset,
        opacity: visible ? 1 : 0,
        transition: `transform 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, opacity 0.85s ease-out ${delay}ms`,
        willChange: visible ? 'auto' : 'transform, opacity',
      }}
    >
      {children}
    </div>
  );
}

export function CountUp({ end, duration = 1800, decimals = 0, formatter, prefix = '', suffix = '', className = '', style = {} }) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(end);
      hasAnimated.current = true;
      return;
    }
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const startTime = performance.now();
          const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            setValue(end * eased);
            if (progress < 1) requestAnimationFrame(tick);
            else setValue(end);
          };
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  const display = formatter
    ? formatter(value)
    : value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return <span ref={ref} className={className} style={style}>{prefix}{display}{suffix}</span>;
}

export function useScrollProgress(shrinkAt = 80) {
  const [progress, setProgress] = useState(0);
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setProgress(pct);
      setShrunk(scrollTop > shrinkAt);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [shrinkAt]);

  return { progress, shrunk };
}

export function ScrollProgressBar({ progress }) {
  return (
    <div
      className="fixed top-0 left-0 z-[60] h-[3px] pointer-events-none"
      style={{
        width: `${progress}%`,
        background: 'linear-gradient(90deg, #0F2A5C 0%, #1E3A8A 50%, #0F766E 100%)',
        transition: 'width 0.12s ease-out',
        boxShadow: '0 0 8px rgba(15, 42, 92, 0.3)',
      }}
    />
  );
}
