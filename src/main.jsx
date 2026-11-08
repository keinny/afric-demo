import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Gate from './Login';
import { StoreProvider } from './store';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <Gate>
        <App />
      </Gate>
    </StoreProvider>
  </React.StrictMode>
);
