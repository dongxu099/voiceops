import type { CSSProperties } from 'react';

type IconName = 'star' | 'arrow' | 'mic' | 'stop' | 'check' | 'terminal' | 'shield' | 'chart' | 'pulse' | 'case' | 'chevron' | 'clock' | 'close' | 'refresh' | 'send';

const paths: Record<IconName, string> = {
  star: 'M12 2l2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  mic: 'M9 5a3 3 0 016 0v7a3 3 0 01-6 0V5zM5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8',
  stop: 'M6 6h12v12H6z',
  check: 'M5 12l4 4L19 6',
  terminal: 'M4 4h16v16H4zM7 8l3 3-3 3M13 15h4',
  shield: 'M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4zM8 12l3 3 5-6',
  chart: 'M4 20V4M4 20h16M8 16v-4M13 16V7M18 16v-6',
  pulse: 'M2 12h5l3-8 4 16 3-8h5',
  case: 'M8 6V3h8v3M3 6h18v15H3zM3 11h18M10 11v3h4v-3',
  chevron: 'M7 10l5 5 5-5',
  clock: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 7v5l3 2',
  close: 'M6 6l12 12M6 18L18 6',
  refresh: 'M20 7a9 9 0 10.5 9M20 2v6h-6',
  send: 'M21 3L3 10l7 4 4 7 7-18zM10 14L21 3',
};

export function Icon({ name, size = 18, style, className }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className}><path d={paths[name]} /></svg>;
}
