/** Watches the chat for new links: pillifies them and/or logs them. */

import { classifyLink, type ClassifiedLink } from "../links.ts";
import { collectAnchors, pillify, unpillifyAll } from "./pill.ts";
import { logChatUrl } from "./url-log-client.ts";

export interface ChatObserver {
  disconnect(): void;
  setPillsEnabled(enabled: boolean): void;
  setLogEnabled(enabled: boolean): void;
}

export function observeChat(
  chatRoot: Element,
  initial: { pillsEnabled: boolean; logEnabled: boolean },
): ChatObserver {
  let { pillsEnabled, logEnabled } = initial;
  // Anchors already logged, so a link is logged once whether or not it became a pill.
  const logged = new WeakSet<HTMLAnchorElement>();

  const classify = (anchor: HTMLAnchorElement): ClassifiedLink | null => {
    if (pillsEnabled) return pillify(anchor);
    const href = anchor.getAttribute("href");
    return href && !href.startsWith("#") && !href.startsWith("javascript:")
      ? classifyLink(href, location.href)
      : null;
  };

  const process = (node: Node) => {
    for (const anchor of collectAnchors(node)) {
      const link = classify(anchor);
      if (link && logEnabled && !logged.has(anchor)) {
        logged.add(anchor);
        logChatUrl(link);
      }
    }
  };

  // Synchronous on purpose: the callback runs right after Twitch's DOM update and before the
  // next paint, so a long link never shows as raw text for a frame and then shrinks (a visible jump).
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (chatRoot.contains(node)) process(node);
      });
    }
  });
  observer.observe(chatRoot, { childList: true, subtree: true });
  process(chatRoot); // messages already on screen

  return {
    disconnect() {
      observer.disconnect();
    },
    setPillsEnabled(enabled) {
      if (enabled === pillsEnabled) return;
      pillsEnabled = enabled;
      if (enabled) process(chatRoot);
      else unpillifyAll(chatRoot);
    },
    setLogEnabled(enabled) {
      logEnabled = enabled;
    },
  };
}
