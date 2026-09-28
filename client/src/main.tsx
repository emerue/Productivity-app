import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { showToast } from './data/ui';
import { applyStoredTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/tasks.css';
import './styles/views.css';
import './styles/focus.css';
import './styles/plan.css';
import './styles/settings.css';

applyStoredTheme();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      showToast(
        'Update available',
        { label: 'Reload', run: () => void updateSW(true) },
        { sticky: true },
      );
    },
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
