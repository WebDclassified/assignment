import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const page = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// The tracker reads its configuration (data-api-base / data-site-id) from the
// script tag. Production defaults to the same origin that serves the demo.
// Set VITE_API_BASE_URL for split deployments.
function demoTrackerConfig(): Plugin {
  const siteId = process.env.VITE_SITE_ID ?? "demo-store";
  return {
    name: "demo-tracker-config",
    transformIndexHtml: {
      order: "post",
      handler(html, _ctx) {
        const apiBase = process.env.VITE_API_BASE_URL ?? "";
        return html.replace(
          /(<script\b[^>]*tracker-entry[^>]*)(>)(<\/script>)/,
          (_match, open, bracket, close) => {
            const cleaned = open
              .replace(/\sdata-api-base="[^"]*"/, "")
              .replace(/\sdata-site-id="[^"]*"/, "");
            return `${cleaned} data-api-base="${apiBase}" data-site-id="${siteId}"${bracket}${close}`;
          },
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), demoTrackerConfig()],
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    // Local production verification serves the built dashboard on the same
    // port as development did, and forwards API calls to the production API
    // so the browser keeps using same-origin URLs.
    port: 5173,
    strictPort: true,
    open: false,
    proxy: {
      // Keep the original Host so the API's same-origin bypass matches and
      // no CORS allowlist entry is needed (Vite rewrites Host by default when
      // the target is given as a plain string).
      "/api": { target: "http://localhost:4000", changeOrigin: false },
      "/health": { target: "http://localhost:4000", changeOrigin: false },
    },
  },
  envPrefix: ["VITE_"],
  build: {
    outDir: "dist",
    rollupOptions: {
      // The demo storefront is a static multi-page app served under /demo/.
      input: {
        main: page("./index.html"),
        demoBlogHome: page("./demo-blog/index.html"),
        demoBlogPost: page("./demo-blog/post-1/index.html"),
        demoBlogAbout: page("./demo-blog/about/index.html"),
        demoSpa: page("./demo-spa/index.html"),
        demoHome: page("./demo/index.html"),
        demoProducts: page("./demo/products/index.html"),
        demoHeadphones: page("./demo/products/headphones/index.html"),
        demoKeyboard: page("./demo/products/keyboard/index.html"),
        demoCart: page("./demo/cart/index.html"),
        demoCheckout: page("./demo/checkout/index.html"),
      },
    },
  },
});
