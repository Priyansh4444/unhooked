/**
 * Your time: what the tracker counted, for a period and optionally one site. Elements are kept and
 * updated rather than rebuilt, so a new range or a live update moves marks from where they are to
 * where they belong, and the next change can take over mid-flight.
 */
import { ext } from "../../shared/ext-api.ts";
import { ownSiteIcon, siteIcon as bundledIcon } from "../../shared/site-icons.ts";
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
  type Range,
  type View,
} from "../../time/stats.ts";
import {
  allDays,
  eraseAll,
  forgetHost,
  getIcons,
  setIcon,
  getTracker,
  putDays,
  restoreHost,
  type DayRecord,
  type SiteIcons,
} from "../../time/store.ts";
import { MIN_SESSION_SECONDS, formatDuration, type Session } from "../../time/tracker.ts";
import { cardFonts, drawCard, postText } from "./card.ts";
import { LineChart, type LinePoint } from "./line.ts";
import { bindRecap } from "./recap.ts";

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
/** Visits still going, which count too, and move as they grow. */
let openSessions: Session[] = [];
let icons: SiteIcons = {};
/** Sites whose browser icon has been asked for, so a site without one is only asked about once. */
const iconAsked = new Set<string>();
/** Whether the background answered: without it, nothing is being counted whatever this shows. */
let counting = true;
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

function placeAt(x: number, y: number): void {
  tip.hidden = false;
  const own = tip.getBoundingClientRect();
  const left = Math.min(innerWidth - own.width - 8, Math.max(8, x - own.width / 2));
  const top = Math.max(8, y - own.height - 12);
  // The first appearance lands in place; after that it glides.
  if (!tipShown) tip.style.transition = "opacity 120ms ease";
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  tip.classList.remove("is-away");
  if (!tipShown) {
    tipShown = true;
    requestAnimationFrame(() => {
      tip.style.transition = "";
    });
  }
}

function placeTip(value: string, label: string, x: number, y: number): void {
  $("tipValue").textContent = value;
  $("tipLabel").textContent = label;
  placeAt(x, y);
}

function showTip(target: HTMLElement): void {
  const { tipValue, tipLabel } = target.dataset;
  if (!tipLabel) return hideTip();
  const box = target.getBoundingClientRect();
  placeTip(tipValue ?? "", tipLabel, box.left + box.width / 2, box.top);
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

const onLinePoint = (point: LinePoint | null, x: number, y: number) => {
  if (point) placeTip(point.text, point.title, x, y);
  else hideTip();
};

const timeline = new LineChart($("timeline"), {
  axis: true,
  summary: (points) =>
    `Time online: ${points
      .filter((point) => !point.future && point.value >= 1)
      .map((point) => `${point.title}, ${point.text}`)
      .join("; ")}`,
  onPoint: onLinePoint,
});

function renderTimeline(): void {
  const most = Math.max(...view.points.map((point) => point.seconds), 0);
  const ticks = timeTicks(most);
  const top = Math.max(ticks.at(-1)!, most, 1);
  timeline.update(
    view.points.map((point) => ({
      label: point.label,
      // The current day or hour isn't over, and a line falling away at the end shouldn't read as
      // a habit changing.
      title: point.current ? `${point.title}, so far` : point.title,
      value: point.seconds,
      text: point.seconds >= 1 ? formatDuration(point.seconds) : "Nothing",
      current: point.current,
      future: point.future,
    })),
    top,
    ticks.map((value) => ({ value, label: formatDuration(value) })),
  );
}

// ---- sessions --------------------------------------------------------------------------------

const SHORT_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** Where and when: with the site's icon, unless the whole page is already about one site. */
function setSessionNote(note: HTMLElement, session: Session | null): void {
  if (!session) {
    note.replaceChildren();
    return;
  }
  const when = SHORT_DAY.format(session.start);
  if (site || !session.host) {
    note.textContent = when;
    return;
  }
  note.replaceChildren(siteIcon(session.host), `${session.host} · ${when}`);
}

/** The longest stretches themselves: where they were, how long, and when. */
function renderLongSessions(top: Session[]): void {
  const list = $("longSessions");
  const most = top[0]?.seconds ?? 1;
  list.hidden = !top.length;
  $("longSessionsHeading").hidden = !top.length;
  list.replaceChildren(
    ...top.map((session) => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.className = "site-name";
      name.textContent = session.host;
      const bar = document.createElement("span");
      bar.className = "long-bar";
      const fill = document.createElement("span");
      fill.style.transform = `scaleX(${session.seconds / most})`;
      bar.append(fill);
      const time = document.createElement("span");
      time.className = "site-time";
      time.textContent = formatDuration(session.seconds);
      const when = document.createElement("span");
      when.className = "long-when";
      when.textContent = SHORT_DAY.format(session.start);
      row.append(siteIcon(session.host), name, bar, time, when);
      return row;
    }),
  );
}

