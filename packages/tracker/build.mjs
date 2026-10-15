import * as esbuild from "esbuild";

const result = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "pathlens",
  outfile: "dist/pathlens-tracker.js",
  minify: true,
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
});

if (result.errors.length > 0) {
  console.error("Build failed:", result.errors);
  process.exit(1);
}

console.log("Built dist/pathlens-tracker.js");
