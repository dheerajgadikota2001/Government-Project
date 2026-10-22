import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// Two builds from one source:
//  - the site (default): absolute paths, real addresses, split by page so the first screen is small
//  - SINGLE=1: everything inlined into one HTML file with hash addresses, for the preview artifact
const single = process.env.SINGLE === "1"

export default defineConfig({
  base: single ? "./" : "/",
  define: { "import.meta.env.VITE_ROUTES": JSON.stringify(single ? "hash" : "path") },
  plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    chunkSizeWarningLimit: single ? 6000 : 600,
    outDir: single ? "dist-single" : "dist",
    rollupOptions: single ? undefined : {
      output: {
        // libraries that several pages share get their own long-lived files
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three"
          if (id.includes("node_modules/d3") || id.includes("node_modules/recharts") || id.includes("node_modules/internmap") || id.includes("node_modules/delaunator") || id.includes("node_modules/robust-predicates")) return "charts"
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react"
          if (id.includes("node_modules/radix-ui") || id.includes("node_modules/@radix-ui") || id.includes("node_modules/cmdk") || id.includes("node_modules/vaul") || id.includes("node_modules/sonner")) return "ui"
          if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion")) return "motion"
          if (id.includes("node_modules/lucide-react")) return "icons"
        },
      },
    },
  },
})
