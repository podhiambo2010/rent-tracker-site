import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

console.log("🔥 VITE CONFIG LOADED");

export default defineConfig({
  plugins: [react()],
})
