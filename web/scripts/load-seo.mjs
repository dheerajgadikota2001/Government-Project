// Loads src/lib/seo.ts (the page list: TypeScript that imports the site's data) as a module, for the build scripts.
// esbuild turns it into one file; the file is removed straight after it is imported.
import { build } from 'esbuild'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function loadSeo(web) {
  const mod = join(web, 'node_modules/.cache', `seo-${process.pid}-${Date.now()}.mjs`)
  await build({
    entryPoints: [join(web, 'src/lib/seo.ts')], outfile: mod, bundle: true, format: 'esm', platform: 'node',
    alias: { '@': join(web, 'src') }, external: ['react'], logLevel: 'warning',
    define: { 'import.meta.env.VITE_ROUTES': '"path"', 'import.meta.env.VITE_API_URL': 'undefined' },
  })
  const seo = await import(pathToFileURL(mod).href)   // a bare C:\\ path is not an import specifier on Windows
  rmSync(mod, { force: true })
  return seo
}
