import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <PrivyProvider
    appId="cmnl2m7vj01ql0djr2zrk4ibu"
    config={{
      appearance: { theme: 'light', accentColor: '#000000' },
      defaultChain: { id: 84532, name: 'Base Sepolia' } as never,
    }}
  >
    <App />
  </PrivyProvider>
)
