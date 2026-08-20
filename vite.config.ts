import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { BASE } from "./site.config.js"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
    base: BASE,
    plugins: [react()],
    resolve: {
        alias: {
            // The page components import Framer's runtime. Point that specifier at a
            // local shim so the exported source stays byte-for-byte identical to the
            // Framer original.
            framer: fileURLToPath(new URL("./src/framer/index.tsx", import.meta.url)),
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        // The pages are large, self-contained components; the warning is expected
        // and each page is code-split into its own chunk anyway.
        chunkSizeWarningLimit: 1200,
    },
    server: { fs: { allow: [root] } },
})
