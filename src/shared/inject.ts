/** Runs one of the extension's scripts in a tab, on MV3's `scripting` or Safari's MV2 `tabs`. */
import { ext } from "./ext-api.ts";

export async function injectScript(tabId: number, file: string): Promise<void> {
  if (ext.scripting) await ext.scripting.executeScript({ target: { tabId }, files: [file] });
  else
    await (
      ext.tabs as unknown as { executeScript: (id: number, d: object) => Promise<unknown> }
    ).executeScript(tabId, { file });
}
