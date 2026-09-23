import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { InstitutionConfigProvider } from './context/InstitutionConfigContext.tsx'
import './index.css'
import { queryClient } from './lib/queryClient.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InstitutionConfigProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </InstitutionConfigProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
