import { build } from "bun";
import { watch } from "node:fs";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { BUNDLES, ICONS, createManifest, type Target } from "./build/manifest.ts";

/**
 * bun build.ts [chrome|firefox|safari|all]   (set NODE_ENV=production for minified output)
 *
 * dist layout: background.js, sites/<bundle>/{content.js,*.css}, ui/popup/, icons, manifest.json.
 */

export interface BuildOptions {
  target: Target;
  outdir: string;
  minify: boolean;
  /** Test-only extras (see e2e/extension): a bridge content script and a background wrapper. */
  e2e?: boolean;
}

const SITES = Object.keys(BUNDLES) as (keyof typeof BUNDLES)[];

/**
 * Comments, and whitespace next to braces, semicolons and commas; never the space between two
 * selectors. (Bun's CSS minifier would add :-webkit-any()/:-moz-any() copies of every :is() rule,
 * nearly tripling the YouTube stylesheet for browsers that can't run this extension anyway.)
 */
const minifyCss = (css: string): string =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();

export async function buildExtension({ target, outdir, minify, e2e = false }: BuildOptions) {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  // Content scripts are classic scripts, and every script injected into a page shares one
  // isolated world: on x.com the social and focus bundles run side by side. Each bundle gets its
  // own function scope, or their minified top-level names (`var b`, `var S`) overwrite each other.
  const bundle = async (
    entrypoints: string[],
    root: string,
    out = outdir,
    format: "iife" | "esm" = "iife",
  ) => {
    const result = await build({
      entrypoints,
      outdir: out,
      root,
      target: "browser",
      minify,
      format,
      // Shared UI fonts are copied once to ui/fonts/ (below), not inlined into every page.
      external: ["/ui/fonts/*"],
    });
    if (!result.success) throw new Error(result.logs.join("\n"));
  };

  await bundle(
    ["src/background.ts", ...SITES.map((site) => `src/sites/${site}/content.ts`)],
    "src",
  );
  if (e2e) {
    // wraps the real background so the exact same code runs, plus the test hook
    await bundle(["e2e/extension/background.ts", "e2e/extension/bridge.ts"], "e2e/extension");
  }

  // each site's stylesheets (attached by the manifest), and the popup with its script and
  // styles bundled in
  for (const site of SITES) {
    await mkdir(join(outdir, "sites", site), { recursive: true });
    for (const file of BUNDLES[site]) {
      const css = await readFile(`src/sites/${site}/${file}`, "utf8");
      await writeFile(join(outdir, "sites", site, file), minify ? minifyCss(css) : css);
    }
  }
  await bundle(
    ["src/ui/popup/index.html", "src/ui/picker/index.html"],
    "src/ui",
    join(outdir, "ui"),
    "esm",
  );
  // Both pages share these fonts, so they ship once (with their licences) instead of being
  // inlined into each page's stylesheet. theme.css refers to them as /ui/fonts/*.
  await cp("src/ui/shared/fonts", join(outdir, "ui", "fonts"), { recursive: true });
  if (minify) {
    // Comments and indentation only: a newline still separates elements, so inline spacing is kept.
    for (const page of ["popup", "picker"]) {
      const file = join(outdir, "ui", page, "index.html");
      const html = await readFile(file, "utf8");
      await writeFile(file, html.replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s+/g, "\n"));
    }
  }
  for (const icon of Object.values(ICONS)) {
    await cp(join("icons", icon), join(outdir, icon));
  }

  const bridge = e2e
    ? [{ matches: ["http://127.0.0.1/*"], js: ["bridge.js"], run_at: "document_start" }]
    : [];
  await writeFile(
    join(outdir, "manifest.json"),
    JSON.stringify(createManifest(target, bridge), null, 2),
  );

  // Firefox add-on review wants the real source next to the (minified) bundle
  if (target === "firefox" && process.env.FIREFOX_FOR_REVIEW === "1") {
    const source = join(outdir, "source");
    for (const path of ["src", "build", "icons", "build.ts", "package.json", "tsconfig.json"]) {
      await cp(path, join(source, path), { recursive: true });
    }
    console.log(`✓ Added source code to ${source}/ for review`);
  }

  console.log(`✓ Built ${target} extension to ${outdir}/`);
}

const outdirFor = (target: Target) => (target === "chrome" ? "dist" : `dist-${target}`);

if (import.meta.main) {
  const arg = process.argv[2] ?? "chrome";
  const production = process.env.NODE_ENV === "production";

  if (production) {
    const targets: Target[] = arg === "all" ? ["chrome", "firefox", "safari"] : [arg as Target];
    for (const target of targets) {
      await buildExtension({ target, outdir: outdirFor(target), minify: true });
    }
    process.exit();
  }

  // development: unminified Chrome build, rebuilt on every change
  const rebuild = () => buildExtension({ target: "chrome", outdir: "dist", minify: false });
  await rebuild();
  console.log("Watching for changes...");
  for (const dir of ["src", "icons", "build"]) {
    watch(dir, { recursive: true }, (_event, file) => {
      console.log(`${dir}/${file} changed, rebuilding`);
      void rebuild();
    });
  }
}
