import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const SHARED_CHAIN = ["shared/options.js", "shared/mappings.js", "shared/apply-option-classes.js"];

/**
 * Loads options → mappings → apply-option-classes in one VM context (like the extension).
 */
export function loadSharedExtensionScripts() {
  const context = vm.createContext({ console });
  for (const rel of SHARED_CHAIN) {
    const code = readFileSync(join(rootDir, rel), "utf8");
    vm.runInContext(code, context);
  }
  return context;
}
