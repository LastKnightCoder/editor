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
var define_PLUGIN_META_default = { id: "tau.sync-github", name: "GitHub \u540C\u6B65\u5B58\u50A8", version: "0.3.3" };

// src/index.tsx
var import_plugins = require("@tau/plugins");

// src/form.ts
async function request(fetch, url, values, signal) {
  if (!values.token) throw new Error("\u8BF7\u5148\u586B\u5199\u8BBF\u95EE\u4EE4\u724C");
  const response = await fetch(url, {
    signal,
    headers: { Authorization: `Bearer ${values.token}`, Accept: "application/vnd.github+json" }
  });
  if (response.status === 401) throw new Error("\u8BBF\u95EE\u4EE4\u724C\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  if (!response.ok) throw new Error(`GitHub \u8BF7\u6C42\u5931\u8D25\uFF1AHTTP ${response.status}`);
  return response.json();
}
async function login(fetch, values, signal) {
  const profile = await request(fetch, "https://api.github.com/user", values, signal);
  if (typeof profile.login !== "string") throw new Error("GitHub \u8D26\u53F7\u4FE1\u606F\u65E0\u6548");
  return profile;
}
function createGithubForm(fetch, options) {
  return {
    groups: [
      {
        title: "\u8D26\u53F7",
        description: "GitHub Personal Access Token\uFF0C\u9700\u8981\u4ED3\u5E93\u8BFB\u5199\u6743\u9650",
        fields: [{ key: "token", label: "\u8BBF\u95EE\u4EE4\u724C", type: "secret" }]
      },
      {
        title: "\u5B58\u50A8\u4F4D\u7F6E",
        ...options.upload ? { description: "\u56FE\u5E8A\u8BF7\u9009\u516C\u5F00\u4ED3\u5E93\uFF0C\u79C1\u6709\u4ED3\u5E93\u7684\u56FE\u7247\u5730\u5740\u65E0\u6CD5\u76F4\u63A5\u8BBF\u95EE" } : {},
        fields: [
          {
            key: "owner",
            label: "\u4ED3\u5E93\u6240\u6709\u8005",
            type: "text",
            optional: true,
            description: "\u7559\u7A7A\u5219\u4F7F\u7528\u4EE4\u724C\u6240\u5C5E\u8D26\u53F7",
            placeholder: "\u7528\u6237\u540D\u6216\u7EC4\u7EC7\u540D",
            summary: true
          },
          {
            key: "repo",
            label: "\u4ED3\u5E93",
            type: "remote-choice",
            summary: true,
            dependsOn: ["owner"],
            load: async (values, signal) => {
              const owner = (values.owner || (await login(fetch, values, signal)).login).toLowerCase();
              const items = await request(
                fetch,
                "https://api.github.com/user/repos?per_page=100&sort=updated",
                values,
                signal
              );
              if (!Array.isArray(items)) throw new Error("\u4ED3\u5E93\u5217\u8868\u683C\u5F0F\u65E0\u6548");
              return items.filter((item) => String(item.owner?.login ?? "").toLowerCase() === owner).map((item) => ({
                value: String(item.name),
                description: item.private ? "\u79C1\u6709" : "\u516C\u5F00"
              }));
            }
          },
          {
            key: "branch",
            label: "\u5206\u652F",
            type: "remote-choice",
            placeholder: "main",
            dependsOn: ["repo"],
            load: async (values, signal) => {
              if (!values.repo) throw new Error("\u8BF7\u5148\u9009\u62E9\u4ED3\u5E93");
              const owner = values.owner || (await login(fetch, values, signal)).login;
              const items = await request(
                fetch,
                `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(values.repo)}/branches?per_page=100`,
                values,
                signal
              );
              if (!Array.isArray(items)) throw new Error("\u5206\u652F\u5217\u8868\u683C\u5F0F\u65E0\u6548");
              return items.map((item) => ({ value: String(item.name) }));
            }
          },
          {
            key: "pathPrefix",
            label: "\u76EE\u5F55",
            type: "text",
            optional: true,
            placeholder: options.pathPlaceholder
          },
          ...options.upload ? [
            {
              key: "publicBaseUrl",
              label: "\u516C\u5F00\u5730\u5740\u524D\u7F00",
              type: "url",
              optional: true,
              description: "\u4F7F\u7528\u81EA\u5B9A\u4E49\u57DF\u540D\u6216 CDN \u65F6\u586B\u5199"
            },
            {
              key: "email",
              label: "\u63D0\u4EA4\u90AE\u7BB1",
              type: "text",
              optional: true,
              description: "\u7559\u7A7A\u5219\u4F7F\u7528\u8D26\u53F7\u516C\u5F00\u90AE\u7BB1"
            }
          ] : []
        ]
      }
    ],
    beforeSave: async (values, signal) => {
      if (values.owner && (!options.upload || values.email)) return values;
      const profile = await login(fetch, values, signal);
      return {
        ...values,
        owner: values.owner || profile.login,
        ...options.upload ? { email: values.email || profile.email || "" } : {}
      };
    }
  };
}

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
  async request(path, body, objectOnly = false) {
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents${path ? "/" + path.split("/").map(encodeURIComponent).join("/") : ""}`
    );
    if (!body) url.searchParams.set("ref", this.config.branch);
    const response = await this.fetch(url, {
      method: body ? "PUT" : "GET",
      headers: {
        Authorization: `token ${this.config.token}`,
        "Content-Type": "application/json",
        Accept: objectOnly ? "application/vnd.github.object+json" : "application/vnd.github+json"
      },
      body: body ? JSON.stringify(body) : void 0,
      signal: AbortSignal.timeout(3e5)
    });
    if (response.status !== 200 && response.status !== 201) {
      await response.body?.cancel().catch(() => void 0);
      throw Object.assign(new Error(`GitHub\u8BF7\u6C42\u5931\u8D25\uFF1A${response.status}`), {
        status: response.status
      });
    }
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
          const existing = await this.request(path, void 0, true);
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
    const path = this.path(name);
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`
    );
    url.searchParams.set("ref", this.config.branch);
    const response = await this.fetch(url, {
      headers: {
        Authorization: `token ${this.config.token}`,
        Accept: "application/vnd.github.raw+json"
      },
      signal: AbortSignal.timeout(3e5)
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => void 0);
      throw Object.assign(new Error(`GitHub\u8BF7\u6C42\u5931\u8D25\uFF1A${response.status}`), {
        status: response.status
      });
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  async fileExists(name) {
    try {
      const entry = await this.request(this.path(name), void 0, true);
      return !Array.isArray(entry) && entry.type === "file";
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
        title: "GitHub",
        target: "sync",
        form: createGithubForm(context.fetch, { pathPlaceholder: "sync", upload: false })
      });
    }
  })
});
