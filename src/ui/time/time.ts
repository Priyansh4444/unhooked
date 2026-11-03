/**
 * Your time: what the tracker counted, for a period and optionally one site. Elements are kept and
 * updated rather than rebuilt, so a new range or a live update moves marks from where they are to
 * where they belong, and the next change can take over mid-flight.
 */
import { ext } from "../../shared/ext-api.ts";
import { STORAGE_KEYS } from "../../shared/settings.ts";
import { TIME_FLUSH } from "../../time/protocol.ts";
import {
  RANGE_LABELS,
  comparison,
  computeView,
  hourLabel,
  insights,
  periodPhrase,
  timeTicks,
  type Bar,
  type Range,
  type View,
} from "../../time/stats.ts";
import {
  allDays,
  eraseAll,
  forgetHost,
  putDays,
  restoreHost,
  type DayRecord,
} from "../../time/store.ts";
import { formatDuration } from "../../time/tracker.ts";
import { cardFonts, drawCard, postText } from "./card.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const RANGES: Range[] = ["today", "7", "30", "90", "all"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LIVE_MS = 5000;
const FIRST_ROWS = 8;

let days: DayRecord[] = [];
let range: Range = "7";
let site: string | null = null;
let view: View = computeView([], range, site, Date.now());
let allRows = false;
let tracking = true;
let ignored: string[] = [];

// ---- numbers that count to their new value --------------------------------------------------

const tweens = new WeakMap<HTMLElement, { shown: number; frame: number }>();

function countTo(el: HTMLElement, to: number, format: (value: number) => string): void {
  const state = tweens.get(el) ?? { shown: 0, frame: 0 };
  tweens.set(el, state);
  cancelAnimationFrame(state.frame);
  if (calm() || Math.abs(to - state.shown) < 1) {
    state.shown = to;
    el.textContent = format(to);
    return;
  }
  const from = state.shown;
  const started = performance.now();
  const duration = 700;
  const tick = (time: number) => {
    const t = Math.min(1, (time - started) / duration);
    state.shown = from + (to - from) * (1 - (1 - t) ** 4);
    el.textContent = format(state.shown);
    if (t < 1) state.frame = requestAnimationFrame(tick);
    else {
      state.shown = to;
      el.textContent = format(to);
    }
  };
  state.frame = requestAnimationFrame(tick);
}

const percent = (value: number) => `${Math.round(value)}%`;
const whole = (value: number) => String(Math.round(value));

// ---- the tooltip: one, gliding between marks -------------------------------------------------

const tip = $("tip");
let tipShown = false;

function showTip(target: HTMLElement): void {
  const { tipValue, tipLabel } = target.dataset;
  if (!tipLabel) return hideTip();
  $("tipValue").textContent = tipValue ?? "";
  $("tipLabel").textContent = tipLabel;
  const box = target.getBoundingClientRect();
  tip.hidden = false;
  const own = tip.getBoundingClientRect();
  const x = Math.min(
    innerWidth - own.width - 8,
    Math.max(8, box.left + box.width / 2 - own.width / 2),
  );
  const fill = target.querySelector<HTMLElement>(".fill");
  const top = fill ? Math.max(box.top, fill.getBoundingClientRect().top) : box.top;
  const y = Math.max(8, top - own.height - 8);
  // The first appearance lands in place; after that it glides.
  if (!tipShown) tip.style.transition = "opacity 120ms ease";
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tip.classList.remove("is-away");
  if (!tipShown) {
    tipShown = true;
    requestAnimationFrame(() => {
      tip.style.transition = "";
    });
  }
}

function hideTip(): void {
  tipShown = false;
  tip.classList.add("is-away");
}

function bindTips(container: HTMLElement): void {
  const over = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tip-label]");
    if (target) showTip(target);
    else hideTip();
  };
  container.addEventListener("pointermove", over);
  container.addEventListener("focusin", over);
  container.addEventListener("pointerleave", hideTip);
  container.addEventListener("focusout", hideTip);
}

