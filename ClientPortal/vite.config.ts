import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8081,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/assets": "http://127.0.0.1:8000",
      "/sw-client.js": "http://127.0.0.1:8000",
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    outDir: "../log/public/client",
    emptyOutDir: true,
    target: "es2015",
  },
})
