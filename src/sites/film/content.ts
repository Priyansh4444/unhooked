/** Injected by the popup or film mode's shortcut: starts film mode, or stops it if it's running. */
import { filmIfRunning, filmMode } from "./film.ts";

const running = filmIfRunning();
if (running) running.stop();
else filmMode();
