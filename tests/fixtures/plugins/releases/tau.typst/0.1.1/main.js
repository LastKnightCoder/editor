"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.tsx
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// <define:__PLUGIN_META__>
var define_PLUGIN_META_default = { id: "tau.typst", name: "Typst \u6392\u7248", version: "0.1.1" };

// src/index.tsx
var import_plugins4 = require("@tau/plugins");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/createLucideIcon.js
var import_react2 = require("react");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && array.indexOf(className) === index;
}).join(" ");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/Icon.js
var import_react = require("react");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/Icon.js
var Icon = (0, import_react.forwardRef)(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return (0, import_react.createElement)(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => (0, import_react.createElement)(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = (0, import_react2.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react2.createElement)(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/icons/file-type.js
var FileType = createLucideIcon("FileType", [
  ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", key: "1rqfz7" }],
  ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
  ["path", { d: "M9 13v-1h6v1", key: "1bb014" }],
  ["path", { d: "M12 12v6", key: "3ahymv" }],
  ["path", { d: "M11 18h2", key: "12mj7e" }]
]);

// src/editor/extension.tsx
var import_plugins3 = require("@tau/plugins");

// src/editor/TypstBlock.tsx
var import_react4 = require("react");
var import_plugins2 = require("@tau/plugins");

// src/editor/TypstPreview.tsx
var import_react3 = require("react");
var import_plugins = require("@tau/plugins");
var import_jsx_runtime = require("react/jsx-runtime");
function TypstPreview({
  compile,
  content,
  initialHtml = "",
  compiledFrom,
  isDark,
  onCompiled
}) {
  const [html, setHtml] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)(null);
  const callback = (0, import_react3.useRef)(onCompiled);
  callback.current = onCompiled;
  const validCache = !!initialHtml && (!compiledFrom || compiledFrom === content);
  (0, import_plugins.useReportPreviewError)(error, { stale: !!html });
  (0, import_react3.useEffect)(() => {
    const controller = new AbortController();
    setError(null);
    if (!content.trim()) {
      setHtml("");
      return;
    }
    if (validCache) setHtml(initialHtml);
    if (!compile || validCache && compiledFrom === content) return;
    const timer = setTimeout(() => {
      void compile(content, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          setHtml(result);
          setError(null);
          callback.current?.(result, content);
        },
        (cause) => {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : "Typst \u7F16\u8BD1\u5931\u8D25");
        }
      );
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [content, compile, validCache, initialHtml, compiledFrom]);
  if (!content.trim()) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-ink-3 py-3 text-center", children: "\u6682\u65E0 Typst \u5185\u5BB9" });
  const displayed = compile ? html : validCache ? initialHtml : "";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-tau-typst-preview": true, children: [
    displayed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: { filter: isDark ? "invert(1) hue-rotate(180deg)" : void 0 },
        dangerouslySetInnerHTML: { __html: displayed }
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-ink-3", children: compile ? error ? "\u6682\u65E0\u53EF\u7528\u9884\u89C8\u3002" : "\u6B63\u5728\u7F16\u8BD1\u2026" : "\u6682\u65E0\u5DF2\u4FDD\u5B58\u9884\u89C8\uFF0C\u8BF7\u5728\u684C\u9762\u7AEF\u7F16\u8BD1\u540E\u4FDD\u5B58\u3002" }),
      !compile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: content }) })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "text-danger", children: error })
  ] });
}

// src/editor/TypstBlock.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var useAvailableServices = typeof import_plugins2.usePluginServices === "function" ? import_plugins2.usePluginServices : () => void 0;
function TypstBlock({
  attributes,
  element,
  children
}) {
  const { update, theme } = (0, import_plugins2.useSourceBlock)(element);
  const services = useAvailableServices();
  const editedSource = (0, import_react4.useRef)(void 0);
  const compile = (0, import_react4.useMemo)(
    () => services ? async (source, signal) => (await services.typst.compile({ source, format: "html" }, { signal })).html : void 0,
    [services]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { ...attributes, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_plugins2.SourceBlockEditor,
      {
        mode: "stex",
        title: "Typst",
        icon: FileType,
        initValue: element.content,
        element,
        center: true,
        onChange: (content) => {
          editedSource.current = content;
          update({ content, html: "", compiledFrom: void 0, compiledAt: void 0 });
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          TypstPreview,
          {
            compile,
            content: element.content,
            initialHtml: element.html,
            compiledFrom: element.compiledFrom,
            isDark: theme.isDark,
            onCompiled: (html, compiledFrom) => {
              if (editedSource.current !== compiledFrom || element.content !== compiledFrom) return;
              editedSource.current = void 0;
              update({ html, compiledFrom, compiledAt: Date.now() });
            }
          }
        )
      }
    ),
    children
  ] });
}

