import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Without this, the dev server's dependency scan reads every .html file
    // in the project as an app entry, including the share card template in
    // scripts/share-cards/card.html, whose inline script is not app code and
    // fails the scan. The app has exactly one entry.
    entries: ['index.html'],
  },
})
