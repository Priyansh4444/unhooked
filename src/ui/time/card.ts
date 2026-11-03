/**
 * The share card: the view drawn on a canvas at twice its size, 2400 by 1350, because a timeline
 * shows 16:9 best and recompresses whatever it's given. The page's own type and colours, no chrome.
 */
import { areaPath, smoothPath } from "./curve.ts";
import { comparison, hourLabel, periodPhrase, type View } from "../../time/stats.ts";
import { formatDuration } from "../../time/tracker.ts";

const INK = "#0a0a0a";
const RULE = "#262626";
const PARCHMENT = "#d4cec4";
const BRIGHT = "#f2ede4";
const STONE = "#8a857c";
const DIM = "#5c5852";
const AMBER = "#d6a24e";
const RED = "#e3170c";
const MONO = '"Commit Mono", ui-monospace, monospace';
const SERIF = '"Newsreader", Georgia, serif';

const WIDTH = 1200;
const HEIGHT = 675;
const PAD = 60;

export async function cardFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load(`500 120px ${MONO}`),
    document.fonts.load(`32px ${SERIF}`),
  ]).catch(() => {});
}

function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export function drawCard(
  canvas: HTMLCanvasElement,
  view: View,
  { names, icon }: { names: boolean; icon: CanvasImageSource | null },
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";

  // Brand, and what this is a picture of.
  if (icon) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, PAD - 6, 36, 36, 8);
    ctx.clip();
    ctx.drawImage(icon, PAD, PAD - 6, 36, 36);
    ctx.restore();
  }
  ctx.fillStyle = BRIGHT;
  ctx.font = `30px ${SERIF}`;
  ctx.fillText("unhooked", PAD + (icon ? 48 : 0), PAD + 22);
  ctx.textAlign = "right";
  ctx.fillStyle = STONE;
  ctx.font = `15px ${MONO}`;
  const subject = view.site ? (names ? view.site : "One site") : "My time online";
  ctx.fillText(fit(ctx, subject, 420), WIDTH - PAD, PAD + 20);
  ctx.textAlign = "left";

  // The number.
  ctx.fillStyle = BRIGHT;
  ctx.font = `500 112px ${MONO}`;
  // Monospace spaces are as wide as digits; close them up, as the page does.
  ctx.letterSpacing = "-4px";
  ctx.wordSpacing = "-34px";
  ctx.fillText(formatDuration(view.total), PAD - 4, 222);
  ctx.letterSpacing = "0px";
  ctx.wordSpacing = "0px";
  ctx.fillStyle = PARCHMENT;
  ctx.font = `28px ${SERIF}`;
  ctx.fillText(`online ${periodPhrase(view.range)}`, PAD, 264);
  const compare = comparison(view);
  if (compare) {
    ctx.fillStyle = STONE;
    ctx.font = `22px ${SERIF}`;
    ctx.fillText(compare, PAD, 296);
  }

  // Sessions, when there are any to speak of.
  if (view.sessions.count) {
    const { count, average, longest } = view.sessions;
    ctx.fillStyle = STONE;
    ctx.font = `15px ${MONO}`;
    ctx.fillText(
      `${count} ${count === 1 ? "session" : "sessions"} · average ${formatDuration(average)} · longest ${formatDuration(longest?.seconds ?? 0)}`,
      PAD,
      compare ? 324 : 296,
    );
  }

  // Where it went: ranked, one hue, one baseline.
  const left = { x: PAD, width: 500 };
  const rows = view.sites.slice(0, 5);
  const top = rows[0]?.seconds ?? 1;
  rows.forEach((row, i) => {
    const y = 356 + i * 50;
    ctx.fillStyle = PARCHMENT;
    ctx.font = `17px ${MONO}`;
    const time = formatDuration(row.seconds);
    const timeWidth = ctx.measureText(time).width;
    const name = names ? row.host : `Site ${i + 1}`;
    ctx.fillText(fit(ctx, name, left.width - timeWidth - 16), left.x, y);
    ctx.textAlign = "right";
    ctx.fillStyle = STONE;
    ctx.fillText(time, left.x + left.width, y);
    ctx.textAlign = "left";
    ctx.fillStyle = RULE;
    ctx.beginPath();
    ctx.roundRect(left.x, y + 10, left.width, 4, 2);
    ctx.fill();
    ctx.fillStyle = view.site && row.host === view.site ? RED : AMBER;
    ctx.beginPath();
    ctx.roundRect(left.x, y + 10, Math.max(4, (row.seconds / top) * left.width), 4, 2);
    ctx.fill();
  });

  // When: the dot matrix.
  const grid = { x: 636, y: 140, cell: 20 };
  const peak = Math.max(1, ...view.heat.flat());
  ctx.font = `12px ${MONO}`;
  ["M", "T", "W", "T", "F", "S", "S"].forEach((day, d) => {
    ctx.fillStyle = DIM;
    ctx.fillText(day, grid.x - 22, grid.y + d * grid.cell + 14);
    for (let h = 0; h < 24; h++) {
      const value = view.heat[d]?.[h] ?? 0;
      const cx = grid.x + h * grid.cell + grid.cell / 2;
      const cy = grid.y + d * grid.cell + grid.cell / 2;
      const strength = Math.sqrt(value / peak);
      ctx.beginPath();
      ctx.arc(cx, cy, value ? 2.5 + strength * 5.5 : 2, 0, Math.PI * 2);
      ctx.fillStyle = value ? AMBER : RULE;
      ctx.globalAlpha = value ? 0.35 + strength * 0.65 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  [0, 6, 12, 18].forEach((hour) => {
    ctx.fillStyle = DIM;
    ctx.fillText(hourLabel(hour), grid.x + hour * grid.cell + 4, grid.y + 7 * grid.cell + 20);
  });

  // Over time: the same smooth line as the page, with the same fade under it.
  const chart = { x: 636, y: 340, width: 504, height: 186 };
  const base = chart.y + chart.height;
  const plotted = view.points.filter((point) => !point.future);
  const most = Math.max(1, ...plotted.map((point) => point.seconds));
  const slots = Math.max(view.points.length - 1, 1);
  const xs = plotted.map((_, i) => chart.x + (i / slots) * chart.width);
  const ys = plotted.map((point) => base - (point.seconds / most) * chart.height);
  if (plotted.length > 1) {
    const fade = ctx.createLinearGradient(0, chart.y, 0, base);
    fade.addColorStop(0, "rgb(214 162 78 / 0.34)");
    fade.addColorStop(0.55, "rgb(214 162 78 / 0.12)");
    fade.addColorStop(1, "rgb(214 162 78 / 0)");
    ctx.fillStyle = fade;
    ctx.fill(new Path2D(areaPath(xs, ys, base)));
    const line = ctx.createLinearGradient(chart.x, 0, xs.at(-1)!, 0);
    line.addColorStop(0, AMBER);
    line.addColorStop(0.95, AMBER);
    line.addColorStop(1, plotted.at(-1)!.current ? RED : AMBER);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(smoothPath(xs, ys)));
  }
  if (plotted.length) {
    ctx.beginPath();
    ctx.arc(xs.at(-1)!, ys.at(-1)!, 5, 0, Math.PI * 2);
    ctx.fillStyle = plotted.at(-1)!.current ? RED : AMBER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chart.x, base + 0.5);
  ctx.lineTo(chart.x + chart.width, base + 0.5);
  ctx.stroke();

  // Where this came from.
  ctx.textAlign = "right";
  ctx.fillStyle = DIM;
  ctx.font = `14px ${MONO}`;
  ctx.fillText("github.com/Priyansh4444/unhooked", WIDTH - PAD, HEIGHT - 38);
  ctx.textAlign = "left";
}

/** The words that go with the picture. */
export function postText(view: View, names: boolean): string {
  const time = formatDuration(view.total);
  const period = periodPhrase(view.range);
  const parts = [
    view.site && names ? `${time} on ${view.site} ${period}.` : `${time} online ${period}.`,
  ];
  const top = view.sites[0];
  if (!view.site && names && top && top.share >= 0.05)
    parts.push(`${Math.round(top.share * 100)}% of it on ${top.host}.`);
  parts.push("Tracked with Unhooked.");
  return parts.join(" ");
}
