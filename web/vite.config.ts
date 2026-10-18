import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The BackPocket website. Port 5174 is also allowed by the service's CORS rule
// and is where the extension's "More details" links go.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // shared/ui (types, formatting, drafting) lives outside this folder.
    fs: { allow: ['..'] },
  },
})
