import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import { Settings } from './components/Settings'
import './index.css'
import { setupGlobalErrorLogging } from './lib/logging'

setupGlobalErrorLogging({ page: 'settings' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
)
