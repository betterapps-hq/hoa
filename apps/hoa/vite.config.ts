import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000)
  },
  resolve: {
    tsconfigPaths: true
  },
  // The server runs in workerd, Cloudflare's runtime, in development as in production. TanStack Start must run before
  // the React plugin so it can transform server functions first.
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset({ target: "19" })] })
  ]
})
