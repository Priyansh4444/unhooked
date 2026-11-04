// bun scripts/build-site.ts [video.mp4]
// Puts the website in dist-site, ready for: bunx wrangler deploy --config site/wrangler.jsonc
// The video isn't in the repository. It's encoded to fit Cloudflare's 25 MiB limit per file.
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";

const OUT = "dist-site";
const video = process.argv[2] ?? `${homedir()}/Videos/unhooked-demo.mp4`;
const run = async (...args: string[]) => {
  if ((await Bun.spawn(args, { stdout: "ignore", stderr: "inherit" }).exited) !== 0)
    throw new Error(`failed: ${args[0]}`);
};

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/media`, { recursive: true });
await mkdir(`${OUT}/fonts`, { recursive: true });
for (const file of ["index.html", "404.html", "style.css", "_headers"])
  await cp(`site/${file}`, `${OUT}/${file}`);
for (const font of ["newsreader.woff2", "commit-mono.woff2"])
  await cp(`src/ui/shared/fonts/${font}`, `${OUT}/fonts/${font}`);
await cp("icons/icon.svg", `${OUT}/media/icon.svg`);
for (const image of ["popup.png", "wand.gif", "time.gif", "recap-card.png", "youtube-after.png"])
  await cp(`docs/screenshots/${image}`, `${OUT}/media/${image}`);
await run(
  "ffmpeg",
  "-y",
  "-loglevel",
  "error",
  "-i",
  video,
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "26",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-an",
  `${OUT}/media/unhooked-demo.mp4`,
);
await run(
  "ffmpeg",
  "-y",
  "-loglevel",
  "error",
  "-ss",
  "24",
  "-i",
  video,
  "-frames:v",
  "1",
  "-q:v",
  "3",
  `${OUT}/media/poster.jpg`,
);
const size = (await stat(`${OUT}/media/unhooked-demo.mp4`)).size / 1048576;
if (size > 24) throw new Error(`the video is ${size.toFixed(1)} MiB, over the limit`);
console.log(`✓ ${OUT}, video ${size.toFixed(1)} MiB`);
