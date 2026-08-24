import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/justgo.github.io/" : "/",
  server: {
    host: "0.0.0.0",
    port: 4173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
