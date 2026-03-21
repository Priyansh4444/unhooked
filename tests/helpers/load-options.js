import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

/**
 * Loads shared/options.js in an isolated VM (globalThis assignments).
 */
export function loadOptionsModule() {
  const code = readFileSync(join(rootDir, "shared/options.js"), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(code, context);
  return {
    defaultUnhookedOptions: context.defaultUnhookedOptions,
    mergeUnhookedOptions: context.mergeUnhookedOptions,
    UNHOOKED_OPTION_KEYS: context.UNHOOKED_OPTION_KEYS,
    UNHOOKED_STORAGE_KEY: context.UNHOOKED_STORAGE_KEY,
    UNHOOKED_POPUP_THEME_KEY: context.UNHOOKED_POPUP_THEME_KEY
  };
}
