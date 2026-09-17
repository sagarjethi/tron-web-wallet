/** Deterministic 4x4 mirrored pattern from the address, for recognizing accounts at a glance. */
export function Identicon({ address, size = 34 }: { address: string; size?: number }) {
  let h = 2166136261
  for (let i = 0; i < address.length; i++) h = Math.imul(h ^ address.charCodeAt(i), 16777619)
  const hue = (h >>> 0) % 360
  const cells: [number, number][] = []
  for (let i = 0; i < 12; i++) if ((h >>> i) & 1) cells.push([i % 3, Math.floor(i / 3)])
  return (
    <svg className="identicon" width={size} height={size} viewBox="0 0 6 6" aria-hidden style={{ background: `hsl(${hue} 45% 88%)` }}>
      {cells.flatMap(([x, y]) => [<rect key={`${x}${y}a`} x={x + 0.5} y={y + 1} width="1" height="1" fill={`hsl(${hue} 55% 38%)`} />, <rect key={`${x}${y}b`} x={4.5 - x} y={y + 1} width="1" height="1" fill={`hsl(${hue} 55% 38%)`} />])}
    </svg>
  )
}
