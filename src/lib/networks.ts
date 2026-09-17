export type NetworkId = 'shasta' | 'nile' | 'mainnet'

export interface TokenPreset {
  contract: string
  symbol: string
  name: string
  decimals: number
}

export interface Network {
  id: NetworkId
  name: string
  kind: 'testnet' | 'mainnet'
  /** Direct TronGrid host. Browsers go through the same-origin proxy at /api/tron/{id} instead. */
  fullHost: string
  explorer: string
  faucet?: { label: string; url: string }
  tokens: TokenPreset[]
}

export const NETWORKS: Record<NetworkId, Network> = {
  shasta: {
    id: 'shasta',
    name: 'Shasta',
    kind: 'testnet',
    fullHost: 'https://api.shasta.trongrid.io',
    explorer: 'https://shasta.tronscan.org/#',
    faucet: { label: 'Shasta faucet', url: 'https://shasta.tronex.io/join/getJoinPage' },
    tokens: [{ contract: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs', symbol: 'USDT', name: 'Tether USD', decimals: 6 }],
  },
  nile: {
    id: 'nile',
    name: 'Nile',
    kind: 'testnet',
    fullHost: 'https://nile.trongrid.io',
    explorer: 'https://nile.tronscan.org/#',
    faucet: { label: 'Nile faucet', url: 'https://nileex.io/join/getJoinPage' },
    tokens: [{ contract: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf', symbol: 'USDT', name: 'Tether USD', decimals: 6 }],
  },
  mainnet: {
    id: 'mainnet',
    name: 'Mainnet',
    kind: 'mainnet',
    fullHost: 'https://api.trongrid.io',
    explorer: 'https://tronscan.org/#',
    tokens: [
      { contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
      { contract: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz', symbol: 'USDD', name: 'Decentralized USD', decimals: 18 },
      { contract: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', symbol: 'WTRX', name: 'Wrapped TRX', decimals: 6 },
    ],
  },
}

export const NETWORK_ORDER: NetworkId[] = ['shasta', 'nile', 'mainnet']

export const txUrl = (n: Network, txid: string) => `${n.explorer}/transaction/${txid}`
export const addressUrl = (n: Network, address: string) => `${n.explorer}/address/${address}`
export const contractUrl = (n: Network, address: string) => `${n.explorer}/contract/${address}`
