import type { ReactNode } from 'react';
import styles from './GunmetalKey.module.css';

interface GunmetalKeyProps {
  children: ReactNode;
  /** Renders a link (full page load, e.g. into the sign-in round trip) instead of a button. */
  href?: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  busy?: boolean;
  size?: 'regular' | 'small';
  className?: string;
}

/** A secondary action as a gunmetal key. Orange stays reserved for the one committing key. */
export function GunmetalKey({ children, href, type = 'button', onClick, busy, size = 'regular', className }: GunmetalKeyProps) {
  const classes = [styles.key, className].filter(Boolean).join(' ');
  if (href) {
    return (
      <a href={href} className={classes} data-size={size}>
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      onClick={busy ? undefined : onClick}
      aria-disabled={busy || undefined}
      className={classes}
      data-size={size}
    >
      {children}
    </button>
  );
}
