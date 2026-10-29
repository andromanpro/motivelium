import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App.tsx';
import {prepareFonts} from '../../render/fonts.ts';

try{await prepareFonts()}catch(e){
 const warning=document.createElement('p');warning.setAttribute('role','alert');warning.textContent=(e as Error).message;document.body.prepend(warning);
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
