/**
 * Moving settings to another browser: copy or save them here, paste or drop them there. Browsers
 * sync only with their own kind, so this works between any two, with no server in between. A tab
 * rather than the popup, because a popup closes when a file dialog opens.
 */
import { ext } from "../../shared/ext-api.ts";
import type { RawStorage } from "../../shared/preferences.ts";
import {
  describeSummary,
  fileName,
  importPatch,
  originsToAsk,
  readSettingsFile,
  settingsFile,
  summarize,
  transferable,
} from "../../shared/transfer.ts";
import { restore, snapshot } from "../../shared/undo.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const incoming = $<HTMLTextAreaElement>("incoming");
const importButton = $<HTMLButtonElement>("import");
const found = $("found");
const MAX_FILE_BYTES = 2_000_000;

/** What the field holds, once it reads as a settings file. */
let parsed: RawStorage | null = null;
let undoable: RawStorage | null = null;

function status(message: string, error = false): void {
  const el = $("status");
  el.textContent = message;
  el.classList.toggle("error", error);
}

const stored = () => ext.storage.local.get(null) as Promise<RawStorage>;

async function showMine(): Promise<void> {
  $("mine").textContent = describeSummary(summarize(transferable(await stored())));
}

function readField(): void {
  const text = incoming.value.trim();
  parsed = null;
  found.classList.remove("error");
  found.textContent = "";
  if (text) {
    try {
      parsed = readSettingsFile(text);
      found.textContent = describeSummary(summarize(parsed));
    } catch (error) {
      found.textContent = (error as Error).message;
      found.classList.add("error");
    }
  }
  importButton.disabled = !parsed;
}

async function readFile(file: File | undefined): Promise<void> {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    incoming.value = "";
    readField();
    found.textContent = "That file is too big to be Unhooked's settings.";
    found.classList.add("error");
    return;
  }
  incoming.value = await file.text();
  readField();
}

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(settingsFile(await stored()));
    status("Copied. Paste it into Unhooked in the other browser.");
  } catch {
    status("Couldn't reach the clipboard. Save a file instead.", true);
  }
});

$("save").addEventListener("click", async () => {
  const url = URL.createObjectURL(
    new Blob([settingsFile(await stored())], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  status(`Saved ${link.download}`);
});

importButton.addEventListener("click", () => {
  if (!parsed) return;
  const settings = parsed;
  // Removals on sites outside the list only apply with access to them. Asked first thing in the
  // click: browsers only show the prompt for a user's gesture.
  const origins = originsToAsk(settings);
  const asked: Promise<boolean> = origins.length
    ? ext.permissions.request({ origins }).catch(() => false)
    : Promise.resolve(true);
  void asked.then(async (allowed) => {
    try {
      const current = await stored();
      const patch = importPatch(current, settings);
      await ext.storage.local.set(patch);
      undoable = snapshot(current, patch);
      $("undo").hidden = false;
      incoming.value = "";
      readField();
      status(
        allowed
          ? "Imported"
          : "Imported. Removals on other sites apply once you use the wand there.",
      );
    } catch (error) {
      status(`Could not import. ${(error as Error).message}`, true);
    }
  });
});

$("undo").addEventListener("click", async () => {
  if (!undoable) return;
  await restore(undoable);
  undoable = null;
  $("undo").hidden = true;
  status("Undone");
});

incoming.addEventListener("input", readField);
$<HTMLInputElement>("file").addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  void readFile(input.files?.[0]);
  input.value = "";
});
addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("dropping");
});
addEventListener("dragleave", (event: DragEvent) => {
  if (!event.relatedTarget) document.body.classList.remove("dropping");
});
addEventListener("drop", (event: DragEvent) => {
  event.preventDefault();
  document.body.classList.remove("dropping");
  void readFile(event.dataTransfer?.files[0]);
});
ext.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void showMine();
});
void showMine();