// src/editor/markdown.ts
var typstCodec = {
  type: "typst",
  isVoid: true,
  fence: { language: "typst" },
  serializer: {
    isBlock: true,
    toMarkdown: (element) => `\`\`\`typst
${element.content || ""}
\`\`\``
  }
};
function typstHtml(element) {
  const content = typeof element.content === "string" ? element.content : "";
  if (typeof element.html === "string" && element.html && (!element.compiledFrom || element.compiledFrom === content))
    return `<div class="typst-html">${element.html}</div>`;
  const escaped = content.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
  return `<pre class="typst-fallback"><code>${escaped}</code></pre>`;
}

// src/editor/extension.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var typstExtension = (0, import_plugins3.defineEditorExtension)({
  id: "tau.typst",
  elements: [
    (0, import_plugins3.defineEditorElement)({
      type: "typst",
      kind: "block",
      drag: true,
      isVoid: true,
      isEmpty: (element) => !element.content,
      render: (props) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(TypstBlock, { ...props })
    })
  ],
  blockPanel: [
    {
      icon: FileType,
      title: "Typst",
      description: "Typst \u6392\u7248",
      keywords: ["typst", "math", "typeset"],
      onClick: (editor) => {
        (0, import_plugins3.insertSourceBlock)(editor, {
          type: "typst",
          content: "",
          children: [{ type: "formatted", text: "" }]
        });
      }
    }
  ],
  behaviorsFor: { paragraph: (0, import_plugins3.sourceBlockParagraphBehavior)("typst") },
  htmlSerializers: [{ type: "typst", toHtml: typstHtml }]
});

// src/skills/typst.md
var typst_default = "# Typst \u6392\u7248\n\n\u5728\u7528\u6237\u8981\u6C42\u4F7F\u7528 Typst \u6392\u7248\u3001\u7F16\u5199\u516C\u5F0F\u6216\u4FEE\u6539\u5DF2\u6709 Typst \u5757\u65F6\u4F7F\u7528\u3002\u7528 typst \u4EE3\u7801\u56F4\u680F\u4FDD\u5B58\u539F\u59CB\u6E90\u7801\uFF1B\u4E0D\u8981\u628A\u7F16\u8BD1\u540E\u7684 HTML \u5199\u5165\u56F4\u680F\uFF0C\u4E5F\u4E0D\u8981\u6539\u5199\u65E0\u5173\u6E90\u7801\u3002\n\n\u684C\u9762\u7AEF\u901A\u8FC7 Tau \u7684 Typst HTML \u7F16\u8BD1\u670D\u52A1\u9884\u89C8\uFF0C\u652F\u6301\u5DF2\u6709 HTML \u5BFC\u51FA\u8303\u56F4\u3002\u4E0D\u8981\u5047\u8BBE PDF \u7248\u5F0F\u3001\u4EFB\u610F\u5B57\u4F53\u6216\u5B8F\u5305\u5747\u53D7\u652F\u6301\u3002\u535A\u5BA2\u53EA\u5C55\u793A\u684C\u9762\u5DF2\u4FDD\u5B58\u7684\u9884\u89C8\uFF1B\u53D1\u5E03\u524D\u5728\u684C\u9762\u5B8C\u6210\u7F16\u8BD1\u548C\u4FDD\u5B58\u3002\u6CA1\u6709\u9884\u89C8\u7F13\u5B58\u65F6\u4FDD\u7559\u6E90\u7801\u3002\n";

// src/index.tsx
var index_default = (0, import_plugins4.definePlugin)({
  ...define_PLUGIN_META_default,
  editorExtensions: [typstExtension],
  editorCodecs: [typstCodec],
  skills: [
    {
      id: "authoring",
      name: "Typst \u6392\u7248",
      description: "\u521B\u5EFA\u6216\u4FEE\u6539\u6587\u6863\u4E2D\u7684 Typst \u6392\u7248\u5757\u65F6\u4F7F\u7528\u3002",
      content: typst_default
    }
  ]
});
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/file-type.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.399.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
