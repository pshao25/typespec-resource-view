import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProduction = process.argv.includes("--production");

const commonOptions = {
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
};

// Extension Host only (Node.js, CJS) — no webview bundle needed anymore
const extCtx = await esbuild.context({
  ...commonOptions,
  entryPoints: ["src/extension.ts"],
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  outfile: "out/extension.js",
});

if (isWatch) {
  await extCtx.watch();
  console.log("[esbuild] watching for changes...");
} else {
  await extCtx.rebuild();
  await extCtx.dispose();
  console.log("[esbuild] build complete.");
}
