import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import { Logs } from './components/Logs'
import './index.css'
import { setupGlobalErrorLogging } from './lib/logging'

setupGlobalErrorLogging({ page: 'logs' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Logs />
  </React.StrictMode>
)
