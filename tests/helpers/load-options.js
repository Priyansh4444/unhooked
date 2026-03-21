import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads shared/options.js in an isolated VM (same as browser script, no exports).
 */
export function loadOptionsModule() {
  const code = readFileSync(join(__dirname, "../../shared/options.js"), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(
    `${code}\n;globalThis.__unhookedTestExports = {\n  defaultUnhookedOptions,\n  mergeUnhookedOptions,\n  UNHOOKED_OPTION_KEYS,\n  UNHOOKED_STORAGE_KEY\n};`,
    context
  );
  return context.__unhookedTestExports;
}
