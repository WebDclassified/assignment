// Vercel api-service entrypoint (see vercel.json `services.api.entrypoint`).
//
// Vercel validates the entrypoint path before the service build runs, so it
// cannot point directly at gitignored build output. This committed shim
// exists to satisfy that check; the service build (`pnpm bundle`) replaces
// dist/server.bundle.cjs with a fully self-contained bundle (every
// dependency, including mongodb, inlined), which is what actually executes.
// Requiring it here runs the same startup path as `node dist/server.js`.
module.exports = require("./dist/server.bundle.cjs");
