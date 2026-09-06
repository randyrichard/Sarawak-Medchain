import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  server: { port: 5181 },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * Keep the charting library out of the first load.
         *
         * This was `manualChunks: { charts: ['recharts'] }`. The array form tells Rollup to
         * seed a chunk from that module *and everything reachable from it*, and React is
         * reachable from recharts — so React landed inside the charts chunk. The app cannot
         * boot without React, so the entry ended up statically importing the chunk:
         *
         *     import{r as h,a as na,R as sa,b as aa}from"./charts-CQcKiN0C.js"
         *
         * which is React being pulled out of a 525 kB bundle. Vite then quite correctly
         * emitted <link rel="modulepreload"> for it in index.html, so every visitor fetched
         * the whole charting library before the sign-in form could render — on a screen
         * that has no charts, and before they had even proved they have an account.
         *
         * The function form only claims modules whose path actually matches, so recharts and
         * the d3 packages it depends on go to `charts` while React stays where Rollup would
         * naturally put it. The chunk is then reachable only from the analytics pages that
         * import it, which are all lazy, so nothing preloads it.
         *
         * d3 and victory-vendor are named explicitly because they are recharts' dependencies
         * and nothing else here uses them; leaving them out would strand them in the entry,
         * which is the same problem in a smaller coat.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // Charts first: recharts' own tree, so these are claimed before the React rule
          // below can see them.
          if (/node_modules[\\/](recharts|victory-vendor|internmap|decimal\.js-light|fast-equals|d3-[^\\/]+)[\\/]/.test(id)) {
            return 'charts'
          }

          // React needs a chunk of its own, and this is the line that actually fixes the
          // problem. Without it Rollup has to place React somewhere — it is shared between
          // the entry and the charts chunk — and it chose to fold it into `charts`, which
          // is what dragged the whole charting library onto the critical path. Naming the
          // chunk explicitly means neither side can absorb it.
          //
          // The trailing separator in the pattern matters: `react` must not also match
          // `react-router-dom`, which belongs with the rest of the app.
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'react'
          }

          return undefined
        },
      },
    },
  },
})
