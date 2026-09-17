# TRON wallet resources

Everything this project depends on: networks, endpoints, faucets, token contracts, standards, libraries and tools.
Values marked "verified" were checked against the live chain on 2026-09-17.

## Networks

| Network | Role | HTTP API (TronGrid) | Explorer | Faucet |
| --- | --- | --- | --- | --- |
| Shasta | Default test network | `https://api.shasta.trongrid.io` | https://shasta.tronscan.org | https://shasta.tronex.io/join/getJoinPage |
| Nile | Second test network | `https://nile.trongrid.io` | https://nile.tronscan.org | https://nileex.io/join/getJoinPage |
| Mainnet | Real funds | `https://api.trongrid.io` | https://tronscan.org | None |

The same address and private key work on all three networks.
Balances and history are separate per network.

### Shasta endpoints in full

Source: https://shasta.tronex.io/status/getStatusPage and https://www.trongrid.io/shasta

| Service | Endpoint |
| --- | --- |
| HTTP full node | `https://api.shasta.trongrid.io/wallet/` |
| HTTP solidity node | `https://api.shasta.trongrid.io/walletsolidity/` |
| JSON-RPC (Ethereum style) | `https://api.shasta.trongrid.io/jsonrpc/` |
| Event server | `https://api.shasta.trongrid.io/` |
| gRPC full node | `grpc.shasta.trongrid.io:50051` |
| gRPC solidity node | `grpc.shasta.trongrid.io:50052` |
| Public full nodes | `47.252.19.181`, `47.252.3.238` (HTTP 8090, solidity 8091, gRPC 50051, JSON-RPC 50545) |

At the time of writing Shasta ran java-tron GreatVoyage-v4.7.3 across 27 nodes.

### Shasta faucet

The faucet hands out test TRX and several test tokens (USDT, USDJ, JST, BTT, WIN).
It is protected by a Cloudflare Turnstile check, so a person has to request coins in a browser.
Paste the wallet address from the Receive sheet into the faucet form.

## TronGrid API keys

Docs: https://developers.tron.network/reference/select-network and https://developers.tron.network/reference/trongrid-v1-api-overview
Dashboard: https://www.trongrid.io/dashboard/keys

- The header is `TRON-PRO-API-KEY`.
- Mainnet validates keys: an invalid key returns HTTP 401, and requests without a key are heavily rate limited.
- Nile accepts the header but does not validate it.
- Shasta's CORS preflight does not allow the header, so a browser could never send it there anyway.
- Keys can be restricted by user agent, contract and method on the dashboard.
- A key allows 15 requests per second; a burst above that suspends the key for a few seconds (`The key exceeds the frequency limit(15), and the query server is suspended for 2s`).
  The wallet paces browser traffic to 8 per second and caches token metadata in the proxy to stay under it.

The wallet never sends the key from the browser.
All TronGrid traffic goes through the same-origin proxy in `api/tron.ts`, which adds `TRONGRID_API_KEY` on the server.
See [SECURITY.md](../SECURITY.md) for where the key is stored and how leaks are prevented.

## TronGrid endpoints used

Browsers reach these through `/api/tron/{network}/{endpoint}`; the proxy refuses anything not listed in `ALLOWED_PATHS` (`api/tron.ts`).
`npm run test:network` runs every wallet flow through the proxy and fails if TronWeb needs an endpoint that is not allowed.

| Purpose | Endpoint |
| --- | --- |
| Balance and activation (full node, so it updates right after a send) | `POST /wallet/getaccount` |
| Token discovery (every TRC20 contract an address holds) | `GET /v1/accounts/{address}` |
| TRC10 token name and precision | `POST /wallet/getassetissuebyid` |
| Bandwidth and energy | `POST /wallet/getaccountresource` |
| Block height | `GET /wallet/getnowblock` |
| Reference block for building transactions | `POST /wallet/getblock` |
| Fee prices | `POST /wallet/getchainparameters` (`getEnergyFee`, `getTransactionFee`, `getCreateAccountFee`, `getCreateNewAccountFeeInSystemContract`) |
| TRC20 balances, metadata and fee simulation | `POST /wallet/triggerconstantcontract` |
| Build TRX transfer | `POST /wallet/createtransaction` |
| Build TRC20 transfer | `POST /wallet/triggersmartcontract` |
| Broadcast | `POST /wallet/broadcasttransaction` |
| Confirmation | `POST /walletsolidity/gettransactioninfobyid` |
| TRX and contract history | `GET /v1/accounts/{address}/transactions` |
| TRC20 history | `GET /v1/accounts/{address}/transactions/trc20` |

## Token contracts

