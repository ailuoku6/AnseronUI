import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DevtoolsStore } from './store';
import './styles.css';
const store = new DevtoolsStore();
createRoot(document.getElementById('root')!).render(<StrictMode><App store={store} /></StrictMode>);
