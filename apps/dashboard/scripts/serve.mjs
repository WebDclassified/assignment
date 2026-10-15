// Minimal static serve for apps/dashboard/dist using the in-store send module.
// serve-handler is intentionally not used; the only static-serve primitive available
// in this workspace is send (in node_modules/.pnpm/serve-static@.../send).
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sendFn from "./node_modules/.pnpm/serve-static@1.16.3/node_modules/send/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "..", "dist");

const PORT = Number(process.env.PORT ?? 5173);

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const stream = sendFn(request, url.pathname, {
      root: distDir,
      index: ["index.html"],
    });
    stream.on("error", (error) => {
      if (response.headersSent) return;
      console.error("send error:", error.code, request.url);
      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain");
      response.end("Not found");
    });
    stream.pipe(response);
  } catch (error) {
    console.error("serve error:", error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.end(String(error));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Static preview listening on http://localhost:${PORT}`);
});
