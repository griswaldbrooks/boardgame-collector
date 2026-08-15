// Single navigation stack (spec "Interactions & Behavior": one `screen`
// value, Home is the root, every other screen pushes on top). Browser
// history IS the stack, which makes Android back mirror Cancel for free:
// the WebView's back button pops history and fires `popstate`.

let onEnter = null;

export function start(render) {
  onEnter = render;
  window.addEventListener("popstate", () => {
    const s = history.state ?? { screen: "home" };
    onEnter(s.screen, s.opts);
  });
  // Cold start always lands on Home, one tap from the add flow.
  history.replaceState({ screen: "home" }, "");
  onEnter("home");
}

export function go(screen, opts) {
  history.pushState({ screen, opts }, "");
  onEnter(screen, opts);
}

// Cancel (and Android back): one pop returns toward Home.
export function back() {
  history.back();
}

// Done → "Back to home": the stack here is always home → add → done,
// because "Add another" is a single pop back to the add entry.
export function homeFromDone() {
  history.go(-2);
}