/** One tab stop per chart, and arrow keys within it, instead of a hundred tab stops. */
function bindArrows(container: HTMLElement, selector: string, columns: () => number): void {
  container.addEventListener("keydown", (event: KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns(),
      ArrowDown: columns(),
    };
    const step = steps[event.key];
    if (!step) return;
    const items = [...container.querySelectorAll<HTMLElement>(selector)];
    const next = items[items.indexOf(event.target as HTMLElement) + step];
    if (!next) return;
    event.preventDefault();
    (event.target as HTMLElement).tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  });
}

// ---- time over time --------------------------------------------------------------------------

function renderBars(): void {
  const container = $("bars");
  const { bars } = view;
  const ticks = timeTicks(Math.max(...bars.map((bar) => bar.seconds), 0));
  const top = Math.max(ticks.at(-1)!, ...bars.map((bar) => bar.seconds), 1);

  const rebuilt = container.children.length !== bars.length;
  if (rebuilt) {
    container.replaceChildren(
      ...bars.map((_, i) => {
        const col = document.createElement("div");
        col.className = "col";
        col.tabIndex = i === bars.length - 1 ? 0 : -1;
        col.setAttribute("role", "img");
        const track = document.createElement("div");
        track.className = "track";
        const fill = document.createElement("div");
        fill.className = "fill";
        // They rise one after another, quickly, whatever the number of bars.
        fill.style.setProperty("--i", String(Math.round((i / bars.length) * 260)));
        track.append(fill);
        const x = document.createElement("div");
        x.className = "x";
        col.append(track, x);
        return col;
      }),
    );
    // Starting from the baseline this frame, so the change below is a rise.
    void container.offsetWidth;
  }
  bars.forEach((bar: Bar, i) => {
    const col = container.children[i] as HTMLElement;
    const seconds = bar.seconds;
    const time = seconds >= 1 ? formatDuration(seconds) : "Nothing";
    col.dataset.tipValue = time;
    col.dataset.tipLabel = bar.title;
    col.dataset.key = bar.key;
    col.setAttribute("aria-label", `${bar.title}: ${time}`);
    col.classList.toggle("is-current", bar.current);
    (col.querySelector(".x") as HTMLElement).textContent = bar.label;
    const fill = col.querySelector<HTMLElement>(".fill")!;
    fill.style.transform = `translateY(${(1 - seconds / top) * 100}%)`;
  });

  // Hairlines at round times, sliding to their new height rather than jumping.
  const grid = $("barsGrid");
  const height = grid.clientHeight || 212;
  const wanted = [0, ...ticks];
  while (grid.children.length < wanted.length) {
    const line = document.createElement("div");
    line.append(document.createElement("span"));
    grid.append(line);
  }
  [...grid.children].forEach((child, i) => {
    const line = child as HTMLElement;
    const tick = wanted[i];
    line.style.opacity = tick === undefined ? "0" : "1";
    if (tick === undefined) return;
    line.style.transform = `translateY(${height - (tick / top) * height}px)`;
    line.firstElementChild!.textContent = tick ? formatDuration(tick) : "0";
  });
}

// ---- where it went ---------------------------------------------------------------------------

function renderSites(): void {
  const list = $("sites");
  const rows = allRows ? view.sites : view.sites.slice(0, FIRST_ROWS);
  const most = view.sites[0]?.seconds ?? 1;

  // Remember where each row was, so a change of rank reads as a move.
  const before = new Map(
    [...list.children].map((li) => [
      (li as HTMLElement).dataset.host!,
      li.getBoundingClientRect().top,
    ]),
  );
  const existing = new Map(
    [...list.children].map((li) => [(li as HTMLElement).dataset.host!, li as HTMLElement]),
  );
  const items = rows.map((row) => {
    let li = existing.get(row.host);
    if (!li) {
      li = document.createElement("li");
      li.dataset.host = row.host;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "site-row";
      const name = document.createElement("span");
      name.className = "site-name";
      const time = document.createElement("span");
      time.className = "site-time";
      const bar = document.createElement("span");
      bar.className = "site-bar";
      bar.append(document.createElement("span"));
      button.append(name, time, bar);
      li.append(button);
    }
    const button = li.firstElementChild as HTMLElement;
    const [name, time, bar] = [...button.children] as HTMLElement[];
    name!.textContent = row.host;
    const label = formatDuration(row.seconds);
    time!.textContent = `${label} · ${Math.round(row.share * 100)}%`;
    button.setAttribute("aria-pressed", String(site === row.host));
    button.setAttribute(
      "aria-label",
      `${row.host}: ${label}, ${Math.round(row.share * 100)}%. Show only this site`,
    );
    li.dataset.width = String(Math.max(row.seconds / most, 0.01));
    return li;
  });
  list.replaceChildren(...items);
  list.classList.toggle("has-selection", Boolean(site));
  void list.offsetWidth;
  for (const li of items) {
    const bar = li.querySelector<HTMLElement>(".site-bar span")!;
    bar.style.transform = `translateX(${(Number(li.dataset.width) - 1) * 100}%)`;
    const was = before.get(li.dataset.host!);
    if (was === undefined || calm()) continue;
    const moved = was - li.getBoundingClientRect().top;
    if (Math.abs(moved) > 1)
      li.animate([{ transform: `translateY(${moved}px)` }, { transform: "none" }], {
        duration: 380,
        easing: "cubic-bezier(.23,1,.32,1)",
      });
  }
  const more = $("moreSites");
  more.hidden = view.sites.length <= FIRST_ROWS;
  more.textContent = allRows ? "Show fewer" : `Show all ${view.sites.length}`;
  $("sitesEmpty").hidden = view.sites.length > 0;
}

