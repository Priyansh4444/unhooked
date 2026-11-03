import { ext } from "../../../shared/ext-api.ts";
import { TWITCH_ACTIONS, type ChatUrlEntry } from "../protocol.ts";
import { clearLog, logUrl, readLog } from "./log.ts";
import { resolveLink } from "./resolve.ts";

interface TwitchMessage {
  action?: string;
  entry?: ChatUrlEntry;
  url?: string;
}

/** Answers the Twitch content script and popup (chat link lookups and the URL log). */
export function initTwitchBackground(): void {
  ext.runtime.onMessage.addListener((message: TwitchMessage, _sender, sendResponse) => {
    const reply = (work: Promise<unknown>) => {
      work.then(sendResponse, () => sendResponse(undefined));
      return true; // async response
    };
    switch (message?.action) {
      case TWITCH_ACTIONS.LOG_URL:
        return reply(logUrl(message.entry as ChatUrlEntry).then(() => ({ ok: true })));
      case TWITCH_ACTIONS.RESOLVE_LINK:
        return reply(resolveLink(String(message.url ?? "")).then((meta) => ({ ok: true, meta })));
      case TWITCH_ACTIONS.GET_URL_LOG:
        return reply(readLog().then((entries) => ({ entries })));
      case TWITCH_ACTIONS.CLEAR_URL_LOG:
        return reply(clearLog().then(() => ({ ok: true })));
      default:
        return false;
    }
  });
}
