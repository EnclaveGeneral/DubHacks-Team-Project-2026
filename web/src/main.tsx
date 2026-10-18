import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { BackPocketProvider } from './state.tsx'
import './base.css'
import './site.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <BackPocketProvider>
        <App />
      </BackPocketProvider>
    </BrowserRouter>
  </StrictMode>,
)
