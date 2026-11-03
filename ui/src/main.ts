import { mount } from "svelte";
import "./lib/design-tokens.css";
import "./lib/base.css";
import App from "./App.svelte";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