// ---- when ------------------------------------------------------------------------------------

function buildHeat(): void {
  const heat = $("heat");
  const parts: HTMLElement[] = [];
  WEEKDAYS.forEach((day, d) => {
    const label = document.createElement("span");
    label.className = "heat-day";
    label.textContent = day;
    parts.push(label);
    for (let hour = 0; hour < 24; hour++) {
      const cell = document.createElement("span");
      cell.className = "cell";
      cell.tabIndex = d === 0 && hour === 0 ? 0 : -1;
      cell.dataset.day = String(d);
      cell.dataset.hour = String(hour);
      cell.setAttribute("role", "img");
      const dot = document.createElement("i");
      dot.style.setProperty("--i", String(Math.round((hour + d) * 9)));
      cell.append(dot);
      parts.push(cell);
    }
  });
  heat.append(...parts);
  [0, 6, 12, 18].forEach((hour) => {
    const label = document.createElement("span");
    label.className = "heat-hour";
    label.style.gridColumn = String(hour + 2);
    label.textContent = hourLabel(hour);
    heat.append(label);
  });
}

function renderHeat(): void {
  const peak = Math.max(1, ...view.heat.flat());
  for (const cell of $("heat").querySelectorAll<HTMLElement>(".cell")) {
    const day = Number(cell.dataset.day);
    const hour = Number(cell.dataset.hour);
    const seconds = view.heat[day]![hour]!;
    const strength = Math.sqrt(seconds / peak);
    const dot = cell.firstElementChild as HTMLElement;
    const on = seconds >= 1;
    cell.classList.toggle("has-time", on);
    dot.style.transform = `scale(${on ? 0.42 + strength * 0.58 : 0.34})`;
    dot.style.opacity = on ? String(0.45 + strength * 0.55) : "1";
    const time = on ? formatDuration(seconds) : "Nothing";
    const label = `${WEEKDAYS[day]}, ${hourLabel(hour)}`;
    cell.dataset.tipValue = time;
    cell.dataset.tipLabel = label;
    cell.setAttribute("aria-label", `${label}: ${time}`);
  }
}

// ---- everything else -------------------------------------------------------------------------

function moveRangeMark(): void {
  const button = $("ranges").querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!button) return;
  const mark = $("rangesMark");
  mark.style.transform = `translateX(${button.offsetLeft}px) scaleX(${button.offsetWidth / 100})`;
}

function renderNumbers(): void {
  $("numbersHead").textContent = range === "today" ? "Hour" : "Day";
  $("numbersBody").replaceChildren(
    ...[...view.bars].reverse().map((bar) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = bar.title;
      const time = document.createElement("td");
      time.textContent = bar.seconds >= 1 ? formatDuration(bar.seconds) : "–";
      row.append(name, time);
      return row;
    }),
  );
}

