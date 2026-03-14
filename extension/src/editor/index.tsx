import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import Editor from './Editor';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Editor />
    <Toaster />
  </StrictMode>
);
