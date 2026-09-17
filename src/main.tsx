import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './app.css'
import { WalletProvider } from './state/wallet'
import { ToastProvider } from './ui/kit'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </ToastProvider>
  </StrictMode>,
)
