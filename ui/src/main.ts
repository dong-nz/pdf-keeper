import { mount } from "svelte";
import "./lib/design-tokens.css";
import "./lib/base.css";
import App from "./App.svelte";
import { applyTheme } from "./lib/theme";

// First paint follows the OS in the default state, synchronously and before
// mount — what the CSS media query did for free until the in-app override
// existed (UI-17, DR-101). `App.svelte` re-applies the stored choice as soon
// as settings load.
applyTheme("system");

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
