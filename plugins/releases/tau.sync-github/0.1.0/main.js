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
var define_PLUGIN_META_default = { id: "tau.sync-github", name: "GitHub \u540C\u6B65\u5B58\u50A8", version: "0.1.0" };

// src/index.tsx
var import_react = require("react");
var import_plugins = require("@tau/plugins");
var import_ui = require("@tau/ui");

// src/sync.ts
function parse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("GitHub\u914D\u7F6E\u65E0\u6548");
  const text = (key) => {
    const field = value[key];
    if (typeof field !== "string" || !field)
      throw new Error("\u8BF7\u586B\u5199GitHub\u4EE4\u724C\u3001\u6240\u6709\u8005\u3001\u4ED3\u5E93\u548C\u5206\u652F");
    return field;
  };
  return {
    token: text("token"),
    owner: text("owner"),
    repo: text("repo"),
    branch: text("branch"),
    pathPrefix: typeof value.pathPrefix === "string" ? value.pathPrefix : ""
  };
}
function encode(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16384)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
function isMissing(error) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
var GithubSyncProvider = class {
  constructor(config, fetch) {
    this.config = config;
    this.fetch = fetch;
    this.prefix = config.pathPrefix.replace(/^\/+|\/+$/g, "");
  }
  prefix;
  path(name) {
    return [this.prefix, name.replace(/^\/+/, "")].filter(Boolean).join("/");
  }
  async request(path, body) {
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents${path ? "/" + path.split("/").map(encodeURIComponent).join("/") : ""}`
    );
    if (!body) url.searchParams.set("ref", this.config.branch);
    const response = await this.fetch(url, {
      method: body ? "PUT" : "GET",
      headers: {
        Authorization: `token ${this.config.token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : void 0,
      signal: AbortSignal.timeout(3e5)
    });
    if (response.status !== 200 && response.status !== 201)
      throw Object.assign(new Error(`GitHub\u8BF7\u6C42\u5931\u8D25\uFF1A${response.status}`), {
        status: response.status
      });
    return response.json();
  }
  async put(name, bytes, createOnly) {
    try {
      const path = this.path(name);
      const body = {
        branch: this.config.branch,
        message: `Update ${name}`,
        content: encode(bytes)
      };
      if (!createOnly) {
        try {
          const existing = await this.request(path);
          if (Array.isArray(existing) || typeof existing.sha !== "string")
            throw new Error("GitHub\u76EE\u6807\u4E0D\u662F\u6587\u4EF6");
          body.sha = existing.sha;
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      await this.request(path, body);
      return true;
    } catch {
      return false;
    }
  }
  uploadFile(name, bytes) {
    return this.put(name, bytes, false);
  }
  createFileIfAbsent(name, bytes) {
    return this.put(name, bytes, true);
  }
  async downloadFile(name) {
    const entry = await this.request(this.path(name));
    if (Array.isArray(entry) || typeof entry.content !== "string")
      throw new Error("GitHub\u672A\u8FD4\u56DEBase64\u6587\u4EF6\u5185\u5BB9");
    return Uint8Array.from(
      atob(entry.content.replace(/\n/g, "")),
      (char) => char.charCodeAt(0)
    );
  }
  async fileExists(name) {
    try {
      await this.downloadFile(name);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }
  async listFiles(prefix = "") {
    const queue = [this.path(prefix).replace(/\/+$/, "")];
    const visited = /* @__PURE__ */ new Set();
    const files = [];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      try {
        const result = await this.request(current);
        for (const item of Array.isArray(result) ? result : [result]) {
          if (item.type === "dir") queue.push(item.path);
          else if (item.type === "file") {
            const path = this.prefix && item.path.startsWith(this.prefix + "/") ? item.path.slice(this.prefix.length + 1) : item.path;
            files.push({
              name: item.name,
              path,
              size: item.size || 0,
              hash: item.sha
            });
          }
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    return files;
  }
};
function createGithubSyncProvider(config, fetch) {
  return new GithubSyncProvider(parse(config), fetch);
}

// src/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function GithubSettings({ syncConfig }) {
  const value = syncConfig?.value;
  const fields = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const [config, setConfig] = (0, import_react.useState)(() => ({
    owner: String(fields.owner ?? ""),
    repo: String(fields.repo ?? ""),
    branch: String(fields.branch ?? ""),
    pathPrefix: String(fields.pathPrefix ?? ""),
    token: String(fields.token ?? "")
  }));
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [saved, setSaved] = (0, import_react.useState)(false);
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
          ["owner", "\u4ED3\u5E93\u6240\u6709\u8005", ""],
          ["repo", "\u4ED3\u5E93", ""],
          ["branch", "\u5206\u652F", "main"],
          ["pathPrefix", "\u8DEF\u5F84\u524D\u7F00", "sync"],
          ["token", "\u8BBF\u95EE\u4EE4\u724C", ""]
        ].map(([key, label, placeholder]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_ui.Input,
            {
              "aria-label": label,
              type: key === "token" ? "password" : "text",
              value: config[key],
              placeholder,
              required: key !== "pathPrefix",
              autoComplete: "off",
              spellCheck: false,
              disabled: saving,
              onChange: (event) => {
                setSaved(false);
                setConfig({ ...config, [key]: event.target.value });
              }
            }
          )
        ] }, key)),
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
      context.sync.register({
        id: context.pluginId,
        name: "GitHub",
        create: (config) => createGithubSyncProvider(config, context.fetch)
      });
      context.settings.register({
        id: "sync",
        title: "GitHub \u540C\u6B65\u5B58\u50A8",
        target: "sync",
        component: GithubSettings
      });
    }
  })
});
