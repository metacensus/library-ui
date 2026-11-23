import react from '@astrojs/react'
import { defineConfig } from 'astro/config'
import routeInventory from '@metacensus/library-ui/inventory/routes.mjs'

export default defineConfig({
  site: 'https://example.com',
  integrations: [react(), routeInventory()],
})