Only contracts listed here are marked "Verified" in the wallet.
Every other token an address holds is still discovered and shown, labeled "Unverified", "Look-alike" (its symbol imitates a verified token or TRX) or "TRC10".
Balances are always read from the token contract with `balanceOf`; TronGrid's index is used only to find which contracts to read.
Anyone can deploy a token called USDT, and Shasta already has several fakes that use Unicode look-alike letters (for example `TWkKQo8KidCEGXsH752bgmvuBa6b64Vo1Q`).
The Add token sheet warns when a custom token's symbol normalizes to a verified one.

| Network | Symbol | Contract | Decimals | Status |
| --- | --- | --- | --- | --- |
| Shasta | USDT | `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs` | 6 | Verified |
| Nile | USDT | `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` | 6 | Verified |
| Mainnet | USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 | Verified |
| Mainnet | USDD | `TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz` | 18 | Verified |
| Mainnet | WTRX | `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR` | 6 | Verified |

USDC is intentionally absent: Circle ended USDC support on TRON.
The Shasta faucet's other tokens (USDJ, JST, BTT, WIN) can be added by contract address once you know it.

## Standards

### BIP-39 recovery phrases

- 12 or 24 English words from the BIP-39 list; the last word carries a checksum.
- An optional passphrase ("25th word") produces a completely different wallet.

### BIP-44 derivation for TRON

TRON's SLIP-44 coin type is 195.

| Scheme | Path | Used by |
| --- | --- | --- |
| Index based (default) | `m/44'/195'/0'/0/{index}` | TronLink, Trust Wallet, this wallet's "Next index" |
| Account based | `m/44'/195'/{account}'/0/0` | Ledger Live, this wallet's "By account" |
| Custom | `m/44'/195'/{a}'/{0 or 1}/{i}` | Any path, validated in `src/lib/derivation.ts` |

Test vector for the phrase `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`:

| Path | Address |
| --- | --- |
| `m/44'/195'/0'/0/0` | `TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH` |
| `m/44'/195'/0'/0/1` | `TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK` |
| `m/44'/195'/1'/0/0` | `TLrpNTBuCpGMrB9TyVwgEhNVRhtWEQPHh4` |

Never send real funds to this phrase: it is public and swept by bots.

### Address format

`base58check(0x41 || last 20 bytes of keccak256(uncompressed secp256k1 public key without the 0x04 prefix))`.
Addresses start with `T` and are 34 characters long.

### Message signing

The wallet uses TronWeb `signMessageV2` and `verifyMessageV2`.
The message is prefixed with `\x19TRON Signed Message:\n` and its length before hashing, so a signed message can never be replayed as a transaction.
Signatures are 65 bytes (`r || s || v`), shown as 130 hex characters with a `0x` prefix.

### Fees and resources

- Bandwidth pays for transaction bytes.
  Every activated account gets 600 free bandwidth per day; otherwise 1,000 sun per byte burns.
- Energy pays for smart contract execution such as TRC20 transfers.
  Without staked energy it burns at `getEnergyFee` sun per unit (100 at the time of writing).
- Sending TRX to an address that has never been used creates the account: 1 TRX flat, plus 0.1 TRX unless the sender has staked bandwidth.
- A TRC20 transfer to an address that has never held the token uses roughly twice the energy.
- `fee_limit` caps the TRX burned for energy; the wallet sets 1.5 times the simulated cost, at least 10 TRX and at most 1,000 TRX.

## Libraries

| Package | Role |
| --- | --- |
| [tronweb](https://www.npmjs.com/package/tronweb) 6.x | Transaction building, signing, broadcasting, ABI decoding, message signatures |
| [@scure/bip39](https://github.com/paulmillr/scure-bip39) | Phrase generation and validation |
| [@scure/bip32](https://github.com/paulmillr/scure-bip32) | HD key derivation |
| [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/hashes](https://github.com/paulmillr/noble-hashes), [@scure/base](https://github.com/paulmillr/scure-base) | Address derivation without loading TronWeb on the first screens |
| [qrcode](https://www.npmjs.com/package/qrcode) | Receive QR codes |
| React 19, Vite 8, TypeScript 6, Vitest, oxlint | App and tooling |

## Tools

- TRONSCAN MCP server, for letting AI agents query TRON data while developing: https://mcpdoc.tronscan.org/en/mcp
- TRONSCAN API for Shasta: `https://shastapi.tronscan.org/api/`
- TRON developer docs: https://developers.tron.network
- java-tron HTTP API reference: https://developers.tron.network/reference
- TronLink for comparing addresses from the same phrase: https://www.tronlink.org
