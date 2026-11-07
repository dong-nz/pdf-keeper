import { mount } from "svelte";
import "./lib/design-tokens.css";
import "./lib/base.css";
import App from "./App.svelte";
import ReaderApp from "./ReaderApp.svelte";
import { applyTheme } from "./lib/theme";

// First paint follows the OS in the default state, synchronously and before
// mount — what the CSS media query did for free until the in-app override
// existed (UI-17, DR-101). `App.svelte` re-applies the stored choice as soon
// as settings load.
applyTheme("system");

// Window routing (SPEC-v0.0.6 §3.3): `app_open_reader_window` loads this
// same entry with a `?reader=<docId>` parameter. A window carrying it renders
// the reader surface only — no toolbar, no menus, no status bar — and is its
// own JS context, so no UI state crosses windows.
const readerRoute = new URLSearchParams(window.location.search).get("reader");

const app =
  readerRoute !== null && /^\d+$/.test(readerRoute)
    ? mount(ReaderApp, {
        target: document.getElementById("app")!,
        props: { docId: Number(readerRoute) },
      })
    : mount(App, { target: document.getElementById("app")! });

export default app;
