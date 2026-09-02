import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Icon font bundled with the app: the icons must not depend on Google Fonts
// being reachable, or blocked networks see raw icon names as text.
import './fonts/material-symbols.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
