import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: ".",
  publicDir: false,
  resolve: {
    alias: {
      "/images": path.resolve(__dirname, "../images"),
    },
  },
  server: {
    open: true,
    fs: {
      allow: [".."],
    },
  },
  build: {
    outDir: "dist",
  },
});
