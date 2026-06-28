import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import UpdatePrompt from './components/UpdatePrompt.jsx'
import { initTheme } from './lib/theme'
import './styles.css'

initTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
      <UpdatePrompt />
    </BrowserRouter>
  </React.StrictMode>,
)
