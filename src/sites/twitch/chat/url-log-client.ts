import { ext } from "../../../shared/ext-api.ts";
import type { ClassifiedLink } from "../links.ts";
import { TWITCH_ACTIONS, type ChatUrlEntry } from "../protocol.ts";
import { getChannelSlug } from "./root.ts";

/** Fire-and-forget: the background batches writes. */
export function logChatUrl(link: ClassifiedLink): void {
  const entry: ChatUrlEntry = {
    url: link.url,
    hostname: link.hostname,
    kind: link.kind,
    channel: getChannelSlug(),
    seenAt: Date.now(),
    label: link.label,
  };
  ext.runtime.sendMessage({ action: TWITCH_ACTIONS.LOG_URL, entry }).catch(() => {
    // extension context invalidated
  });
}
