import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/GlobalErrorModal';
import { suppressExtensionErrors } from './utils/suppressErrors';
import './index.css';

suppressExtensionErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
