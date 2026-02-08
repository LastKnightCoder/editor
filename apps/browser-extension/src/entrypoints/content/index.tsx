import ReactDOM from "react-dom/client";
import HighlighterApp from "@/content/ui/HighlighterApp";
import { injectHighlightStyles } from "@/content/highlighter";
import "./style.css";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    // Inject highlight mark styles into the host page
    injectHighlightStyles();

    // Create Shadow DOM UI
    const ui = await createShadowRootUi(ctx, {
      name: "tau-highlighter",
      position: "inline",
      anchor: "body",
      append: "last",
      onMount(container, shadow, shadowHost) {
        // Make the shadow host cover the full viewport so fixed-position
        // children can receive click events, but don't block page interaction.
        shadowHost.style.position = "fixed";
        shadowHost.style.top = "0";
        shadowHost.style.left = "0";
        shadowHost.style.width = "100vw";
        shadowHost.style.height = "100vh";
        shadowHost.style.zIndex = "2147483647";
        shadowHost.style.pointerEvents = "none";

        container.style.pointerEvents = "none";

        const app = document.createElement("div");
        app.id = "tau-highlighter-root";
        app.style.pointerEvents = "none";
        container.appendChild(app);

        const root = ReactDOM.createRoot(app);
        root.render(<HighlighterApp shadowRoot={shadow} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
