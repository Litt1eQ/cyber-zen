import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './index.css'
import { setupGlobalErrorLogging } from './lib/logging'
import { SpriteStudioPage } from './components/SpriteStudio/SpriteStudioPage'

setupGlobalErrorLogging({ page: 'sprite_studio' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SpriteStudioPage />
  </React.StrictMode>
)
