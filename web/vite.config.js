import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

const IMAGES_DIR = path.resolve(__dirname, "../images");

// Serve the crawled images (which live outside web/) at /images during dev.
// Vite 7 won't serve through a symlink whose target is outside the root, so we
// stream the files directly.
function serveImages() {
  return {
    name: "serve-images",
    configureServer(server) {
      server.middlewares.use("/images", (req, res, next) => {
        const rel = decodeURIComponent(req.url.split("?")[0]);
        const file = path.join(IMAGES_DIR, rel);
        // Stay inside the images dir
        if (!file.startsWith(IMAGES_DIR) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "image/png");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: ".",
  publicDir: false,
  plugins: [serveImages()],
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
