import { GENERATIVE_WIDGET_SVG_STYLES } from "@/generative-ui/svg-styles";
import type {
  GenerativeWidgetRenderPayload,
  WidgetRenderPhase,
} from "@/generative-ui/widget-render-payload";

interface StandaloneGenerativeWidgetConfig {
  documentTitle: string;
  payload: GenerativeWidgetRenderPayload;
  effectivePhase: WidgetRenderPhase;
  theme: Record<string, string>;
}

const escapeInlineJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const SHELL_SOURCE = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: https: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; font-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        --widget-bg: transparent;
        --widget-surface: #ffffff;
        --widget-muted-surface: #f8fafc;
        --widget-border: rgba(15, 23, 42, 0.08);
        --widget-text: #0f172a;
        --widget-text-muted: #475569;
        --widget-accent: #2563eb;
        --color-background-primary: #ffffff;
        --color-background-secondary: #f8fafc;
        --color-background-tertiary: #f1f5f9;
        --color-background-info: #e6f1fb;
        --color-background-danger: #fcebeb;
        --color-background-success: #eaf3de;
        --color-background-warning: #faeeda;
        --color-text-primary: #0f172a;
        --color-text-secondary: #475569;
        --color-text-tertiary: #64748b;
        --color-text-info: #0c447c;
        --color-text-danger: #791f1f;
        --color-text-success: #27500a;
        --color-text-warning: #633806;
        --color-border-primary: rgba(15, 23, 42, 0.24);
        --color-border-secondary: rgba(15, 23, 42, 0.16);
        --color-border-tertiary: rgba(15, 23, 42, 0.1);
        --color-border-info: #85b7eb;
        --color-border-danger: #f09595;
        --color-border-success: #97c459;
        --color-border-warning: #ef9f27;
        --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --font-serif: Iowan Old Style, Georgia, serif;
        --font-mono: ui-monospace, SFMono-Regular, monospace;
        --border-radius-md: 8px;
        --border-radius-lg: 12px;
        --border-radius-xl: 16px;
      }

      * {
        box-sizing: border-box;
      }

      *::before,
      *::after {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: var(--widget-bg);
        color: var(--widget-text);
        font-family: var(--font-sans);
        overflow: hidden;
      }

      body {
        min-height: 100px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      html[data-widget-standalone="true"],
      body[data-widget-standalone="true"] {
        overflow: auto;
      }

      body[data-widget-standalone="true"] {
        min-height: 100vh;
        background: var(--color-background-secondary);
      }

      #widget-root {
        width: 100%;
        min-height: 1px;
        padding: 12px 14px 16px;
        max-width: 100%;
        color: var(--color-text-primary);
      }

      body[data-widget-standalone="true"] #widget-root {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px 24px 32px;
      }

      #widget-root > *:first-child {
        margin-top: 0 !important;
      }

      #widget-root > *:last-child {
        margin-bottom: 0 !important;
      }

      #widget-root > * + * {
        margin-top: 12px;
      }

      #widget-root > div,
      #widget-root > section,
      #widget-root > article {
        max-width: 100%;
      }

      #widget-root [role="toolbar"],
      #widget-root .toolbar,
      #widget-root .controls,
      #widget-root .control-row,
      #widget-root .button-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 12px;
      }

      #widget-root .button-row > *,
      #widget-root [role="toolbar"] > *,
      #widget-root .toolbar > * {
        flex-shrink: 0;
      }

      #widget-root .panel,
      #widget-root .card,
      #widget-root .section,
      #widget-root .surface {
        border: 1px solid var(--color-border-tertiary);
        background: color-mix(in srgb, var(--color-background-primary) 92%, var(--color-background-secondary));
        border-radius: 16px;
        padding: 14px 16px;
      }

      #widget-root .stack,
      #widget-root .content-stack {
        display: grid;
        gap: 12px;
      }

      #widget-root .grid,
      #widget-root .card-grid,
      #widget-root .metrics {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }

      #widget-root .metric,
      #widget-root .stat,
      #widget-root .metric-card {
        border: 1px solid var(--color-border-tertiary);
        background: color-mix(in srgb, var(--color-background-primary) 94%, var(--color-background-secondary));
        border-radius: 14px;
        padding: 12px 14px;
      }

      #widget-root .muted,
      #widget-root .hint,
      #widget-root .subtle {
        color: var(--color-text-secondary);
      }

      #widget-root .eyebrow,
      #widget-root .caption,
      #widget-root small {
        color: var(--color-text-secondary);
        font-size: 12px;
      }

      a {
        color: var(--widget-accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
        color: inherit;
      }

      button {
        appearance: none;
        border: 1px solid var(--color-border-secondary);
        border-radius: 12px;
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        min-height: 40px;
        padding: 0 16px;
        font-size: 14px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition:
          background-color 160ms ease,
          border-color 160ms ease,
          color 160ms ease,
          transform 120ms ease,
          box-shadow 160ms ease;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }

      button:hover {
        background: var(--color-background-secondary);
        border-color: var(--color-border-primary);
      }

      button:active {
        transform: translateY(1px);
      }

      button:disabled,
      button[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none;
      }

      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--widget-accent) 40%, transparent);
        outline-offset: 2px;
      }

      input[type="text"],
      input[type="number"],
      input[type="search"],
      input[type="email"],
      textarea,
      select {
        appearance: none;
        width: 100%;
        min-height: 40px;
        border: 1px solid var(--color-border-tertiary);
        border-radius: 12px;
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        padding: 10px 12px;
        transition:
          border-color 160ms ease,
          box-shadow 160ms ease,
          background-color 160ms ease;
      }

      input[type="text"]:hover,
      input[type="number"]:hover,
      input[type="search"]:hover,
      input[type="email"]:hover,
      textarea:hover,
      select:hover {
        border-color: var(--color-border-secondary);
      }

      textarea {
        min-height: 88px;
        resize: vertical;
      }

      input[type="checkbox"] {
        appearance: none;
        width: 16px;
        height: 16px;
        border: 1.5px solid var(--color-border-primary);
        border-radius: 5px;
        background: var(--color-background-primary);
        display: inline-grid;
        place-items: center;
        vertical-align: middle;
        cursor: pointer;
        margin: 0;
      }

      input[type="checkbox"]::after {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 2px;
        transform: scale(0);
        transition: transform 140ms ease;
        background: var(--widget-accent);
      }

      input[type="checkbox"]:checked::after {
        transform: scale(1);
      }

      input[type="range"] {
        appearance: none;
        width: 100%;
        background: transparent;
        margin: 0;
        height: 24px;
      }

      input[type="range"]::-webkit-slider-runnable-track {
        height: 6px;
        border-radius: 999px;
        background:
          linear-gradient(
            to right,
            var(--widget-accent) 0 var(--range-progress, 50%),
            color-mix(in srgb, var(--widget-accent) 18%, white) var(--range-progress, 50%) 100%
          );
      }

      input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        margin-top: -5px;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 2px solid var(--color-background-primary);
        background: var(--widget-accent);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
      }

      input[type="range"]::-moz-range-track {
        height: 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--widget-accent) 18%, white);
      }

      input[type="range"]::-moz-range-progress {
        height: 6px;
        border-radius: 999px;
        background: var(--widget-accent);
      }

      input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border: 2px solid var(--color-background-primary);
        border-radius: 999px;
        background: var(--widget-accent);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
      }

      label {
        color: var(--color-text-primary);
        font-size: 14px;
      }

      p,
      ul,
      ol {
        margin-top: 0;
        margin-bottom: 0.9rem;
      }

      h1,
      h2,
      h3,
      h4 {
        margin-top: 0;
        margin-bottom: 0.75rem;
        line-height: 1.2;
        font-weight: 500;
        color: var(--color-text-primary);
      }

      h1 {
        font-size: 22px;
      }

      h2 {
        font-size: 18px;
      }

      h3,
      h4 {
        font-size: 16px;
      }

      hr {
        border: 0;
        border-top: 1px solid var(--color-border-tertiary);
        margin: 14px 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 8px 10px;
        text-align: left;
        border-bottom: 1px solid var(--color-border-tertiary);
      }

      th {
        color: var(--color-text-secondary);
        font-weight: 500;
      }

      code,
      pre {
        font-family: var(--font-mono);
      }

      pre {
        margin: 0;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
        overflow: auto;
      }

      @keyframes tauWidgetFadeIn {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      ${GENERATIVE_WIDGET_SVG_STYLES}
    </style>
  </head>
  <body>
    <div id="widget-root"></div>
    <script>
      (function () {
        const HOST_SOURCE = "tau-host-widget";
        const SHELL_SOURCE = "tau-generative-widget";
        const standaloneConfig =
          window.__TAU_WIDGET_STANDALONE_CONFIG__ &&
          typeof window.__TAU_WIDGET_STANDALONE_CONFIG__ === "object"
            ? window.__TAU_WIDGET_STANDALONE_CONFIG__
            : null;
        const root = document.getElementById("widget-root");
        const state = {
          morphReady: false,
          useInnerHtmlFallback: false,
          pendingRender: null,
          pendingFinalize: null,
          finalized: false,
          hasRenderedVisual: false,
          lastVisualSignature: "",
          activeGestureToken: 0,
          lastIssuedGestureToken: 0,
          standaloneMode: Boolean(standaloneConfig),
        };

        function post(type, payload) {
          if (state.standaloneMode) {
            return;
          }
          window.parent.postMessage(
            Object.assign({ source: SHELL_SOURCE, type: type }, payload || {}),
            "*",
          );
        }

        function setTheme(theme) {
          if (!theme || typeof theme !== "object") {
            return;
          }
          Object.keys(theme).forEach((key) => {
            document.documentElement.style.setProperty(key, theme[key]);
          });
        }

        function measureHeight() {
          const bodyHeight = document.body ? document.body.scrollHeight : 0;
          const rootHeight = root ? root.scrollHeight : 0;
          const rectHeight = root ? Math.ceil(root.getBoundingClientRect().height) : 0;
          const htmlHeight = document.documentElement
            ? document.documentElement.scrollHeight
            : 0;
          const height = Math.max(bodyHeight, rootHeight, rectHeight, htmlHeight, 96);
          post("widget:resize", { height: height });
        }

        function scheduleMeasure() {
          requestAnimationFrame(measureHeight);
        }

        function issueTrustedGestureToken() {
          const nextToken = ++state.lastIssuedGestureToken;
          state.activeGestureToken = nextToken;
          setTimeout(function () {
            if (state.activeGestureToken === nextToken) {
              state.activeGestureToken = 0;
            }
          }, 0);
        }

        function consumeTrustedGesture() {
          if (!state.activeGestureToken) {
            return false;
          }
          state.activeGestureToken = 0;
          return true;
        }

        function applyHtmlFallback(html, visualSignature) {
          root.innerHTML = html || "";
          state.hasRenderedVisual = true;
          state.lastVisualSignature = visualSignature || "";
          syncAllRangeProgress();
          scheduleMeasure();
        }

        function startFinalizeScripts(finalHtml) {
          if (state.finalized || !finalHtml) {
            return;
          }
          state.finalized = true;
          state.pendingFinalize = null;
          executeScriptsFromHtml(finalHtml).catch(function (error) {
            post("widget:error", {
              message:
                error && error.message ? error.message : "脚本执行失败",
            });
          });
        }

        function openStandaloneLink(url) {
          if (typeof url !== "string" || !url.trim()) {
            return;
          }
          const nextUrl = url.trim();
          try {
            window.open(nextUrl, "_blank", "noopener,noreferrer");
          } catch (_error) {
            window.location.href = nextUrl;
          }
        }

        function handleStandalonePrompt(text) {
          if (typeof text !== "string" || !text.trim()) {
            return;
          }
          const nextText = text.trim();
          if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
          ) {
            navigator.clipboard.writeText(nextText).catch(function () {
              console.info("[tau-widget] prompt:", nextText);
            });
            return;
          }
          console.info("[tau-widget] prompt:", nextText);
        }

        function applyStandaloneConfig() {
          if (!standaloneConfig) {
            return;
          }

          document.documentElement.setAttribute("data-widget-standalone", "true");
          document.body.setAttribute("data-widget-standalone", "true");

          if (
            typeof standaloneConfig.documentTitle === "string" &&
            standaloneConfig.documentTitle.trim()
          ) {
            document.title = standaloneConfig.documentTitle.trim();
          }

          if (standaloneConfig.theme) {
            setTheme(standaloneConfig.theme);
          }

          const nextHtml = standaloneConfig.payload
            ? standaloneConfig.payload.previewHtml || ""
            : "";
          const nextVisualSignature = standaloneConfig.payload
            ? standaloneConfig.payload.visualSignature || ""
            : "";
          const nextFinalHtml = standaloneConfig.payload
            ? standaloneConfig.payload.finalHtml || ""
            : "";

          if (standaloneConfig.effectivePhase === "final") {
            const patched = patchHtml(nextHtml, nextVisualSignature);
            if (patched) {
              startFinalizeScripts(nextFinalHtml);
            } else if (nextFinalHtml) {
              state.pendingFinalize = {
                finalHtml: nextFinalHtml,
              };
            }
            return;
          }

          patchHtml(nextHtml, nextVisualSignature);
        }

        function setupGlobals() {
          window.openLink = function (url) {
            if (state.standaloneMode) {
              openStandaloneLink(url);
              return;
            }
            if (!consumeTrustedGesture()) {
              post("widget:error", {
                message: "已阻止非用户触发的 openLink 调用",
              });
              return;
            }
            if (typeof url === "string" && url.trim()) {
              post("widget:open-link", { url: url.trim() });
            }
          };

          window.tauWidget = {
            sendPrompt(text) {
              if (state.standaloneMode) {
                handleStandalonePrompt(text);
                return;
              }
              if (!consumeTrustedGesture()) {
                post("widget:error", {
                  message: "已阻止非用户触发的 sendPrompt 调用",
                });
                return;
              }
              if (typeof text === "string" && text.trim()) {
                post("widget:prompt", { text: text.trim() });
              }
            },
          };

          window.sendPrompt = function (text) {
            window.tauWidget.sendPrompt(text);
          };
        }

        function syncRangeProgress(input) {
          if (!input) {
            return;
          }
          const min = Number(input.min || 0);
          const max = Number(input.max || 100);
          const value = Number(input.value || min);
          const span = max - min || 1;
          const percent = ((value - min) / span) * 100;
          input.style.setProperty("--range-progress", percent + "%");
        }

        function syncAllRangeProgress() {
          document.querySelectorAll('input[type="range"]').forEach((range) => {
            syncRangeProgress(range);
          });
        }

        function buildTarget(html) {
          const target = document.createElement("div");
          target.id = "widget-root";
          target.innerHTML = html;
          return target;
        }

        function patchHtml(html, visualSignature) {
          if (state.useInnerHtmlFallback) {
            applyHtmlFallback(html, visualSignature);
            return true;
          }

          if (!state.morphReady || typeof window.morphdom !== "function") {
            state.pendingRender = {
              html: html,
              visualSignature: visualSignature || "",
            };
            return false;
          }

          const target = buildTarget(html);
          window.morphdom(root, target, {
            onBeforeElUpdated(fromEl, toEl) {
              return !fromEl.isEqualNode(toEl);
            },
            onNodeAdded(node) {
              if (
                node &&
                node.nodeType === 1 &&
                node.tagName !== "SCRIPT" &&
                node.tagName !== "STYLE"
              ) {
                node.style.animation = "tauWidgetFadeIn 0.24s ease both";
              }
              return node;
            },
          });
          state.hasRenderedVisual = true;
          state.lastVisualSignature = visualSignature || "";
          syncAllRangeProgress();
          scheduleMeasure();
          return true;
        }

        function executeScriptsFromHtml(html) {
          const template = document.createElement("template");
          template.innerHTML = html;
          const scripts = Array.from(template.content.querySelectorAll("script"));
          let sequence = Promise.resolve();

          scripts.forEach((oldScript) => {
            sequence = sequence.then(
              () =>
                new Promise((resolve) => {
                  const script = document.createElement("script");
                  Array.from(oldScript.attributes).forEach((attr) => {
                    script.setAttribute(attr.name, attr.value);
                  });
                  if (oldScript.src) {
                    script.onload = () => resolve();
                    script.onerror = () => resolve();
                    script.src = oldScript.src;
                  } else {
                    script.textContent = oldScript.textContent || "";
                    resolve();
                  }
                  document.body.appendChild(script);
                  if (!oldScript.src) {
                    return;
                  }
                }),
            );
          });

          return sequence.then(() => {
            scheduleMeasure();
          });
        }

        window.addEventListener("message", function (event) {
          const data = event.data;
          if (!data || data.source !== HOST_SOURCE) {
            return;
          }

          if (data.theme) {
            setTheme(data.theme);
          }

          if (
            data.type === "widget:init" ||
            data.type === "widget:update"
          ) {
            patchHtml(data.html || "", data.visualSignature || "");
            return;
          }

          if (data.type === "widget:finalize") {
            const patched = patchHtml(
              data.html || "",
              data.visualSignature || "",
            );
            if (patched) {
              startFinalizeScripts(data.finalHtml || "");
            } else if (data.finalHtml) {
              state.pendingFinalize = {
                finalHtml: data.finalHtml,
              };
            }
          }
        });

        window.addEventListener("error", function (event) {
          post("widget:error", {
            message:
              event && event.message ? event.message : "Widget 运行异常",
          });
        });

        const resizeObserver = new ResizeObserver(function () {
          scheduleMeasure();
        });
        resizeObserver.observe(document.documentElement);
        resizeObserver.observe(root);

        setupGlobals();
        applyStandaloneConfig();
        syncAllRangeProgress();
        root.addEventListener(
          "click",
          function (event) {
            if (event && event.isTrusted) {
              issueTrustedGestureToken();
            }

            const target = event.target instanceof Element ? event.target : null;
            const anchor = target ? target.closest('a[href]') : null;
            if (!anchor) {
              return;
            }

            event.preventDefault();
            const href = anchor.getAttribute("href");
            if (href) {
              if (state.standaloneMode) {
                openStandaloneLink(href);
                return;
              }
              post("widget:open-link", { url: href });
            }
          },
          true,
        );
        root.addEventListener(
          "input",
          function (event) {
            if (event && event.isTrusted) {
              issueTrustedGestureToken();
            }
            const target = event.target;
            if (target instanceof HTMLInputElement && target.type === "range") {
              syncRangeProgress(target);
            }
          },
          true,
        );
        root.addEventListener(
          "change",
          function (event) {
            if (event && event.isTrusted) {
              issueTrustedGestureToken();
            }
          },
          true,
        );
        root.addEventListener(
          "keydown",
          function (event) {
            if (event && event.isTrusted) {
              issueTrustedGestureToken();
            }
          },
          true,
        );
        root.addEventListener(
          "pointerdown",
          function (event) {
            if (event && event.isTrusted) {
              issueTrustedGestureToken();
            }
          },
          true,
        );
        scheduleMeasure();

        const morphdomScript = document.createElement("script");
        morphdomScript.src =
          "https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js";
        morphdomScript.onload = function () {
          state.morphReady = true;
          if (state.pendingRender != null) {
            const pendingRender = state.pendingRender;
            state.pendingRender = null;
            const patched = patchHtml(
              pendingRender.html || "",
              pendingRender.visualSignature || "",
            );
            if (patched && state.pendingFinalize) {
              startFinalizeScripts(state.pendingFinalize.finalHtml || "");
            }
          }
        };
        morphdomScript.onerror = function () {
          state.morphReady = false;
          state.useInnerHtmlFallback = true;
          if (state.pendingRender != null) {
            applyHtmlFallback(
              state.pendingRender.html || "",
              state.pendingRender.visualSignature || "",
            );
            state.pendingRender = null;
          }
          if (state.pendingFinalize) {
            startFinalizeScripts(state.pendingFinalize.finalHtml || "");
          }
          post("widget:error", {
            message: "morphdom 加载失败，已回退到本地静态渲染",
          });
        };
        document.body.appendChild(morphdomScript);

        post("widget:ready");
      })();
    </script>
  </body>
</html>`;

export const getGenerativeWidgetShellSrcDoc = () => SHELL_SOURCE;

export const getStandaloneGenerativeWidgetHtml = ({
  documentTitle,
  payload,
  effectivePhase,
  theme,
}: StandaloneGenerativeWidgetConfig) => {
  const standaloneConfigScript = `<script>window.__TAU_WIDGET_STANDALONE_CONFIG__=${escapeInlineJson(
    {
      documentTitle,
      payload,
      effectivePhase,
      theme,
    },
  )};</script>`;

  return SHELL_SOURCE.replace(
    "<body>",
    `<body>\n    ${standaloneConfigScript}`,
  );
};
