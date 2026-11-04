// bun scripts/site-icons.ts
// Fetches the icons of popular sites into icons/sites as 32px PNGs, and lists them in
// src/shared/site-icon-hosts.ts. They ship with the extension, so showing one makes no request.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOSTS = `
claude.ai anthropic.com chatgpt.com openai.com gemini.google.com deepmind.google x.ai grok.com
meta.ai mistral.ai perplexity.ai deepseek.com huggingface.co cohere.com qwen.ai kimi.com
moonshot.ai z.ai together.ai groq.com cursor.com replicate.com openrouter.ai midjourney.com
runwayml.com elevenlabs.io stability.ai character.ai poe.com copilot.microsoft.com lovable.dev
v0.app windsurf.com ollama.com suno.com notebooklm.google
x.com youtube.com reddit.com github.com instagram.com tiktok.com twitch.tv kick.com linkedin.com
facebook.com threads.com bsky.app discord.com slack.com web.whatsapp.com web.telegram.org
snapchat.com pinterest.com tumblr.com mastodon.social
google.com wikipedia.org amazon.com ebay.com netflix.com spotify.com soundcloud.com apple.com
microsoft.com bing.com duckduckgo.com yahoo.com imgur.com vimeo.com medium.com substack.com
news.ycombinator.com stackoverflow.com gitlab.com npmjs.com vercel.com cloudflare.com figma.com
notion.so linear.app dropbox.com paypal.com steampowered.com roblox.com nytimes.com bbc.com
`
  .split(/\s+/)
  .filter(Boolean);
/** Black on nothing, which wouldn't show on a dark page. */
const INVERT = new Set("github.com medium.com vercel.com threads.com nytimes.com".split(" "));
const OUT = "icons/sites";
const scratch = join(tmpdir(), "unhooked-site-icons");

const run = async (args: string[]) =>
  (await new Response(Bun.spawn(args, { stderr: "ignore" }).stdout).text()).trim();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(scratch, { recursive: true });
const done: string[] = [];
for (const host of HOSTS) {
  const source = join(scratch, `${host}.ico`);
  const fetched = await fetch(`https://icons.duckduckgo.com/ip3/${host}.ico`).catch(() => null);
  const icon = fetched?.ok ? fetched : await fetch(`https://${host}/favicon.ico`).catch(() => null);
  if (!icon?.ok) {
    console.log("no icon:", host);
    continue;
  }
  await writeFile(source, Buffer.from(await icon.arrayBuffer()));
  const frames = (await run(["identify", "-format", "%p %w\n", source])).split("\n");
  const largest = frames.sort((a, b) => Number(b.split(" ")[1]) - Number(a.split(" ")[1]))[0];
  if (!largest) {
    console.log("unreadable:", host);
    continue;
  }
  await run([
    "magick",
    `${source}[${largest.split(" ")[0]}]`,
    "-resize",
    "32x32",
    ...(INVERT.has(host) ? ["-channel", "RGB", "-negate", "+channel"] : []),
    "-strip",
    "-define",
    "png:compression-level=9",
    `PNG32:${join(OUT, `${host}.png`)}`,
  ]);
  done.push(host);
}
await writeFile(
  "src/shared/site-icon-hosts.ts",
  `// Written by scripts/site-icons.ts.\nexport const SITE_ICON_HOSTS: readonly string[] = ${JSON.stringify(done.sort())};\n`,
);
console.log(done.length, "icons");
