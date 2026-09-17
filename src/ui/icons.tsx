import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (props: P) => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...props })

export const IconSend = (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
export const IconReceive = (p: P) => <svg {...base(p)}><path d="M12 4v14M6 12l6 6 6-6" /><path d="M5 21h14" /></svg>
export const IconSign = (p: P) => <svg {...base(p)}><path d="M4 20c3-1 4-4 6-4s1.5 3 4 3 3-2 6-2" /><path d="M14.5 4.5l3 3L9 16l-4 1 1-4z" /></svg>
export const IconCopy = (p: P) => <svg {...base(p)}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
export const IconCheck = (p: P) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
export const IconClose = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const IconLock = (p: P) => <svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
export const IconSettings = (p: P) => <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
export const IconExternal = (p: P) => <svg {...base(p)}><path d="M14 5h5v5M19 5l-8 8M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10" /></svg>
export const IconChevron = (p: P) => <svg {...base(p)}><path d="M7 10l5 5 5-5" /></svg>
export const IconBack = (p: P) => <svg {...base(p)}><path d="M15 6l-6 6 6 6" /></svg>
export const IconWarn = (p: P) => <svg {...base(p)}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4M12 16.8v.2" /></svg>
export const IconDrop = (p: P) => <svg {...base(p)}><path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z" /></svg>
export const IconRefresh = (p: P) => <svg {...base(p)}><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></svg>
export const IconArrowIn = (p: P) => <svg {...base(p)}><path d="M17 7 7 17M7 9v8h8" /></svg>
export const IconArrowOut = (p: P) => <svg {...base(p)}><path d="M7 17 17 7M9 7h8v8" /></svg>
export const IconDots = (p: P) => <svg {...base(p)}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
export const IconShield = (p: P) => <svg {...base(p)}><path d="M12 3.5 19 6v5.5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></svg>

/** TRON mark, drawn as an outline to sit quietly in the header. */
export const TronMark = (p: P) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden {...p}>
    <path d="M6 7.5 26 10.5 17.5 27Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M6 7.5 17.5 27M26 10.5 13.5 15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)
