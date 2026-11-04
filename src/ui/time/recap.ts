/** The year's recap: a few screens of what the year's numbers say, ending in a card to share. */
import { computeRecap, recapPeriod, recapYears, type Recap } from "../../time/recap.ts";
import type { DayRecord } from "../../time/store.ts";
import { formatDuration } from "../../time/tracker.ts";
import { cardFonts, drawRecapCard } from "./card.ts";

const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );
const DAY = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const STEPS = 5;

export interface RecapHost {
  siteIcon(host: string): HTMLElement;
  loadIcons(hosts: string[]): Promise<Map<string, CanvasImageSource>>;
  brand(): CanvasImageSource | null;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

const hourName = (hour: number) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));

function screens(recap: Recap, host: RecapHost): HTMLElement[] {
  const when = recapPeriod(recap);
  const perDay = recap.activeDays ? recap.seconds / recap.activeDays : 0;
  const most = recap.sites[0]?.seconds ?? 1;
  const topMonth = Math.max(...recap.months, 1);
  const first = el(
    "div",
    "recap-screen",
    el("p", "recap-lead", `In ${when}, you spent`),
    el("p", "recap-big", formatDuration(recap.seconds)),
    el(
      "p",
      "recap-lead",
      `in your browser, on ${recap.siteCount} ${recap.siteCount === 1 ? "site" : "sites"}, across ${recap.activeDays} ${recap.activeDays === 1 ? "day" : "days"}. That's ${formatDuration(perDay)} on a day you were online.`,
    ),
  );
  const sites = el(
    "div",
    "recap-screen",
    el("p", "recap-lead", recap.sites[0] ? `Most of it went to ${recap.sites[0].host}.` : ""),
    el(
      "ol",
      "recap-sites",
      ...recap.sites.map((site) => {
        const fill = el("span", "");
        fill.style.transform = `scaleX(${site.seconds / most})`;
        return el(
          "li",
          "",
          host.siteIcon(site.host),
          el("span", "site-name", site.host),
          el("span", "long-bar", fill),
          el("span", "site-time", formatDuration(site.seconds)),
        );
      }),
    ),
  );
  const months = el(
    "ol",
    "recap-months",
    ...recap.months.map((seconds, index) => {
      const bar = el("span", index === recap.busiestMonth ? "is-top" : "");
      bar.style.height = `${Math.max(seconds ? 3 : 0, (seconds / topMonth) * 100)}%`;
      const name = MONTHS[index] ?? "";
      const month = el("li", "", el("span", "recap-month-bar", bar), name.slice(0, 1));
      month.title = `${name}: ${formatDuration(seconds)}`;
      return month;
    }),
  );
  const day = recap.busiestDay;
  const rhythm = el(
    "div",
    "recap-screen",
    el("p", "recap-lead", `Your biggest month was ${MONTHS[recap.busiestMonth]}.`),
    months,
    el(
      "p",
      "recap-note",
      [
        day
          ? `Your biggest day was ${DAY.format(new Date(`${day.date}T12:00`))}, at ${formatDuration(day.seconds)}.`
          : "",
        recap.busiestHour === null
          ? ""
          : `You're online most around ${hourName(recap.busiestHour)}.`,
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );
  const longest = recap.longest;
  const stretch = el(
    "div",
    "recap-screen",
    el("p", "recap-lead", "Your longest stretch on one site was"),
    el("p", "recap-big", longest ? formatDuration(longest.seconds) : "—"),
    longest
      ? el(
          "p",
          "recap-site-line",
          host.siteIcon(longest.host),
          `${longest.host}, ${DAY.format(longest.start)}`,
        )
      : "",
    el(
      "p",
      "recap-note",
      recap.sessions ? `One of ${recap.sessions.toLocaleString()} visits in ${recap.year}.` : "",
    ),
  );
  const canvas = document.createElement("canvas");
  canvas.id = "recapCard";
  canvas.width = 2400;
  canvas.height = 1350;
  const share = el("div", "recap-screen recap-share", canvas);
  return [first, sites, rhythm, stretch, share];
}

export function bindRecap(getDays: () => DayRecord[], host: RecapHost): void {
  const dialog = $<HTMLDialogElement>("recapDialog");
  const open = $<HTMLButtonElement>("openRecap");
  let recap: Recap | null = null;
  let step = 0;
  let pages: HTMLElement[] = [];

  const draw = async () => {
    if (!recap) return;
    const canvas = $<HTMLCanvasElement>("recapCard");
    await cardFonts();
    const icons = await host.loadIcons(recap.sites.map((site) => site.host));
    drawRecapCard(canvas, recap, {
      names: $<HTMLInputElement>("recapNames").checked,
      icon: host.brand(),
      siteIcons: icons,
    });
  };

  const show = (next: number) => {
    step = Math.max(0, Math.min(STEPS - 1, next));
    $("recapBody").replaceChildren(pages[step]!);
    $<HTMLButtonElement>("recapBack").disabled = step === 0;
    $<HTMLButtonElement>("recapNext").hidden = step === STEPS - 1;
    $("recapShare").hidden = step !== STEPS - 1;
    $("recapStep").textContent = `${step + 1} of ${STEPS}`;
    if (step === STEPS - 1) void draw();
  };

  const load = (year: number) => {
    recap = computeRecap(getDays(), year);
    pages = screens(recap, host);
    $("recapTitle").textContent = recapPeriod(recap);
    show(0);
  };

  const blob = () =>
    new Promise<Blob>((resolve, reject) =>
      $<HTMLCanvasElement>("recapCard").toBlob(
        (made) => (made ? resolve(made) : reject(new Error("no image"))),
        "image/png",
      ),
    );

  /** The newest year with anything in it, on the button. */
  const refresh = () => {
    const [year] = recapYears(getDays());
    open.hidden = year === undefined;
    if (year !== undefined) open.textContent = `${year} recap`;
  };

  open.addEventListener("click", () => {
    const years = recapYears(getDays());
    const picker = $<HTMLSelectElement>("recapYear");
    picker.replaceChildren(
      ...years.map((year) => {
        const option = document.createElement("option");
        option.value = option.textContent = String(year);
        return option;
      }),
    );
    picker.hidden = years.length < 2;
    if (years[0] !== undefined) load(years[0]);
    dialog.showModal();
  });
  $<HTMLSelectElement>("recapYear").addEventListener("change", (event) =>
    load(Number((event.target as HTMLSelectElement).value)),
  );
  $("closeRecap").addEventListener("click", () => dialog.close());
  $("recapBack").addEventListener("click", () => show(step - 1));
  $("recapNext").addEventListener("click", () => show(step + 1));
  $("recapNames").addEventListener("change", () => void draw());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") show(step + 1);
    else if (event.key === "ArrowLeft") show(step - 1);
  });
  $("recapSave").addEventListener("click", async () => {
    const url = URL.createObjectURL(await blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `unhooked-recap-${recap?.year}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    $("recapStatus").textContent = `Saved ${link.download}`;
  });
  $("recapCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
      $("recapStatus").textContent = "Copied. Paste it anywhere.";
    } catch {
      $("recapStatus").textContent = "Couldn't copy it. Save it instead.";
    }
  });
  refresh();
  document.addEventListener("uh-time-loaded", refresh);
}
