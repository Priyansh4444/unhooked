// Test build only: lets the harness's own page (http://127.0.0.1) call the e2e hook in the
// background via window.postMessage.
import { ext } from "../../src/shared/ext-api.ts";

window.addEventListener("message", async ({ source, data }) => {
  if (source !== window || data?.type !== "unhooked-e2e") return;
  const result = await ext.runtime
    .sendMessage({ action: "e2e", ...data.request })
    .catch((error: unknown) => ({ error: String(error) }));
  window.postMessage({ type: "unhooked-e2e-reply", id: data.id, result }, "*");
});
