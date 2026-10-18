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
var define_PLUGIN_META_default = { id: "tau.sync-s3", name: "S3 \u540C\u6B65\u5B58\u50A8", version: "0.1.2" };

// src/index.tsx
var import_react = require("react");
var import_plugins = require("@tau/plugins");
var import_ui = require("@tau/ui");
var import_jsx_runtime = require("react/jsx-runtime");
function S3Settings({ syncConfig }) {
  const value = syncConfig?.value;
  const fields = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const [config, setConfig] = (0, import_react.useState)(() => ({
    endpoint: String(fields.endpoint ?? ""),
    bucket: String(fields.bucket ?? ""),
    region: String(fields.region ?? ""),
    pathPrefix: String(fields.pathPrefix ?? ""),
    accessKeyId: String(fields.accessKeyId ?? ""),
    secretAccessKey: String(fields.secretAccessKey ?? ""),
    urlStyle: String(fields.urlStyle ?? "path")
  }));
  const [saving, setSaving] = (0, import_react.useState)(false), [error, setError] = (0, import_react.useState)(""), [saved, setSaved] = (0, import_react.useState)(false);
  if (!syncConfig) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u8BF7\u5728\u5BA2\u6237\u7AEF\u7684\u540C\u6B65\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u6B64\u63D2\u4EF6\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "form",
    {
      className: "flex flex-col gap-4",
      onSubmit: async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError("");
        setSaved(false);
        try {
          await syncConfig.save(config);
          setSaved(true);
        } catch (issue) {
          setError(issue instanceof Error ? issue.message : "\u4FDD\u5B58\u5931\u8D25");
        } finally {
          setSaving(false);
        }
      },
      children: [
        [
          ["endpoint", "Endpoint", "https://s3.example.com"],
          ["bucket", "Bucket", "\u540C\u6B65\u5B58\u50A8\u6876"],
          ["region", "Region", "us-east-1"],
          ["pathPrefix", "\u8DEF\u5F84\u524D\u7F00", "\u53EF\u9009"],
          ["accessKeyId", "Access Key ID", ""],
          ["secretAccessKey", "Secret Access Key", ""]
        ].map(([key, label, placeholder]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_ui.Input,
            {
              "aria-label": label,
              type: key === "secretAccessKey" ? "password" : "text",
              required: [
                "bucket",
                "region",
                "accessKeyId",
                "secretAccessKey"
              ].includes(key),
              autoComplete: "off",
              spellCheck: false,
              value: config[key],
              placeholder,
              disabled: saving,
              onChange: (event) => {
                setSaved(false);
                setConfig({ ...config, [key]: event.target.value });
              }
            }
          )
        ] }, key)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5730\u5740\u6A21\u5F0F" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_ui.Select,
            {
              "aria-label": "\u5730\u5740\u6A21\u5F0F",
              value: config.urlStyle,
              disabled: saving,
              options: [
                { value: "path", label: "\u8DEF\u5F84\u6A21\u5F0F" },
                { value: "virtualHosted", label: "\u865A\u62DF\u4E3B\u673A\u6A21\u5F0F" }
              ],
              onValueChange: (urlStyle) => {
                setSaved(false);
                setConfig({ ...config, urlStyle });
              }
            }
          )
        ] }),
        error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error }),
        saved && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: "\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u53EF\u4EE5\u4F7F\u7528\u5BA2\u6237\u7AEF\u7684\u68C0\u67E5\u3001\u4E0A\u4F20\u548C\u4E0B\u8F7D\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_ui.Button, { type: "submit", loading: saving, children: "\u4FDD\u5B58\u540C\u6B65\u914D\u7F6E" }) })
      ]
    }
  );
}
var index_default = (0, import_plugins.definePlugin)({
  ...define_PLUGIN_META_default,
  create: () => ({
    activate(context) {
      context.settings.register({
        id: "sync",
        title: "S3 \u540C\u6B65\u5B58\u50A8",
        target: "sync",
        component: S3Settings
      });
    }
  })
});
