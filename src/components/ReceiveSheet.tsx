import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useWallet } from '../state/wallet-context'
import { IconCopy, IconDrop, IconExternal } from '../ui/icons'
import { Button, Notice, Sheet } from '../ui/kit'
import { useCopy } from '../ui/toast'

export function ReceiveSheet({ onClose }: { onClose: () => void }) {
  const { account, network } = useWallet()
  const copy = useCopy()
  const [svg, setSvg] = useState('')
  const address = account?.address

  useEffect(() => {
    if (!address) return
    let cancelled = false
    QRCode.toString(address, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#171a21', light: '#ffffff' } }).then((s) => !cancelled && setSvg(s))
    return () => {
      cancelled = true
    }
  }, [address])

  if (!account) return null
  return (
    <Sheet open onClose={onClose} title={`Receive on ${network.name}`}>
      <div className="receive">
        <div className="qr" role="img" aria-label={`QR code for ${account.address}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="receive-name">{account.name}</p>
        <p className="mono receive-addr">{account.address}</p>
        <Button variant="primary" block onClick={() => copy(account.address, 'Address copied')}>
          <IconCopy /> Copy address
        </Button>
      </div>
      <Notice tone={network.kind === 'mainnet' ? 'warn' : 'info'}>
        {network.kind === 'mainnet'
          ? 'Only send TRX and TRC20 tokens on TRON mainnet to this address. Tokens sent from other chains are lost.'
          : `This address is the same on every TRON network. Only ${network.name} test tokens will show while ${network.name} is selected.`}
      </Notice>
      {network.faucet ? (
        <a className="btn btn-secondary btn-block" href={network.faucet.url} target="_blank" rel="noreferrer">
          <IconDrop /> Open the {network.faucet.label} <IconExternal />
        </a>
      ) : null}
    </Sheet>
  )
}