function render(): void {
  view = computeView(days, range, site, Date.now());
  for (const button of $("ranges").querySelectorAll<HTMLElement>("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.range === range));
  }
  moveRangeMark();

  $("siteFilter").hidden = !site;
  if (site) $("clearSite").textContent = site;
  $("clearSite").setAttribute("aria-label", `Show every site instead of ${site}`);

  countTo($("hero"), view.total, formatDuration);
  const subject = site ? `on ${site}` : "online";
  $("heroNote").textContent = `${subject} ${periodPhrase(range)}`;
  $("heroCompare").textContent = comparison(view) ?? "";
  const lines = insights(view);
  const list = $("insights");
  if (list.textContent !== lines.join("")) {
    list.replaceChildren(
      ...lines.map((line, i) => {
        const item = document.createElement("li");
        item.style.setProperty("--i", String(i));
        item.textContent = line;
        return item;
      }),
    );
  }

  countTo($("tileAverage"), view.dailyAverage, formatDuration);
  $("tileDays").textContent = view.activeDays
    ? `${view.activeDays} ${view.activeDays === 1 ? "day" : "days"} with time`
    : "no days yet";
  countTo($("tileFeeds"), view.feedShare * 100, percent);
  $("feedMeter").style.transform = `translateX(${(view.feedShare - 1) * 100}%)`;
  countTo($("tileSites"), view.sites.length, whole);
  $("tileTop").textContent = view.sites[0]?.host ?? "";
  $("tilePeak").textContent = view.peakHour === null ? "None yet" : hourLabel(view.peakHour);

  renderBars();
  renderSites();
  renderHeat();
  renderNumbers();
  renderNotices();
}

function renderNotices(): void {
  const notice = $("notice");
  const nothingEver = days.length === 0;
  notice.hidden = tracking && !nothingEver;
  notice.textContent = !tracking
    ? "Counting is off, so nothing new is being added."
    : "Nothing yet. Unhooked counts the site in front while you're using it, so browse a little and come back: this page keeps itself up to date.";
  $<HTMLInputElement>("trackSwitch").checked = tracking;
  const line = $("ignored");
  line.hidden = ignored.length === 0;
  line.replaceChildren();
  if (ignored.length) {
    line.append("Not counted:");
    for (const host of ignored) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.dataset.host = host;
      button.textContent = `${host} ×`;
      button.setAttribute("aria-label", `Start counting ${host} again`);
      line.append(button);
    }
  }
}

function status(message: string, undo?: () => Promise<void>): void {
  const el = $("status");
  el.replaceChildren(message);
  if (!undo) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = "Undo";
  button.addEventListener("click", () => {
    void undo().then(() => {
      el.replaceChildren("Put back");
      return reload();
    });
  });
  el.append(button);
}

async function reload(): Promise<void> {
  await ext.runtime.sendMessage({ action: TIME_FLUSH }).catch(() => {});
  days = await allDays();
  render();
}

async function loadSettings(): Promise<void> {
  const raw = await ext.storage.local.get([STORAGE_KEYS.TIME_TRACKING, STORAGE_KEYS.TIME_IGNORED]);
  tracking = raw[STORAGE_KEYS.TIME_TRACKING] !== false;
  const list = raw[STORAGE_KEYS.TIME_IGNORED];
  ignored = Array.isArray(list) ? (list as string[]) : [];
}

// ---- sharing ---------------------------------------------------------------------------------

let iconImage: HTMLImageElement | null = null;

const showNames = () => $<HTMLInputElement>("showNames").checked;

function drawShare(): void {
  drawCard($<HTMLCanvasElement>("card"), view, { names: showNames(), icon: iconImage });
}

const cardBlob = () =>
  new Promise<Blob>((resolve, reject) =>
    $<HTMLCanvasElement>("card").toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("no image"))),
      "image/png",
    ),
  );

async function copyCard(): Promise<boolean> {
  try {
    // A promise, so the click still counts as the reason for writing to the clipboard.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": cardBlob() })]);
    return true;
  } catch {
    return false;
  }
}