const lengths = new LineChart($("buckets"), {
  counts: true,
  summary: (points) =>
    `How long sessions last: ${points.map((point) => `${point.title}, ${point.text}`).join("; ")}`,
  onPoint: onLinePoint,
});

function renderSessions(): void {
  const stats = view.sessions;
  const scope = site ? "visit to this site" : "stretch online";
  const since = view.sessionsSince
    ? ` Counted since ${SHORT_DAY.format(new Date(`${view.sessionsSince}T12:00`))}; earlier days only have totals.`
    : "";
  $("sessionsNote").textContent =
    `One unbroken ${scope}: stepping away for under a minute doesn't end it, and under ${MIN_SESSION_SECONDS} seconds is only passing through.${since}`;
  countTo($("sessionCount"), stats.count, whole);
  $("sessionCountNote").textContent = stats.count
    ? `${(stats.count / view.activeDays).toFixed(1)} a day`
    : "";
  countTo($("sessionAverage"), stats.average, formatDuration);
  $("sessionMedian").textContent = stats.count ? `median ${formatDuration(stats.median)}` : "";
  countTo($("sessionLongest"), stats.longest?.seconds ?? 0, formatDuration);
  setSessionNote($("sessionLongestNote"), stats.longest);
  countTo($("sessionShortest"), stats.shortest?.seconds ?? 0, formatDuration);
  setSessionNote($("sessionShortestNote"), stats.shortest);
  renderLongSessions(stats.top);
  countTo($("sessionLong"), stats.inLongStretches, formatDuration);
  $("sessionLongNote").textContent = stats.count
    ? `${Math.round(stats.longStretchShare * 100)}% of your time, 10m+ at once`
    : "stretches of 10m or more";

  lengths.update(
    stats.buckets.map((bucket) => ({
      label: bucket.label,
      title: bucket.label,
      value: bucket.count,
      text: `${bucket.count} ${bucket.count === 1 ? "session" : "sessions"}`,
    })),
    Math.max(1, ...stats.buckets.map((bucket) => bucket.count)),
  );
}

// ---- site icons: the real one when it's known, its first letter until then -------------------

function siteIcon(host: string): HTMLElement {
  const slot = document.createElement("span");
  slot.className = "site-icon";
  refreshIcon(slot, host);
  return slot;
}

/**
 * A popular site's from the ones that ship with the extension, which are made to show on a dark
 * page; then its saved icon; then the icon of the site it's part of, as docs.google.com is of Google.
 */
function iconSrc(host: string): string | undefined {
  const own = ownSiteIcon(host);
  if (own) return ext.runtime.getURL(own);
  if (icons[host]?.src) return icons[host].src;
  const parent = bundledIcon(host);
  return parent && ext.runtime.getURL(parent);
}

function refreshIcon(slot: HTMLElement, host: string): void {
  const src = iconSrc(host);
  if (slot.dataset.src === (src ?? "") && slot.childNodes.length) return;
  slot.dataset.src = src ?? "";
  const letter = () => {
    slot.classList.add("is-letter");
    slot.textContent = host.charAt(0).toUpperCase();
  };
  if (!src) return letter();
  slot.classList.remove("is-letter");
  const image = document.createElement("img");
  image.alt = "";
  image.width = image.height = 16;
  image.addEventListener("error", letter, { once: true });
  image.src = src;
  slot.replaceChildren(image);
}

/**
 * A site with no icon yet: visited before icons were saved, or not in front since. The browser
 * usually has it. What it returns for a site it doesn't know is one fixed picture, so that's
 * compared against rather than shown as if it were the site's.
 */
async function browserIcon(host: string, generic: string | null): Promise<string | null> {
  const url = new URL(ext.runtime.getURL("_favicon/"));
  url.searchParams.set("pageUrl", `https://${host}/`);
  url.searchParams.set("size", "32");
  const response = await fetch(url);
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "image/png";
  const data = btoa(String.fromCharCode(...new Uint8Array(await response.arrayBuffer())));
  return data === generic ? null : `data:${type};base64,${data}`;
}

