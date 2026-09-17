/**
 * Exact decimal <-> base-unit conversion using bigint.
 * Floats are never used for token amounts.
 */

export const TRX_DECIMALS = 6

export function toBaseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim()
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') throw new Error('Enter a number, like 12.5')
  const [whole, frac = ''] = s.split('.')
  if (frac.length > decimals) throw new Error(`This token allows at most ${decimals} decimal places`)
  return BigInt((whole || '0') + frac.padEnd(decimals, '0'))
}

export function fromBaseUnits(value: bigint, decimals: number): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const str = abs.toString().padStart(decimals + 1, '0')
  const whole = decimals === 0 ? str : str.slice(0, -decimals)
  const frac = decimals === 0 ? '' : str.slice(-decimals).replace(/0+$/, '')
  return (negative ? '-' : '') + whole + (frac ? '.' + frac : '')
}

/** Human display with grouping, trimmed to maxFraction digits (truncates, never rounds up). */
export function formatAmount(value: bigint, decimals: number, maxFraction = 6): string {
  const [whole, frac = ''] = fromBaseUnits(value, decimals).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const shown = frac.slice(0, maxFraction).replace(/0+$/, '')
  return shown ? `${grouped}.${shown}` : grouped
}

export function shortAddress(address: string, lead = 6, tail = 4): string {
  return address.length <= lead + tail + 1 ? address : `${address.slice(0, lead)}…${address.slice(-tail)}`
}