async function saveCard(): Promise<void> {
  const url = URL.createObjectURL(await cardBlob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `unhooked-${range === "today" ? "today" : `${range}-days`}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  $("shareStatus").textContent = `Saved ${link.download}`;
}

function bind(): void {
  $("ranges").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button?.dataset.range) return;
    range = button.dataset.range as Range;
    render();
  });
  $("sites").addEventListener("click", (event) => {
    const li = (event.target as HTMLElement).closest<HTMLElement>("li");
    if (!li) return;
    site = site === li.dataset.host ? null : li.dataset.host!;
    render();
  });
  $("clearSite").addEventListener("click", () => {
    site = null;
    render();
  });
  $("moreSites").addEventListener("click", () => {
    allRows = !allRows;
    renderSites();
  });
  $("forgetSite").addEventListener("click", async () => {
    if (!site) return;
    const host = site;
    const removed = await forgetHost(host);
    const before = ignored;
    await ext.storage.local.set({ [STORAGE_KEYS.TIME_IGNORED]: [...ignored, host] });
    site = null;
    await loadSettings();
    status(`${host} forgotten`, async () => {
      await restoreHost(removed);
      await ext.storage.local.set({ [STORAGE_KEYS.TIME_IGNORED]: before });
      await loadSettings();
    });
    await reload();
  });
  $("ignored").addEventListener("click", async (event) => {
    const host = (event.target as HTMLElement).closest<HTMLElement>("button")?.dataset.host;
    if (!host) return;
    await ext.storage.local.set({
      [STORAGE_KEYS.TIME_IGNORED]: ignored.filter((other) => other !== host),
    });
    await loadSettings();
    status(`Counting ${host} again`);
    render();
  });
  $("trackSwitch").addEventListener("change", async (event) => {
    await ext.storage.local.set({
      [STORAGE_KEYS.TIME_TRACKING]: (event.target as HTMLInputElement).checked,
    });
    await loadSettings();
    render();
  });
  $("eraseAll").addEventListener("click", async () => {
    const kept = await allDays();
    await eraseAll();
    site = null;
    status("Everything erased", async () => putDays(kept));
    await reload();
  });

  bindTips($("bars"));
  bindTips($("heat"));
  bindArrows($("bars"), ".col", () => 0);
  bindArrows($("heat"), ".cell", () => 24);

  const dialog = $<HTMLDialogElement>("shareDialog");
  $("openShare").addEventListener("click", async () => {
    await cardFonts();
    $("shareStatus").textContent = "";
    drawShare();
    dialog.showModal();
  });
  $("closeShare").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  $("showNames").addEventListener("change", drawShare);
  $("savePng").addEventListener("click", () => void saveCard());
  $("copyPng").addEventListener("click", async () => {
    $("shareStatus").textContent = (await copyCard())
      ? "Copied. Paste it anywhere."
      : "Couldn't reach the clipboard. Save a PNG instead.";
  });
  // X's compose link takes words but not pictures, so the picture goes on the clipboard first.
  $("postX").addEventListener("click", async () => {
    const copied = await copyCard();
    if (!copied) await saveCard();
    $("shareStatus").textContent = copied
      ? "Image copied. Paste it into your post."
      : "Saved a PNG. Attach it to your post.";
    const text = encodeURIComponent(postText(view, showNames()));
    void ext.tabs.create({ url: `https://x.com/intent/post?text=${text}` });
  });

  addEventListener("resize", () => {
    moveRangeMark();
    renderBars();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void reload();
  });
  // Live while it's being looked at, moving only by what has actually changed.
  setInterval(() => {
    if (!document.hidden && !dialog.open) void reload();
  }, LIVE_MS);
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEYS.TIME_TRACKING] || changes[STORAGE_KEYS.TIME_IGNORED]) {
      void loadSettings().then(render);
    }
  });
}

async function init(): Promise<void> {
  const ranges = $("ranges");
  for (const value of RANGES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.range = value;
    button.textContent = RANGE_LABELS[value];
    ranges.append(button);
  }
  iconImage = new Image();
  iconImage.src = document.querySelector<HTMLImageElement>(".brand img")!.src;
  buildHeat();
  bind();
  const params = new URLSearchParams(location.search);
  const asked = params.get("site");
  if (asked) site = asked;
  await document.fonts.ready;
  await loadSettings();
  // The range mark arrives in place, not sliding in from nowhere.
  $("rangesMark").style.transition = "none";
  await reload();
  void $("rangesMark").offsetWidth;
  $("rangesMark").style.transition = "";
}

void init();