async function fillMissingIcons(): Promise<void> {
  if (!ext.runtime.getManifest().permissions?.includes("favicon")) return;
  const hosts = view.sites
    .map((entry) => entry.host)
    .filter((host) => !iconSrc(host) && !iconAsked.has(host));
  if (!hosts.length) return;
  for (const host of hosts) iconAsked.add(host);
  const unknown = await browserIcon("unhooked.invalid", null).catch(() => null);
  const generic = unknown?.split(",")[1] ?? null;
  let found = false;
  for (const host of hosts) {
    const src = await browserIcon(host, generic).catch(() => null);
    if (!src) continue;
    icons[host] = { src, at: Date.now() };
    await setIcon(host, src, Date.now()).catch(() => {});
    found = true;
  }
  if (found) renderSites();
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
      const iconSlot = document.createElement("span");
      iconSlot.className = "site-label";
      const time = document.createElement("span");
      time.className = "site-time";
      const bar = document.createElement("span");
      bar.className = "site-bar";
      bar.append(document.createElement("span"));
      iconSlot.append(siteIcon(row.host), name);
      button.append(iconSlot, time, bar);
      li.append(button);
    }
    const button = li.firstElementChild as HTMLElement;
    const [label, time] = [...button.children] as HTMLElement[];
    const name = label!.querySelector<HTMLElement>(".site-name")!;
    name.textContent = row.host;
    refreshIcon(label!.firstElementChild as HTMLElement, row.host);
    const spent = formatDuration(row.seconds);
    time!.textContent = `${spent} · ${Math.round(row.share * 100)}%`;
    button.setAttribute("aria-pressed", String(site === row.host));
    button.setAttribute(
      "aria-label",
      `${row.host}: ${spent}, ${Math.round(row.share * 100)}%. Show only this site`,
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
  $("siteNumbers").replaceChildren(
    ...view.sites.map((row) => {
      const stats = view.bySite[row.host];
      const line = document.createElement("tr");
      const cells = [
        row.host,
        formatDuration(row.seconds),
        stats ? String(stats.count) : "–",
        stats ? formatDuration(stats.average) : "–",
        stats ? formatDuration(stats.shortest) : "–",
        stats ? formatDuration(stats.longest) : "–",
      ];
      for (const text of cells) {
        const cell = document.createElement("td");
        cell.textContent = text;
        line.append(cell);
      }
      return line;
    }),
  );
  $("numbersHead").textContent = range === "today" ? "Hour" : "Day";
  $("numbersBody").replaceChildren(
    ...[...view.points].reverse().map((point) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = point.title;
      const time = document.createElement("td");
      time.textContent = point.seconds >= 1 ? formatDuration(point.seconds) : "–";
      row.append(name, time);
      return row;
    }),
  );
}

function render(): void {
  view = computeView(days, range, site, Date.now(), openSessions);
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

  renderTimeline();
  renderSessions();
  void fillMissingIcons();
  renderSites();
  renderHeat();
  renderNumbers();
  renderNotices();
}

function renderNotices(): void {
  const notice = $("notice");
  const nothingEver = days.length === 0;
  const stuck = tracking && !counting;
  notice.hidden = tracking && !nothingEver && !stuck;
  notice.replaceChildren(
    stuck
      ? "Nothing is being counted: this copy of Unhooked's background is out of date, which can happen after an update. "
      : !tracking
        ? "Counting is off, so nothing new is being added."
        : "Nothing yet. Unhooked counts the site in front while you're using it, so browse a little and come back: this page keeps itself up to date.",
  );
  if (stuck) {
    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "text-button";
    restart.id = "restartTracker";
    restart.textContent = "Restart Unhooked";
    restart.addEventListener("click", () => ext.runtime.reload());
    notice.append(restart);
  }
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
  const answer = await ext.runtime.sendMessage({ action: TIME_FLUSH }).catch(() => undefined);
  counting = answer === true;
  days = await allDays();
  document.dispatchEvent(new Event("uh-time-loaded"));
  icons = await getIcons();
  openSessions = Object.values((await getTracker()).open).filter(
    (session) => session.seconds >= MIN_SESSION_SECONDS,
  );
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

const cardIcons = new Map<string, HTMLImageElement>();

/** Only pictures of its own: one from another site would stop the card being saved. */
async function loadIcons(hosts: string[]): Promise<Map<string, HTMLImageElement>> {
  await Promise.all(
    hosts.map(async (host) => {
      const src = iconSrc(host);
      if (cardIcons.has(host) || !src) return;
      if (!src.startsWith("data:") && !src.startsWith(ext.runtime.getURL(""))) return;
      const image = new Image();
      image.src = src;
      await image.decode().then(
        () => cardIcons.set(host, image),
        () => {},
      );
    }),
  );
  return cardIcons;
}

const loadCardIcons = () => loadIcons(view.sites.slice(0, 5).map(({ host }) => host));

const showNames = () => $<HTMLInputElement>("showNames").checked;

function drawShare(): void {
  drawCard($<HTMLCanvasElement>("card"), view, {
    names: showNames(),
    icon: iconImage,
    siteIcons: cardIcons,
  });
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
  bindRecap(() => days, {
    siteIcon,
    loadIcons,
    brand: () => iconImage,
  });
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

  bindTips($("heat"));
  bindArrows($("heat"), ".cell", () => 24);

  const dialog = $<HTMLDialogElement>("shareDialog");
  $("openShare").addEventListener("click", async () => {
    await cardFonts();
    await loadCardIcons();
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
