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
var define_PLUGIN_META_default = { id: "tau.typst", name: "Typst \u6392\u7248", version: "0.2.6" };

// src/metrics.ts
var editorMetrics = [
  {
    type: "typst",
    textFields: ["content"]
  }
];

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

// src/compiler/resources.ts
var COMPILER_VERSION = "0.6.1-rc3";
var FONTS_VERSION = "1.0.0";
var CDN_ORIGINS = ["https://cdn.jsdelivr.net/npm", "https://unpkg.com"];
var compilerWasm = {
  sha256: "5343822b1753af265f2311fef3cc088f65b40ac708f0b4d1c8492f50d4f8017a",
  bytes: 21732903,
  path: (origin) => `${origin}/@myriaddreamin/typst-ts-web-compiler@${COMPILER_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`
};
var rendererWasm = {
  sha256: "7b0ec2183bb6a68d830b169d71febf8c501c320d5a4d90944211b309ec224aa2",
  bytes: 981128,
  path: (origin) => `${origin}/@myriaddreamin/typst-ts-renderer@${COMPILER_VERSION}/pkg/typst_ts_renderer_bg.wasm`
};
var FONT_FILES = [
  ["DejaVuSansMono.ttf", "b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582", 340712],
  ["DejaVuSansMono-Bold.ttf", "bce60f1b4421acd9ea51ba6623d7024ecbe6817a953e3654df62a5e6bdf8f769", 331992],
  ["DejaVuSansMono-Oblique.ttf", "742097840c541870e8d6dc5c9b37bb1ceeea6c0dedd1d475faf903ef9df734b0", 251932],
  ["DejaVuSansMono-BoldOblique.ttf", "91713a71d550bba22c2a6b2bb2a9ad8f9a159e12e4e9f0a5b2677998ba21213e", 253580],
  ["LibertinusSerif-Regular.otf", "fcf06307a77367394fcb0ccb241e59eea70dba3d732be309647611224679c733", 337132],
  ["LibertinusSerif-Italic.otf", "9a393d63d6e05f620d3dc0190dfd35a8ede58c0808cf0fc9de7fcb9c723e4c24", 332312],
  ["LibertinusSerif-Bold.otf", "0264914210ed51b3231ebc92ce529e9f2e166ba9eebf0cd4a579558690a27b64", 293908],
  ["LibertinusSerif-BoldItalic.otf", "47a665259f09f554f5d133d7718cdad43ff462c6a6b2328f38023465e62d57ce", 259176],
  ["LibertinusSerif-Semibold.otf", "a4b3f28e85881db34695c1f005e4c79233a6caf3a2bd286c9b418c025fb99308", 291640],
  ["LibertinusSerif-SemiboldItalic.otf", "397f0d7aba35ae6a988948ae046c14c6b1e0d270fcc6e292b8bc29fd625c6101", 343148],
  ["NewCM10-Regular.otf", "7e7bfec1dd8456ca76865ff7846b8764f2e0135749782b62751a2cc930a7c6c3", 717376],
  ["NewCM10-Italic.otf", "f360fdd01bd528154c535705bef03721737d25a95be622b5ef1ac540ea56ff44", 721044],
  ["NewCM10-Bold.otf", "3f04ed6056dcad95e214631a03cf0db0d30b22680d7274f03e63921a8e90d8f3", 629164],
  ["NewCM10-BoldItalic.otf", "8e056b54044b17ac812073c3bdac3b91e5b6ef768e99814baa8651a5d07b1738", 608856],
  ["NewCMMath-Book.otf", "60346e6fc27773d96c3cc9d3ac8a550a85e3ca624437179bd7a88b4ca18f0a18", 1431932],
  ["NewCMMath-Regular.otf", "925289812275068dfc9dd06ac44dcd206944ee2f58f9a08186c1fd3539520e05", 1306384],
  ["NewCMMath-Bold.otf", "528c420a827f1a6702c255c3e7b935a47d903906655bcb6cda8100820314447e", 1232012]
];
var fontEntries = new Map(
  FONT_FILES.map(([name, sha2562, bytes]) => [
    name,
    {
      sha256: sha2562,
      bytes,
      path: (origin) => `${origin}/@typst-wasm/fonts@${FONTS_VERSION}/dist/files/${name}`
    }
  ])
);
var compilerResourceKey = "typst-ts-web-compiler.wasm";
var rendererResourceKey = "typst-ts-renderer.wasm";
var resources = new Map([
  [compilerResourceKey, compilerWasm],
  [rendererResourceKey, rendererWasm],
  ...[...fontEntries].map(([name, entry]) => [`fonts/${name}`, entry])
]);
var totalResourceBytes = [...resources.values()].reduce((sum, r) => sum + r.bytes, 0);
var memoryCache = () => {
  const store = /* @__PURE__ */ new Map();
  return {
    async get(key) {
      return store.get(key);
    },
    async put(key, bytes) {
      store.set(key, bytes);
    }
  };
};
var indexedDbCache = (database) => {
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("resources");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB \u6253\u5F00\u5931\u8D25"));
  });
  const run = (mode, action) => open().then(
    (db) => new Promise((resolve, reject) => {
      const request = action(db.transaction("resources", mode).objectStore("resources"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB \u8BFB\u5199\u5931\u8D25"));
      request.transaction?.addEventListener(
        "abort",
        () => reject(request.error ?? new Error("IndexedDB \u4E8B\u52A1\u4E2D\u65AD"))
      );
    })
  );
  return {
    get: (key) => run("readonly", (store) => store.get(key)),
    put: (key, bytes) => run("readwrite", (store) => store.put(bytes, key)).then(() => void 0)
  };
};
var cache;
async function resourceCache() {
  if (cache) return cache;
  cache = typeof indexedDB === "undefined" ? memoryCache() : indexedDbCache("tau-plugin-typst");
  return cache;
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function download(key, entry, signal) {
  let lastError = "\u65E0\u6CD5\u8FDE\u63A5\u4E0B\u8F7D\u6E90";
  for (const origin of CDN_ORIGINS) {
    signal.throwIfAborted();
    try {
      const response = await fetch(entry.path(origin), { signal });
      if (!response.ok) throw new Error(`\u4E0B\u8F7D\u6E90\u8FD4\u56DE ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== entry.bytes) throw new Error(`\u6587\u4EF6\u5927\u5C0F\u4E0D\u7B26\uFF08${bytes.length}\uFF09`);
      if (await sha256(bytes) !== entry.sha256) throw new Error("\u6587\u4EF6\u6821\u9A8C\u5931\u8D25");
      return bytes;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`\u4E0B\u8F7D ${key} \u5931\u8D25\uFF1A${lastError}`);
}
async function loadResource(key, options = {}) {
  const entry = resources.get(key);
  if (!entry) throw new Error(`\u672A\u77E5\u8D44\u6E90\uFF1A${key}`);
  const store = await resourceCache();
  const cached = await store.get(key);
  if (cached) {
    if (cached.length === entry.bytes) return cached;
    await store.put(key, new Uint8Array());
  }
  const bytes = await download(key, entry, options.signal ?? new AbortController().signal);
  await store.put(key, bytes);
  options.onProgress?.({ loadedBytes: entry.bytes, totalBytes: totalResourceBytes });
  return bytes;
}
async function loadEngineResources(options = {}) {
  const signal = options.signal ?? new AbortController().signal;
  const loaded = /* @__PURE__ */ new Map();
  let downloadedBytes = 0;
  const acquire = async (key) => {
    const bytes = await loadResource(key, {
      signal,
      onProgress: ({ loadedBytes }) => {
        downloadedBytes += loadedBytes;
        options.onProgress?.({
          loadedBytes: downloadedBytes,
          totalBytes: totalResourceBytes
        });
      }
    });
    loaded.set(key, bytes);
    return bytes;
  };
  const compilerBytes = await acquire(compilerResourceKey);
  const rendererBytes = await acquire(rendererResourceKey);
  const fonts = [];
  for (const key of resources.keys()) {
    if (!key.startsWith("fonts/")) continue;
    fonts.push(await acquire(key));
  }
  return { compilerWasm: compilerBytes, rendererWasm: rendererBytes, fonts };
}

// src/vendor/typst_ts_web_compiler.mjs
var import_meta = {};
var wasm;
var heap = new Array(128).fill(void 0);
heap.push(void 0, null, true, false);
function getObject(idx) {
  return heap[idx];
}
var heap_next = heap.length;
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_export_0(addHeapObject(e));
  }
}
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
function dropObject(idx) {
  if (idx < 132) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
var WASM_VECTOR_LEN = 0;
var cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
  throw Error("TextEncoder not available");
} };
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
var cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
var CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((state) => {
  wasm.__wbindgen_export_4.get(state.dtor)(state.a, state.b);
});
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_4.get(state.dtor)(a, state.b);
        CLOSURE_DTORS.unregister(state);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function getArrayJsValueFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory0();
  const result = [];
  for (let i = ptr; i < ptr + 4 * len; i += 4) {
    result.push(takeObject(mem.getUint32(i, true)));
  }
  return result;
}
function passArrayJsValueToWasm0(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  const mem = getDataViewMemory0();
  for (let i = 0; i < array.length; i++) {
    mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
  }
  WASM_VECTOR_LEN = array.length;
  return ptr;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
function __wbg_adapter_50(arg0, arg1, arg2) {
  wasm.__wbindgen_export_5(arg0, arg1, addHeapObject(arg2));
}
function __wbg_adapter_157(arg0, arg1, arg2, arg3) {
  wasm.__wbindgen_export_6(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}
var IncrServerFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_incrserver_free(ptr >>> 0, 1));
var IncrServer = class _IncrServer {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_IncrServer.prototype);
    obj.__wbg_ptr = ptr;
    IncrServerFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    IncrServerFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_incrserver_free(ptr, 0);
  }
  /**
   * @param {boolean} attach
   */
  set_attach_debug_info(attach) {
    wasm.incrserver_set_attach_debug_info(this.__wbg_ptr, attach);
  }
  /**
   * @returns {Uint8Array | undefined}
   */
  current() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.incrserver_current(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      let v1;
      if (r0 !== 0) {
        v1 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  reset() {
    wasm.incrserver_reset(this.__wbg_ptr);
  }
};
var ProxyContextFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_proxycontext_free(ptr >>> 0, 1));
var ProxyContext = class _ProxyContext {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_ProxyContext.prototype);
    obj.__wbg_ptr = ptr;
    ProxyContextFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ProxyContextFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_proxycontext_free(ptr, 0);
  }
  /**
   * Creates a new `ProxyContext` instance.
   * @param {any} context
   */
  constructor(context) {
    const ret = wasm.proxycontext_new(addHeapObject(context));
    this.__wbg_ptr = ret >>> 0;
    ProxyContextFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Returns the JavaScript this.
   * @returns {any}
   */
  get context() {
    const ret = wasm.proxycontext_context(this.__wbg_ptr);
    return takeObject(ret);
  }
  /**
   * A convenience function to untar a tarball and call a callback for each
   * entry.
   * @param {Uint8Array} data
   * @param {Function} cb
   */
  untar(data, cb) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export_2);
      const len0 = WASM_VECTOR_LEN;
      wasm.proxycontext_untar(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(cb));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
var TypstCompilerFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_typstcompiler_free(ptr >>> 0, 1));
var TypstCompiler = class _TypstCompiler {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_TypstCompiler.prototype);
    obj.__wbg_ptr = ptr;
    TypstCompilerFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    TypstCompilerFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_typstcompiler_free(ptr, 0);
  }
  reset() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompiler_reset(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {any} inputs
   */
  set_inputs(inputs) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompiler_set_inputs(retptr, this.__wbg_ptr, addHeapObject(inputs));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} path
   * @param {string} content
   * @returns {boolean}
   */
  add_source(path, content) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(content, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.typstcompiler_add_source(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    return ret !== 0;
  }
  /**
   * @param {string} path
   * @param {Uint8Array} content
   * @returns {boolean}
   */
  map_shadow(path, content) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(content, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.typstcompiler_map_shadow(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    return ret !== 0;
  }
  /**
   * @param {string} path
   * @returns {boolean}
   */
  unmap_shadow(path) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.typstcompiler_unmap_shadow(this.__wbg_ptr, ptr0, len0);
    return ret !== 0;
  }
  reset_shadow() {
    wasm.typstcompiler_reset_shadow(this.__wbg_ptr);
  }
  /**
   * @returns {string[]}
   */
  get_loaded_fonts() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompiler_get_loaded_fonts(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
      wasm.__wbindgen_export_1(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} main_file_path
   * @returns {string}
   */
  get_ast(main_file_path) {
    let deferred3_0;
    let deferred3_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(main_file_path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      wasm.typstcompiler_get_ast(retptr, this.__wbg_ptr, ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr2 = r0;
      var len2 = r1;
      if (r3) {
        ptr2 = 0;
        len2 = 0;
        throw takeObject(r2);
      }
      deferred3_0 = ptr2;
      deferred3_1 = len2;
      return getStringFromWasm0(ptr2, len2);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export_1(deferred3_0, deferred3_1, 1);
    }
  }
  /**
   * @returns {any}
   */
  get_semantic_token_legend() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompiler_get_semantic_token_legend(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} offset_encoding
   * @param {string | null} [file_path]
   * @param {string | null} [result_id]
   * @returns {object}
   */
  get_semantic_tokens(offset_encoding, file_path, result_id) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(offset_encoding, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      var ptr1 = isLikeNone(file_path) ? 0 : passStringToWasm0(file_path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      var len1 = WASM_VECTOR_LEN;
      var ptr2 = isLikeNone(result_id) ? 0 : passStringToWasm0(result_id, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      var len2 = WASM_VECTOR_LEN;
      wasm.typstcompiler_get_semantic_tokens(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} fmt
   * @param {number} diagnostics_format
   * @returns {any}
   */
  get_artifact(fmt, diagnostics_format) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(fmt, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      wasm.typstcompiler_get_artifact(retptr, this.__wbg_ptr, ptr0, len0, diagnostics_format);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} main_file_path
   * @param {(Array<any>)[] | null} [inputs]
   */
  set_compiler_options(main_file_path, inputs) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(main_file_path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      var ptr1 = isLikeNone(inputs) ? 0 : passArrayJsValueToWasm0(inputs, wasm.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN;
      wasm.typstcompiler_set_compiler_options(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} main_file_path
   * @param {(Array<any>)[] | null | undefined} inputs
   * @param {string} selector
   * @param {string | null} [field]
   * @returns {string}
   */
  query(main_file_path, inputs, selector, field) {
    let deferred6_0;
    let deferred6_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(main_file_path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      var ptr1 = isLikeNone(inputs) ? 0 : passArrayJsValueToWasm0(inputs, wasm.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(selector, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len2 = WASM_VECTOR_LEN;
      var ptr3 = isLikeNone(field) ? 0 : passStringToWasm0(field, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      var len3 = WASM_VECTOR_LEN;
      wasm.typstcompiler_query(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr5 = r0;
      var len5 = r1;
      if (r3) {
        ptr5 = 0;
        len5 = 0;
        throw takeObject(r2);
      }
      deferred6_0 = ptr5;
      deferred6_1 = len5;
      return getStringFromWasm0(ptr5, len5);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export_1(deferred6_0, deferred6_1, 1);
    }
  }
  /**
   * @param {string} main_file_path
   * @param {(Array<any>)[] | null | undefined} inputs
   * @param {string} fmt
   * @param {number} diagnostics_format
   * @returns {any}
   */
  compile(main_file_path, inputs, fmt, diagnostics_format) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(main_file_path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      var ptr1 = isLikeNone(inputs) ? 0 : passArrayJsValueToWasm0(inputs, wasm.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(fmt, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len2 = WASM_VECTOR_LEN;
      wasm.typstcompiler_compile(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, diagnostics_format);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @returns {IncrServer}
   */
  create_incr_server() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompiler_create_incr_server(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return IncrServer.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string} main_file_path
   * @param {(Array<any>)[] | null | undefined} inputs
   * @param {IncrServer} state
   * @param {number} diagnostics_format
   * @returns {any}
   */
  incr_compile(main_file_path, inputs, state, diagnostics_format) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(main_file_path, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
      const len0 = WASM_VECTOR_LEN;
      var ptr1 = isLikeNone(inputs) ? 0 : passArrayJsValueToWasm0(inputs, wasm.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN;
      _assertClass(state, IncrServer);
      wasm.typstcompiler_incr_compile(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, state.__wbg_ptr, diagnostics_format);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
var TypstCompilerBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_typstcompilerbuilder_free(ptr >>> 0, 1));
var TypstCompilerBuilder = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    TypstCompilerBuilderFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_typstcompilerbuilder_free(ptr, 0);
  }
  constructor() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompilerbuilder_new(retptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      TypstCompilerBuilderFinalization.register(this, this.__wbg_ptr, this);
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  set_dummy_access_model() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.typstcompilerbuilder_set_dummy_access_model(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {any} context
   * @param {Function} mtime_fn
   * @param {Function} is_file_fn
   * @param {Function} real_path_fn
   * @param {Function} read_all_fn
   * @returns {Promise<void>}
   */
  set_access_model(context, mtime_fn, is_file_fn, real_path_fn, read_all_fn) {
    const ret = wasm.typstcompilerbuilder_set_access_model(this.__wbg_ptr, addHeapObject(context), addHeapObject(mtime_fn), addHeapObject(is_file_fn), addHeapObject(real_path_fn), addHeapObject(read_all_fn));
    return takeObject(ret);
  }
  /**
   * @param {any} context
   * @param {Function} real_resolve_fn
   * @returns {Promise<void>}
   */
  set_package_registry(context, real_resolve_fn) {
    const ret = wasm.typstcompilerbuilder_set_package_registry(this.__wbg_ptr, addHeapObject(context), addHeapObject(real_resolve_fn));
    return takeObject(ret);
  }
  /**
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  add_raw_font(data) {
    const ret = wasm.typstcompilerbuilder_add_raw_font(this.__wbg_ptr, addHeapObject(data));
    return takeObject(ret);
  }
  /**
   * @param {Array<any>} fonts
   * @returns {Promise<void>}
   */
  add_web_fonts(fonts) {
    const ret = wasm.typstcompilerbuilder_add_web_fonts(this.__wbg_ptr, addHeapObject(fonts));
    return takeObject(ret);
  }
  /**
   * @returns {Promise<TypstCompiler>}
   */
  build() {
    const ptr = this.__destroy_into_raw();
    const ret = wasm.typstcompilerbuilder_build(ptr);
    return takeObject(ret);
  }
};
async function __wbg_load(module2, imports) {
  if (typeof Response === "function" && module2 instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module2, imports);
      } catch (e) {
        if (module2.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module2.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module2, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module: module2 };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_call_672a4d21634d4a24 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).call(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_b8adc8b1d0a0d8eb = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_done_769e5ede4b31c67b = function(arg0) {
    const ret = getObject(arg0).done;
    return ret;
  };
  imports.wbg.__wbg_entries_3265d4158b33e5dc = function(arg0) {
    const ret = Object.entries(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_error_13f62fdb4fc06f92 = function(arg0, arg1, arg2) {
    console.error(getObject(arg0), getObject(arg1), getObject(arg2));
  };
  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.error(getStringFromWasm0(arg0, arg1));
    } finally {
      wasm.__wbindgen_export_1(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_getTimezoneOffset_6b5752021c499c47 = function(arg0) {
    const ret = getObject(arg0).getTimezoneOffset();
    return ret;
  };
  imports.wbg.__wbg_get_67b2ba62fc30de12 = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.get(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_get_b9b93047fe3cf45b = function(arg0, arg1) {
    const ret = getObject(arg0)[arg1 >>> 0];
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_getwithrefkey_1dc361bd10053bfe = function(arg0, arg1) {
    const ret = getObject(arg0)[getObject(arg1)];
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_info_3daf2e093e091b66 = function(arg0) {
    console.info(getObject(arg0));
  };
  imports.wbg.__wbg_instanceof_ArrayBuffer_e14585432e3737fc = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof ArrayBuffer;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Map_f3469ce2244d2430 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Map;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Object_7f2dcef8f78644a4 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Object;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Uint8Array_17156bcf118086a9 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_isArray_a1eab7e0d067391b = function(arg0) {
    const ret = Array.isArray(getObject(arg0));
    return ret;
  };
  imports.wbg.__wbg_isSafeInteger_343e2beeeece1bb0 = function(arg0) {
    const ret = Number.isSafeInteger(getObject(arg0));
    return ret;
  };
  imports.wbg.__wbg_iterator_9a24c88df860dc65 = function() {
    const ret = Symbol.iterator;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
    const ret = getObject(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_length_e2d2a49132c1b256 = function(arg0) {
    const ret = getObject(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_log_53ca6abb454c8644 = function(arg0, arg1, arg2) {
    console.log(getObject(arg0), getObject(arg1), getObject(arg2));
  };
  imports.wbg.__wbg_new_23a2665fac83c611 = function(arg0, arg1) {
    try {
      var state0 = { a: arg0, b: arg1 };
      var cb0 = (arg02, arg12) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return __wbg_adapter_157(a, state0.b, arg02, arg12);
        } finally {
          state0.a = a;
        }
      };
      const ret = new Promise(cb0);
      return addHeapObject(ret);
    } finally {
      state0.a = state0.b = 0;
    }
  };
  imports.wbg.__wbg_new_31a97dac4f10fab7 = function(arg0) {
    const ret = new Date(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_405e22f390576ce2 = function() {
    const ret = new Object();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_78feb108b6472713 = function() {
    const ret = new Array();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    const ret = new Error();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_c68d7209be747379 = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_e3b321dcfef89fc7 = function(arg0) {
    const ret = new Uint32Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithargs_ab6ffe8cd6c19c04 = function(arg0, arg1, arg2, arg3) {
    const ret = new Function(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_f1dead44d1fc7212 = function(arg0, arg1, arg2) {
    const ret = new Uint32Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_next_25feadfc0913fea9 = function(arg0) {
    const ret = getObject(arg0).next;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_next_6574e1a8a62d1055 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).next();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_now_807e54c39636c349 = function() {
    const ret = Date.now();
    return ret;
  };
  imports.wbg.__wbg_proxycontext_new = function(arg0) {
    const ret = ProxyContext.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_push_737cfc8c1432c2c6 = function(arg0, arg1) {
    const ret = getObject(arg0).push(getObject(arg1));
    return ret;
  };
  imports.wbg.__wbg_queueMicrotask_97d92b4fcc8a61c5 = function(arg0) {
    queueMicrotask(getObject(arg0));
  };
  imports.wbg.__wbg_queueMicrotask_d3219def82552485 = function(arg0) {
    const ret = getObject(arg0).queueMicrotask;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_resolve_4851785c9c5f573d = function(arg0) {
    const ret = Promise.resolve(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_set_37837023f3d740e8 = function(arg0, arg1, arg2) {
    getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
  };
  imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
    getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
  };
  imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
  };
  imports.wbg.__wbg_set_bb8cecf6a62b9f46 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
    const ret = getObject(arg1).stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
    const ret = typeof global === "undefined" ? null : global;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
    const ret = typeof globalThis === "undefined" ? null : globalThis;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
    const ret = typeof self === "undefined" ? null : self;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
    const ret = typeof window === "undefined" ? null : window;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_then_44b73946d2fb3e7d = function(arg0, arg1) {
    const ret = getObject(arg0).then(getObject(arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_typstcompiler_new = function(arg0) {
    const ret = TypstCompiler.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_value_cd1ffa7b1ab794f1 = function(arg0) {
    const ret = getObject(arg0).value;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_as_number = function(arg0) {
    const ret = +getObject(arg0);
    return ret;
  };
  imports.wbg.__wbindgen_bigint_from_i64 = function(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_bigint_from_u64 = function(arg0) {
    const ret = BigInt.asUintN(64, arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_bigint_get_as_i64 = function(arg0, arg1) {
    const v = getObject(arg1);
    const ret = typeof v === "bigint" ? v : void 0;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbindgen_boolean_get = function(arg0) {
    const v = getObject(arg0);
    const ret = typeof v === "boolean" ? v ? 1 : 0 : 2;
    return ret;
  };
  imports.wbg.__wbindgen_cb_drop = function(arg0) {
    const obj = takeObject(arg0).original;
    if (obj.cnt-- == 1) {
      obj.a = 0;
      return true;
    }
    const ret = false;
    return ret;
  };
  imports.wbg.__wbindgen_closure_wrapper794 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 219, __wbg_adapter_50);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_in = function(arg0, arg1) {
    const ret = getObject(arg0) in getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_is_bigint = function(arg0) {
    const ret = typeof getObject(arg0) === "bigint";
    return ret;
  };
  imports.wbg.__wbindgen_is_function = function(arg0) {
    const ret = typeof getObject(arg0) === "function";
    return ret;
  };
  imports.wbg.__wbindgen_is_object = function(arg0) {
    const val = getObject(arg0);
    const ret = typeof val === "object" && val !== null;
    return ret;
  };
  imports.wbg.__wbindgen_is_string = function(arg0) {
    const ret = typeof getObject(arg0) === "string";
    return ret;
  };
  imports.wbg.__wbindgen_is_undefined = function(arg0) {
    const ret = getObject(arg0) === void 0;
    return ret;
  };
  imports.wbg.__wbindgen_jsval_eq = function(arg0, arg1) {
    const ret = getObject(arg0) === getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_jsval_loose_eq = function(arg0, arg1) {
    const ret = getObject(arg0) == getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "number" ? obj : void 0;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbindgen_number_new = function(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  return imports;
}
function __wbg_init_memory(imports, memory) {
}
function __wbg_finalize_init(instance, module2) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module2;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  return wasm;
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0) return wasm;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = importWasmModule("typst_ts_web_compiler_bg.wasm", import_meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  __wbg_init_memory(imports);
  const { instance, module: module2 } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module2);
}
var typst_ts_web_compiler_default = __wbg_init;
var importWasmModule = async function(wasm_name, url) {
  throw new Error("Cannot import wasm module without importer: " + wasm_name + " " + url);
};

// src/vendor/typst_ts_renderer.mjs
var import_meta2 = {};
var wasm2;
var heap2 = new Array(128).fill(void 0);
heap2.push(void 0, null, true, false);
function getObject2(idx) {
  return heap2[idx];
}
var heap_next2 = heap2.length;
function addHeapObject2(obj) {
  if (heap_next2 === heap2.length) heap2.push(heap2.length + 1);
  const idx = heap_next2;
  heap_next2 = heap2[idx];
  if (typeof heap_next2 !== "number") throw new Error("corrupt heap");
  heap2[idx] = obj;
  return idx;
}
function handleError2(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm2.__wbindgen_export_0(addHeapObject2(e));
  }
}
function logError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    let error = (function() {
      try {
        return e instanceof Error ? `${e.message}

Stack:
${e.stack}` : e.toString();
      } catch (_) {
        return "<failed to stringify thrown value>";
      }
    })();
    console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
    throw e;
  }
}
function _assertNum(n) {
  if (typeof n !== "number") throw new Error(`expected a number argument, found ${typeof n}`);
}
var cachedTextDecoder2 = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder2.decode();
}
var cachedUint8ArrayMemory02 = null;
function getUint8ArrayMemory02() {
  if (cachedUint8ArrayMemory02 === null || cachedUint8ArrayMemory02.byteLength === 0) {
    cachedUint8ArrayMemory02 = new Uint8Array(wasm2.memory.buffer);
  }
  return cachedUint8ArrayMemory02;
}
function getStringFromWasm02(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder2.decode(getUint8ArrayMemory02().subarray(ptr, ptr + len));
}
var WASM_VECTOR_LEN2 = 0;
var cachedTextEncoder2 = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
  throw Error("TextEncoder not available");
} };
var encodeString2 = typeof cachedTextEncoder2.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder2.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder2.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm02(arg, malloc, realloc) {
  if (typeof arg !== "string") throw new Error(`expected a string argument, found ${typeof arg}`);
  if (realloc === void 0) {
    const buf = cachedTextEncoder2.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory02().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN2 = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory02();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory02().subarray(ptr + offset, ptr + len);
    const ret = encodeString2(arg, view);
    if (ret.read !== arg.length) throw new Error("failed to pass whole string");
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN2 = offset;
  return ptr;
}
var cachedDataViewMemory02 = null;
function getDataViewMemory02() {
  if (cachedDataViewMemory02 === null || cachedDataViewMemory02.buffer.detached === true || cachedDataViewMemory02.buffer.detached === void 0 && cachedDataViewMemory02.buffer !== wasm2.memory.buffer) {
    cachedDataViewMemory02 = new DataView(wasm2.memory.buffer);
  }
  return cachedDataViewMemory02;
}
function isLikeNone2(x) {
  return x === void 0 || x === null;
}
function _assertBoolean(n) {
  if (typeof n !== "boolean") {
    throw new Error(`expected a boolean argument, found ${typeof n}`);
  }
}
function dropObject2(idx) {
  if (idx < 132) return;
  heap2[idx] = heap_next2;
  heap_next2 = idx;
}
function takeObject2(idx) {
  const ret = getObject2(idx);
  dropObject2(idx);
  return ret;
}
var CLOSURE_DTORS2 = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((state) => {
  wasm2.__wbindgen_export_4.get(state.dtor)(state.a, state.b);
});
function makeMutClosure2(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm2.__wbindgen_export_4.get(state.dtor)(a, state.b);
        CLOSURE_DTORS2.unregister(state);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;
  CLOSURE_DTORS2.register(real, state, state);
  return real;
}
function makeClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    try {
      return f(state.a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm2.__wbindgen_export_4.get(state.dtor)(state.a, state.b);
        state.a = 0;
        CLOSURE_DTORS2.unregister(state);
      }
    }
  };
  real.original = state;
  CLOSURE_DTORS2.register(real, state, state);
  return real;
}
function debugString2(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString2(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString2(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function passArray8ToWasm02(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory02().set(arg, ptr / 1);
  WASM_VECTOR_LEN2 = arg.length;
  return ptr;
}
var cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
  if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
    cachedUint32ArrayMemory0 = new Uint32Array(wasm2.memory.buffer);
  }
  return cachedUint32ArrayMemory0;
}
function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getUint32ArrayMemory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN2 = arg.length;
  return ptr;
}
function _assertClass2(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
function __wbg_adapter_26(arg0, arg1, arg2) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm2.__wbindgen_export_5(arg0, arg1, addHeapObject2(arg2));
}
function __wbg_adapter_29(arg0, arg1) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm2.__wbindgen_export_6(arg0, arg1);
}
function __wbg_adapter_32(arg0, arg1, arg2) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm2.__wbindgen_export_7(arg0, arg1, addHeapObject2(arg2));
}
function __wbg_adapter_340(arg0, arg1, arg2, arg3) {
  _assertNum(arg0);
  _assertNum(arg1);
  wasm2.__wbindgen_export_8(arg0, arg1, addHeapObject2(arg2), addHeapObject2(arg3));
}
var __wbindgen_enum_CanvasWindingRule = ["nonzero", "evenodd"];
var CreateSessionOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_createsessionoptions_free(ptr >>> 0, 1));
var CreateSessionOptions = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    CreateSessionOptionsFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_createsessionoptions_free(ptr, 0);
  }
  constructor() {
    const ret = wasm2.createsessionoptions_new();
    this.__wbg_ptr = ret >>> 0;
    CreateSessionOptionsFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * @param {string} format
   */
  set format(format) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passStringToWasm02(format, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
    const len0 = WASM_VECTOR_LEN2;
    wasm2.createsessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @param {Uint8Array} artifact_content
   */
  set artifact_content(artifact_content) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ptr0 = passArray8ToWasm02(artifact_content, wasm2.__wbindgen_export_1);
    const len0 = WASM_VECTOR_LEN2;
    wasm2.createsessionoptions_set_artifact_content(this.__wbg_ptr, ptr0, len0);
  }
};
var IncrDomDocClientFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_incrdomdocclient_free(ptr >>> 0, 1));
var IncrDomDocClient = class _IncrDomDocClient {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_IncrDomDocClient.prototype);
    obj.__wbg_ptr = ptr;
    IncrDomDocClientFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    IncrDomDocClientFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_incrdomdocclient_free(ptr, 0);
  }
  /**
   * @param {any} functions
   */
  bind_functions(functions) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    wasm2.incrdomdocclient_bind_functions(this.__wbg_ptr, addHeapObject2(functions));
  }
  /**
   * Relayout the document in the given window.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @returns {Promise<boolean>}
   */
  relayout(x, y, w, h) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.incrdomdocclient_relayout(this.__wbg_ptr, x, y, w, h);
    return takeObject2(ret);
  }
  /**
   * @param {number} page_num
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} stage
   * @returns {boolean}
   */
  need_repaint(page_num, x, y, w, h, stage) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertNum(page_num);
      _assertNum(stage);
      wasm2.incrdomdocclient_need_repaint(retptr, this.__wbg_ptr, page_num, x, y, w, h, stage);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject2(r1);
      }
      return r0 !== 0;
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {number} page_num
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} stage
   * @returns {any}
   */
  repaint(page_num, x, y, w, h, stage) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertNum(page_num);
      _assertNum(stage);
      wasm2.incrdomdocclient_repaint(retptr, this.__wbg_ptr, page_num, x, y, w, h, stage);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject2(r1);
      }
      return takeObject2(r0);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
var PageInfoFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_pageinfo_free(ptr >>> 0, 1));
var PageInfo = class _PageInfo {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_PageInfo.prototype);
    obj.__wbg_ptr = ptr;
    PageInfoFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    PageInfoFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_pageinfo_free(ptr, 0);
  }
  /**
   * @returns {number}
   */
  get page_off() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.pageinfo_page_off(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  get width_pt() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.pageinfo_width_pt(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {number}
   */
  get height_pt() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.pageinfo_height_pt(this.__wbg_ptr);
    return ret;
  }
};
var PagesInfoFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_pagesinfo_free(ptr >>> 0, 1));
var PagesInfo = class _PagesInfo {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_PagesInfo.prototype);
    obj.__wbg_ptr = ptr;
    PagesInfoFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    PagesInfoFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_pagesinfo_free(ptr, 0);
  }
  /**
   * @returns {number}
   */
  get page_count() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.pagesinfo_page_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} num
   * @returns {PageInfo | undefined}
   */
  page_by_number(num) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertNum(num);
    const ret = wasm2.pagesinfo_page_by_number(this.__wbg_ptr, num);
    return ret === 0 ? void 0 : PageInfo.__wrap(ret);
  }
  /**
   * @param {number} i
   * @returns {PageInfo}
   */
  page(i) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertNum(i);
    const ret = wasm2.pagesinfo_page(this.__wbg_ptr, i);
    return PageInfo.__wrap(ret);
  }
  /**
   * @returns {number}
   */
  width() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.pagesinfo_width(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {number}
   */
  height() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.pagesinfo_height(this.__wbg_ptr);
    return ret;
  }
};
var RenderPageImageOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_renderpageimageoptions_free(ptr >>> 0, 1));
var RenderPageImageOptions = class _RenderPageImageOptions {
  static __unwrap(jsValue) {
    if (!(jsValue instanceof _RenderPageImageOptions)) {
      return 0;
    }
    return jsValue.__destroy_into_raw();
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RenderPageImageOptionsFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_renderpageimageoptions_free(ptr, 0);
  }
  constructor() {
    const ret = wasm2.renderpageimageoptions_new();
    this.__wbg_ptr = ret >>> 0;
    RenderPageImageOptionsFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * @returns {number | undefined}
   */
  get pixel_per_pt() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.renderpageimageoptions_pixel_per_pt(this.__wbg_ptr);
    return ret === 4294967297 ? void 0 : ret;
  }
  /**
   * @param {number | null} [pixel_per_pt]
   */
  set pixel_per_pt(pixel_per_pt) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    if (!isLikeNone2(pixel_per_pt)) {
      _assertNum(pixel_per_pt);
    }
    wasm2.renderpageimageoptions_set_pixel_per_pt(this.__wbg_ptr, isLikeNone2(pixel_per_pt) ? 4294967297 : Math.fround(pixel_per_pt));
  }
  /**
   * @returns {string | undefined}
   */
  get background_color() {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm2.renderpageimageoptions_background_color(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm02(r0, r1).slice();
        wasm2.__wbindgen_export_3(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string | null} [background_color]
   */
  set background_color(background_color) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    var ptr0 = isLikeNone2(background_color) ? 0 : passStringToWasm02(background_color, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
    var len0 = WASM_VECTOR_LEN2;
    wasm2.renderpageimageoptions_set_background_color(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {number}
   */
  get page_off() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.renderpageimageoptions_page_off(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} page_off
   */
  set page_off(page_off) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertNum(page_off);
    wasm2.renderpageimageoptions_set_page_off(this.__wbg_ptr, page_off);
  }
  /**
   * @returns {string | undefined}
   */
  get cache_key() {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm2.renderpageimageoptions_cache_key(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm02(r0, r1).slice();
        wasm2.__wbindgen_export_3(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string | null} [cache_key]
   */
  set cache_key(cache_key) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    var ptr0 = isLikeNone2(cache_key) ? 0 : passStringToWasm02(cache_key, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
    var len0 = WASM_VECTOR_LEN2;
    wasm2.renderpageimageoptions_set_cache_key(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {number | undefined}
   */
  get data_selection() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.renderpageimageoptions_data_selection(this.__wbg_ptr);
    return ret === 4294967297 ? void 0 : ret;
  }
  /**
   * @param {number | null} [data_selection]
   */
  set data_selection(data_selection) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    if (!isLikeNone2(data_selection)) {
      _assertNum(data_selection);
    }
    wasm2.renderpageimageoptions_set_data_selection(this.__wbg_ptr, isLikeNone2(data_selection) ? 4294967297 : data_selection >>> 0);
  }
};
var RenderSessionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_rendersession_free(ptr >>> 0, 1));
var RenderSession = class _RenderSession {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_RenderSession.prototype);
    obj.__wbg_ptr = ptr;
    RenderSessionFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    RenderSessionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_rendersession_free(ptr, 0);
  }
  /**
   * @returns {number | undefined}
   */
  get pixel_per_pt() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.rendersession_pixel_per_pt(this.__wbg_ptr);
    return ret === 4294967297 ? void 0 : ret;
  }
  /**
   * @param {number | null} [pixel_per_pt]
   */
  set pixel_per_pt(pixel_per_pt) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    if (!isLikeNone2(pixel_per_pt)) {
      _assertNum(pixel_per_pt);
    }
    wasm2.rendersession_set_pixel_per_pt(this.__wbg_ptr, isLikeNone2(pixel_per_pt) ? 4294967297 : Math.fround(pixel_per_pt));
  }
  /**
   * @returns {string | undefined}
   */
  get background_color() {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm2.rendersession_background_color(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      let v1;
      if (r0 !== 0) {
        v1 = getStringFromWasm02(r0, r1).slice();
        wasm2.__wbindgen_export_3(r0, r1 * 1, 1);
      }
      return v1;
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {string | null} [background_color]
   */
  set background_color(background_color) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    var ptr0 = isLikeNone2(background_color) ? 0 : passStringToWasm02(background_color, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
    var len0 = WASM_VECTOR_LEN2;
    wasm2.rendersession_set_background_color(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {PagesInfo}
   */
  get pages_info() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.rendersession_pages_info(this.__wbg_ptr);
    return PagesInfo.__wrap(ret);
  }
  /**
   * @returns {number}
   */
  get doc_width() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.rendersession_doc_width(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {number}
   */
  get doc_height() {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.rendersession_doc_height(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {Uint32Array} path
   * @returns {string | undefined}
   */
  source_span(path) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      const ptr0 = passArray32ToWasm0(path, wasm2.__wbindgen_export_1);
      const len0 = WASM_VECTOR_LEN2;
      wasm2.rendersession_source_span(retptr, this.__wbg_ptr, ptr0, len0);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory02().getInt32(retptr + 4 * 3, true);
      if (r3) {
        throw takeObject2(r2);
      }
      let v2;
      if (r0 !== 0) {
        v2 = getStringFromWasm02(r0, r1).slice();
        wasm2.__wbindgen_export_3(r0, r1 * 1, 1);
      }
      return v2;
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {number} rect_lo_x
   * @param {number} rect_lo_y
   * @param {number} rect_hi_x
   * @param {number} rect_hi_y
   * @returns {string}
   */
  render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm2.rendersession_render_in_window(retptr, this.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm02(r0, r1);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
      wasm2.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
    }
  }
};
var RenderSessionOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_rendersessionoptions_free(ptr >>> 0, 1));
var TypstRendererFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstrenderer_free(ptr >>> 0, 1));
var TypstRenderer = class _TypstRenderer {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_TypstRenderer.prototype);
    obj.__wbg_ptr = ptr;
    TypstRendererFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    TypstRendererFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_typstrenderer_free(ptr, 0);
  }
  /**
   * @param {any} _w
   * @returns {Promise<TypstWorker>}
   */
  create_worker(_w) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    const ret = wasm2.typstrenderer_create_worker(this.__wbg_ptr, addHeapObject2(_w));
    return takeObject2(ret);
  }
  /**
   * @returns {WorkerBridge}
   */
  create_worker_bridge() {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const ptr = this.__destroy_into_raw();
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(ptr);
      wasm2.typstrenderer_create_worker_bridge(retptr, ptr);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject2(r1);
      }
      return WorkerBridge.__wrap(r0);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {RenderSession} ses
   * @param {HTMLElement} elem
   * @returns {Promise<IncrDomDocClient>}
   */
  mount_dom(ses, elem) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertClass2(ses, RenderSession);
    if (ses.__wbg_ptr === 0) {
      throw new Error("Attempt to use a moved value");
    }
    const ret = wasm2.typstrenderer_mount_dom(this.__wbg_ptr, ses.__wbg_ptr, addHeapObject2(elem));
    return takeObject2(ret);
  }
  /**
   * @param {any} _v
   */
  load_glyph_pack(_v) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      wasm2.typstrenderer_load_glyph_pack(retptr, this.__wbg_ptr, addHeapObject2(_v));
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject2(r0);
      }
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {RenderSession} ses
   * @param {any} canvas
   * @param {RenderPageImageOptions | null} [options]
   * @returns {Promise<any>}
   */
  render_page_to_canvas(ses, canvas, options) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertClass2(ses, RenderSession);
    if (ses.__wbg_ptr === 0) {
      throw new Error("Attempt to use a moved value");
    }
    let ptr0 = 0;
    if (!isLikeNone2(options)) {
      _assertClass2(options, RenderPageImageOptions);
      if (options.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      ptr0 = options.__destroy_into_raw();
    }
    const ret = wasm2.typstrenderer_render_page_to_canvas(this.__wbg_ptr, ses.__wbg_ptr, addHeapObject2(canvas), ptr0);
    return takeObject2(ret);
  }
  /**
   * @param {RenderSession} session
   * @param {number} rect_lo_x
   * @param {number} rect_lo_y
   * @param {number} rect_hi_x
   * @param {number} rect_hi_y
   * @returns {string}
   */
  render_svg_diff(session, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
    let deferred1_0;
    let deferred1_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass2(session, RenderSession);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      wasm2.typstrenderer_render_svg_diff(retptr, this.__wbg_ptr, session.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm02(r0, r1);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
      wasm2.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {RenderSession} session
   * @param {number | null} [parts]
   * @returns {string}
   */
  svg_data(session, parts) {
    let deferred2_0;
    let deferred2_1;
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass2(session, RenderSession);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      if (!isLikeNone2(parts)) {
        _assertNum(parts);
      }
      wasm2.typstrenderer_svg_data(retptr, this.__wbg_ptr, session.__wbg_ptr, isLikeNone2(parts) ? 4294967297 : parts >>> 0);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory02().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject2(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm02(ptr1, len1);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
      wasm2.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
    }
  }
  /**
   * @param {RenderSession} session
   * @returns {Array<any> | undefined}
   */
  get_customs(session) {
    if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
    _assertNum(this.__wbg_ptr);
    _assertClass2(session, RenderSession);
    if (session.__wbg_ptr === 0) {
      throw new Error("Attempt to use a moved value");
    }
    const ret = wasm2.typstrenderer_get_customs(this.__wbg_ptr, session.__wbg_ptr);
    return takeObject2(ret);
  }
  /**
   * @param {RenderSession} session
   * @param {HTMLElement} root
   * @returns {boolean}
   */
  render_svg(session, root) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass2(session, RenderSession);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      wasm2.typstrenderer_render_svg(retptr, this.__wbg_ptr, session.__wbg_ptr, addHeapObject2(root));
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject2(r1);
      }
      return r0 !== 0;
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  constructor() {
    const ret = wasm2.typstrenderer_new();
    this.__wbg_ptr = ret >>> 0;
    TypstRendererFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * @param {CreateSessionOptions | null} [options]
   * @returns {RenderSession}
   */
  create_session(options) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      let ptr0 = 0;
      if (!isLikeNone2(options)) {
        _assertClass2(options, CreateSessionOptions);
        if (options.__wbg_ptr === 0) {
          throw new Error("Attempt to use a moved value");
        }
        ptr0 = options.__destroy_into_raw();
      }
      wasm2.typstrenderer_create_session(retptr, this.__wbg_ptr, ptr0);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject2(r1);
      }
      return RenderSession.__wrap(r0);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {RenderSession} session
   */
  reset(session) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass2(session, RenderSession);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      wasm2.typstrenderer_reset(retptr, this.__wbg_ptr, session.__wbg_ptr);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject2(r0);
      }
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {RenderSession} session
   * @param {string} action
   * @param {Uint8Array} data
   */
  manipulate_data(session, action, data) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      _assertClass2(session, RenderSession);
      if (session.__wbg_ptr === 0) {
        throw new Error("Attempt to use a moved value");
      }
      const ptr0 = passStringToWasm02(action, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len0 = WASM_VECTOR_LEN2;
      const ptr1 = passArray8ToWasm02(data, wasm2.__wbindgen_export_1);
      const len1 = WASM_VECTOR_LEN2;
      wasm2.typstrenderer_manipulate_data(retptr, this.__wbg_ptr, session.__wbg_ptr, ptr0, len0, ptr1, len1);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject2(r0);
      }
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {Uint8Array} artifact_content
   * @param {string} decoder
   * @returns {RenderSession}
   */
  session_from_artifact(artifact_content, decoder) {
    try {
      if (this.__wbg_ptr == 0) throw new Error("Attempt to use a moved value");
      const retptr = wasm2.__wbindgen_add_to_stack_pointer(-16);
      _assertNum(this.__wbg_ptr);
      const ptr0 = passArray8ToWasm02(artifact_content, wasm2.__wbindgen_export_1);
      const len0 = WASM_VECTOR_LEN2;
      const ptr1 = passStringToWasm02(decoder, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN2;
      wasm2.typstrenderer_session_from_artifact(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
      var r0 = getDataViewMemory02().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory02().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory02().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject2(r1);
      }
      return RenderSession.__wrap(r0);
    } finally {
      wasm2.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
var TypstRendererBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstrendererbuilder_free(ptr >>> 0, 1));
var TypstWorkerFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_typstworker_free(ptr >>> 0, 1));
var WorkerBridgeFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm2.__wbg_workerbridge_free(ptr >>> 0, 1));
var WorkerBridge = class _WorkerBridge {
  constructor() {
    throw new Error("cannot invoke `new` directly");
  }
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_WorkerBridge.prototype);
    obj.__wbg_ptr = ptr;
    WorkerBridgeFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    WorkerBridgeFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm2.__wbg_workerbridge_free(ptr, 0);
  }
};
async function __wbg_load2(module2, imports) {
  if (typeof Response === "function" && module2 instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module2, imports);
      } catch (e) {
        if (module2.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module2.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module2, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module: module2 };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports2() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_appendChild_8204974b7328bf98 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg0).appendChild(getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_buffer_609cc3eee51ed158 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).buffer;
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_672a4d21634d4a24 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg0).call(getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).call(getObject2(arg1), getObject2(arg2));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_833bed5770ea2041 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      const ret = getObject2(arg0).call(getObject2(arg1), getObject2(arg2), getObject2(arg3));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_b8adc8b1d0a0d8eb = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4) {
      const ret = getObject2(arg0).call(getObject2(arg1), getObject2(arg2), getObject2(arg3), getObject2(arg4));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_clearRect_8e4ba7ea0e06711a = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject2(arg0).clearRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbg_clientWidth_ce67a04dc15fce39 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).clientWidth;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_clip_8e8cfb00a055cd03 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).clip(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_clip_f584e320f8a2b022 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).clip(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_cloneNode_e35b333b87d51340 = function() {
    return handleError2(function(arg0) {
      const ret = getObject2(arg0).cloneNode();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_content_537e4105afcd9cee = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).content;
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createElement_8c9931a732ee2fea = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).createElement(getStringFromWasm02(arg1, arg2));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createImageBitmap_705010fb21a22922 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg0).createImageBitmap(getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createImageBitmap_b814e27800576bdb = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg0).createImageBitmap(getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createObjectURL_6e98d2f9c7bd9764 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = URL.createObjectURL(getObject2(arg1));
      const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN2;
      getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_document_d249400bd7bd996d = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).document;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_0915f348c5d54848 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_16485aae76d89dbf = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_468585e3ecfa189a = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_472a4d5b6df3739a = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_473e6602e24e18aa = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_86fd8465c00c7bc6 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_drawImage_ff273710b96c85cc = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4, arg5) {
      getObject2(arg0).drawImage(getObject2(arg1), arg2, arg3, arg4, arg5);
    }, arguments);
  };
  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function() {
    return logError(function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm02(arg0, arg1));
      } finally {
        wasm2.__wbindgen_export_3(deferred0_0, deferred0_1, 1);
      }
    }, arguments);
  };
  imports.wbg.__wbg_fillRect_b1529535ac758d4c = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject2(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbg_fillRect_c38d5d56492a2368 = function() {
    return logError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject2(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments);
  };
  imports.wbg.__wbg_fill_51814702df845abd = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).fill(getObject2(arg1), __wbindgen_enum_CanvasWindingRule[arg2]);
    }, arguments);
  };
  imports.wbg.__wbg_fill_5d26765e6d1d8f6b = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).fill(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_fill_64902335a40baa8d = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).fill(getObject2(arg1), __wbindgen_enum_CanvasWindingRule[arg2]);
    }, arguments);
  };
  imports.wbg.__wbg_fill_cbb22e6ac4da5b1b = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).fill(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_firstElementChild_21331181ca115bcc = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).firstElementChild;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_firstElementChild_d75d385f5abd1414 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).firstElementChild;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_getAttribute_ea5166be2deba45e = function() {
    return logError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject2(arg1).getAttribute(getStringFromWasm02(arg2, arg3));
      var ptr1 = isLikeNone2(ret) ? 0 : passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN2;
      getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_getContext_e9cf379449413580 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).getContext(getStringFromWasm02(arg1, arg2));
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_getContext_f65a0debd1e8f8e8 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).getContext(getStringFromWasm02(arg1, arg2));
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_get_67b2ba62fc30de12 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = Reflect.get(getObject2(arg0), getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_globalCompositeOperation_154b0f30008caa5e = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg1).globalCompositeOperation;
      const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN2;
      getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_globalCompositeOperation_1f405e2ef7c5118b = function() {
    return handleError2(function(arg0, arg1) {
      const ret = getObject2(arg1).globalCompositeOperation;
      const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN2;
      getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_height_d3f39e12f0f62121 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).height;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_incrdomdocclient_new = function() {
    return logError(function(arg0) {
      const ret = IncrDomDocClient.__wrap(arg0);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_CanvasRenderingContext2d_df82a4d3437bf1cc = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof CanvasRenderingContext2D;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_Element_0af65443936d5154 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof Element;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlCanvasElement_2ea67072a7624ac5 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof HTMLCanvasElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlDivElement_dbc6eb62eb772174 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof HTMLDivElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlElement_51378c201250b16c = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof HTMLElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_HtmlTemplateElement_7929a67c77198607 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof HTMLTemplateElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_ImageBitmap_d093d508663e313d = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof ImageBitmap;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_OffscreenCanvasRenderingContext2d_a070fdde7ba760a3 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof OffscreenCanvasRenderingContext2D;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_OffscreenCanvas_d55760945f91bf51 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof OffscreenCanvas;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_Promise_935168b8f4b49db3 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof Promise;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_SvgGraphicsElement_8b2cbd8116680c53 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof SVGGraphicsElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_SvgsvgElement_6a0d878e0d0f979c = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof SVGSVGElement;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_Window_def73ea0955fc569 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof Window;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_WorkerGlobalScope_dbdbdea7e3b56493 = function() {
    return logError(function(arg0) {
      let result;
      try {
        result = getObject2(arg0) instanceof WorkerGlobalScope;
      } catch (_) {
        result = false;
      }
      const ret = result;
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_lastElementChild_1269b660ec3e6985 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).lastElementChild;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_length_a446193dc22c12f8 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).length;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_log_1ae1e9f741096e91 = function() {
    return logError(function(arg0, arg1) {
      console.log(getObject2(arg0), getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_log_c222819a41e063d3 = function() {
    return logError(function(arg0) {
      console.log(getObject2(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_measureText_f0f078704231c37f = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).measureText(getStringFromWasm02(arg1, arg2));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_23a2665fac83c611 = function() {
    return logError(function(arg0, arg1) {
      try {
        var state0 = { a: arg0, b: arg1 };
        var cb0 = (arg02, arg12) => {
          const a = state0.a;
          state0.a = 0;
          try {
            return __wbg_adapter_340(a, state0.b, arg02, arg12);
          } finally {
            state0.a = a;
          }
        };
        const ret = new Promise(cb0);
        return addHeapObject2(ret);
      } finally {
        state0.a = state0.b = 0;
      }
    }, arguments);
  };
  imports.wbg.__wbg_new_2ef971087cb43792 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_405e22f390576ce2 = function() {
    return logError(function() {
      const ret = new Object();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_6377da097a44ce6e = function() {
    return handleError2(function() {
      const ret = new Image();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_78feb108b6472713 = function() {
    return logError(function() {
      const ret = new Array();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    return logError(function() {
      const ret = new Error();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_a12002a7f91c75be = function() {
    return logError(function(arg0) {
      const ret = new Uint8Array(getObject2(arg0));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_c68d7209be747379 = function() {
    return logError(function(arg0, arg1) {
      const ret = new Error(getStringFromWasm02(arg0, arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function() {
    return logError(function(arg0, arg1) {
      const ret = new Function(getStringFromWasm02(arg0, arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = new Uint8Array(getObject2(arg0), arg1 >>> 0, arg2 >>> 0);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function() {
    return logError(function(arg0) {
      const ret = new Uint8Array(arg0 >>> 0);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithpathstring_e9586ab3affcd4fd = function() {
    return handleError2(function(arg0, arg1) {
      const ret = new Path2D(getStringFromWasm02(arg0, arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithu8arraysequenceandoptions_068570c487f69127 = function() {
    return handleError2(function(arg0, arg1) {
      const ret = new Blob(getObject2(arg0), getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_nextElementSibling_8472709bec4de113 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).nextElementSibling;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_push_737cfc8c1432c2c6 = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject2(arg0).push(getObject2(arg1));
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_putImageData_4c5aa10f3b3e4924 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      getObject2(arg0).putImageData(getObject2(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_putImageData_6d5d5ef6ee83898b = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      getObject2(arg0).putImageData(getObject2(arg1), arg2, arg3);
    }, arguments);
  };
  imports.wbg.__wbg_queueMicrotask_97d92b4fcc8a61c5 = function() {
    return logError(function(arg0) {
      queueMicrotask(getObject2(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_queueMicrotask_d3219def82552485 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).queueMicrotask;
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_removeProperty_0e85471f4dfc00ae = function() {
    return handleError2(function(arg0, arg1, arg2, arg3) {
      const ret = getObject2(arg1).removeProperty(getStringFromWasm02(arg2, arg3));
      const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN2;
      getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_remove_e2d2659f3128c045 = function() {
    return logError(function(arg0) {
      getObject2(arg0).remove();
    }, arguments);
  };
  imports.wbg.__wbg_renderpageimageoptions_unwrap = function() {
    return logError(function(arg0) {
      const ret = RenderPageImageOptions.__unwrap(takeObject2(arg0));
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_replaceWith_9ce9927e3141d0f6 = function() {
    return handleError2(function(arg0, arg1) {
      getObject2(arg0).replaceWith(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_resolve_4851785c9c5f573d = function() {
    return logError(function(arg0) {
      const ret = Promise.resolve(getObject2(arg0));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_restore_1ef50af0835a4649 = function() {
    return logError(function(arg0) {
      getObject2(arg0).restore();
    }, arguments);
  };
  imports.wbg.__wbg_restore_cc5ae2746f7b5043 = function() {
    return logError(function(arg0) {
      getObject2(arg0).restore();
    }, arguments);
  };
  imports.wbg.__wbg_revokeObjectURL_27267efebeb457c7 = function() {
    return handleError2(function(arg0, arg1) {
      URL.revokeObjectURL(getStringFromWasm02(arg0, arg1));
    }, arguments);
  };
  imports.wbg.__wbg_save_5f563096e64939da = function() {
    return logError(function(arg0) {
      getObject2(arg0).save();
    }, arguments);
  };
  imports.wbg.__wbg_save_c675a7a4bbd44e4a = function() {
    return logError(function(arg0) {
      getObject2(arg0).save();
    }, arguments);
  };
  imports.wbg.__wbg_setAttribute_2704501201f15687 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4) {
      getObject2(arg0).setAttribute(getStringFromWasm02(arg1, arg2), getStringFromWasm02(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_setLineDash_0e3f3e194352a774 = function() {
    return handleError2(function(arg0, arg1) {
      getObject2(arg0).setLineDash(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setLineDash_325e094206df53e9 = function() {
    return handleError2(function(arg0, arg1) {
      getObject2(arg0).setLineDash(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setProperty_f2cf326652b9a713 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4) {
      getObject2(arg0).setProperty(getStringFromWasm02(arg1, arg2), getStringFromWasm02(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_setTransform_8c4d954cafb34b75 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      getObject2(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments);
  };
  imports.wbg.__wbg_setTransform_da2f0baec3f09522 = function() {
    return handleError2(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      getObject2(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments);
  };
  imports.wbg.__wbg_set_37837023f3d740e8 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0)[arg1 >>> 0] = takeObject2(arg2);
    }, arguments);
  };
  imports.wbg.__wbg_set_65595bdd868b3009 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).set(getObject2(arg1), arg2 >>> 0);
    }, arguments);
  };
  imports.wbg.__wbg_set_bb8cecf6a62b9f46 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      const ret = Reflect.set(getObject2(arg0), getObject2(arg1), getObject2(arg2));
      _assertBoolean(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_setfillStyle_2205fca942c641ba = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).fillStyle = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setfillStyle_cb059a69ce15cc28 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).fillStyle = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setfont_4c3584ef2f5c9f7e = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).font = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setglobalCompositeOperation_9a7a92bac2fb7ffd = function() {
    return handleError2(function(arg0, arg1, arg2) {
      getObject2(arg0).globalCompositeOperation = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setglobalCompositeOperation_b000e874f8f4a9d3 = function() {
    return handleError2(function(arg0, arg1, arg2) {
      getObject2(arg0).globalCompositeOperation = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setheight_da683a33fa99843c = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).height = arg1 >>> 0;
    }, arguments);
  };
  imports.wbg.__wbg_setinnerHTML_31bde41f835786f7 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).innerHTML = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setlineCap_3a3987ad3f03b31d = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).lineCap = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setlineCap_52b6d742c95a5630 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).lineCap = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setlineDashOffset_030d80d07cd52ee4 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).lineDashOffset = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setlineDashOffset_59f274962f6a0553 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).lineDashOffset = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setlineJoin_79ca64e7e9efaff7 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).lineJoin = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setlineJoin_7e005d90ef83d627 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).lineJoin = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setlineWidth_3c8b7156949a9f4b = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).lineWidth = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setlineWidth_ec730c524f09baa9 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).lineWidth = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setmiterLimit_26162c359bb28eb2 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).miterLimit = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setmiterLimit_9ffca64ec692501d = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).miterLimit = arg1;
    }, arguments);
  };
  imports.wbg.__wbg_setonerror_e94ca1221abc457f = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).onerror = getObject2(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_setonload_264a0d330b7166fb = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).onload = getObject2(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_setsrc_c239193cc7ab0470 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).src = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setstrokeStyle_070920f27992b9a6 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).strokeStyle = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setstrokeStyle_415833f3f0eb5076 = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).strokeStyle = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_settype_39ed370d3edd403c = function() {
    return logError(function(arg0, arg1, arg2) {
      getObject2(arg0).type = getStringFromWasm02(arg1, arg2);
    }, arguments);
  };
  imports.wbg.__wbg_setwidth_c5fed9f5e7f0b406 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).width = arg1 >>> 0;
    }, arguments);
  };
  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject2(arg1).stack;
      const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN2;
      getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
    return logError(function() {
      const ret = typeof global === "undefined" ? null : global;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
    return logError(function() {
      const ret = typeof globalThis === "undefined" ? null : globalThis;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
    return logError(function() {
      const ret = typeof self === "undefined" ? null : self;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
    return logError(function() {
      const ret = typeof window === "undefined" ? null : window;
      return isLikeNone2(ret) ? 0 : addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_stringify_f7ed6987935b4a24 = function() {
    return handleError2(function(arg0) {
      const ret = JSON.stringify(getObject2(arg0));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_stroke_1b0348380fb5a54b = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).stroke(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_stroke_e9b15e77122a9be9 = function() {
    return logError(function(arg0, arg1) {
      getObject2(arg0).stroke(getObject2(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_style_fb30c14e5815805c = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).style;
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_44b73946d2fb3e7d = function() {
    return logError(function(arg0, arg1) {
      const ret = getObject2(arg0).then(getObject2(arg1));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_48b406749878a531 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = getObject2(arg0).then(getObject2(arg1), getObject2(arg2));
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_transferToImageBitmap_4b1cc41c0f7e5de5 = function() {
    return handleError2(function(arg0) {
      const ret = getObject2(arg0).transferToImageBitmap();
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_typstrenderer_new = function() {
    return logError(function(arg0) {
      const ret = TypstRenderer.__wrap(arg0);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbg_warn_4ca3906c248c47c4 = function() {
    return logError(function(arg0) {
      console.warn(getObject2(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_width_2fafd30484634e26 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).width;
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_width_4f334fc47ef03de1 = function() {
    return logError(function(arg0) {
      const ret = getObject2(arg0).width;
      _assertNum(ret);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbindgen_cb_drop = function(arg0) {
    const obj = takeObject2(arg0).original;
    if (obj.cnt-- == 1) {
      obj.a = 0;
      return true;
    }
    const ret = false;
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbindgen_closure_wrapper1054 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = makeMutClosure2(arg0, arg1, 480, __wbg_adapter_32);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_closure_wrapper986 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = makeClosure(arg0, arg1, 448, __wbg_adapter_26);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_closure_wrapper987 = function() {
    return logError(function(arg0, arg1, arg2) {
      const ret = makeClosure(arg0, arg1, 448, __wbg_adapter_29);
      return addHeapObject2(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
    const ret = debugString2(getObject2(arg1));
    const ptr1 = passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN2;
    getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_is_function = function(arg0) {
    const ret = typeof getObject2(arg0) === "function";
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbindgen_is_undefined = function(arg0) {
    const ret = getObject2(arg0) === void 0;
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbindgen_jsval_eq = function(arg0, arg1) {
    const ret = getObject2(arg0) === getObject2(arg1);
    _assertBoolean(ret);
    return ret;
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm2.memory;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_number_new = function(arg0) {
    const ret = arg0;
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject2(arg0);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject2(arg0);
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = getObject2(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone2(ret) ? 0 : passStringToWasm02(ret, wasm2.__wbindgen_export_1, wasm2.__wbindgen_export_2);
    var len1 = WASM_VECTOR_LEN2;
    getDataViewMemory02().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory02().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm02(arg0, arg1);
    return addHeapObject2(ret);
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm02(arg0, arg1));
  };
  return imports;
}
function __wbg_init_memory2(imports, memory) {
}
function __wbg_finalize_init2(instance, module2) {
  wasm2 = instance.exports;
  __wbg_init2.__wbindgen_wasm_module = module2;
  cachedDataViewMemory02 = null;
  cachedUint32ArrayMemory0 = null;
  cachedUint8ArrayMemory02 = null;
  return wasm2;
}
async function __wbg_init2(module_or_path) {
  if (wasm2 !== void 0) return wasm2;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = importWasmModule2("typst_ts_renderer_bg.wasm", import_meta2.url);
  }
  const imports = __wbg_get_imports2();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  __wbg_init_memory2(imports);
  const { instance, module: module2 } = await __wbg_load2(await module_or_path, imports);
  return __wbg_finalize_init2(instance, module2);
}
var typst_ts_renderer_default = __wbg_init2;
var importWasmModule2 = async function(wasm_name, url) {
  throw new Error("Cannot import wasm module without importer: " + wasm_name + " " + url);
};

// src/compiler/engine.ts
var DEFAULT_PRELUDE = "#set page(width: auto, height: auto, margin: 1em)\n";
var PRELUDE_LINES = 1;
var MAIN_PATH = "/main.typ";
var STRUCTURED_DIAGNOSTICS = 3;
function sourceLine(diagnostic) {
  if (diagnostic.path !== MAIN_PATH || !diagnostic.range) return void 0;
  const line = Number(diagnostic.range.split(":")[0]) + 1 - PRELUDE_LINES;
  return Number.isInteger(line) && line >= 1 ? line : void 0;
}
function formatDiagnostics(diagnostics) {
  if (typeof diagnostics === "string" && diagnostics.trim()) return diagnostics.trim();
  if (!Array.isArray(diagnostics) || !diagnostics.length) return "\u7F16\u8BD1\u5931\u8D25";
  return diagnostics.slice(0, 3).map((item) => {
    const diagnostic = item;
    const line = sourceLine(diagnostic);
    const hints = (diagnostic.hints ?? []).join("\uFF1B");
    return [
      line ? `\u7B2C ${line} \u884C\uFF1A${diagnostic.message ?? ""}` : diagnostic.message,
      hints ? `\u63D0\u793A\uFF1A${hints}` : ""
    ].filter(Boolean).join(" ");
  }).join("\n");
}
var TypstEngine = class _TypstEngine {
  constructor(compiler, renderer) {
    this.compiler = compiler;
    this.renderer = renderer;
  }
  static async create(options = {}) {
    const { compilerWasm: compilerWasm2, rendererWasm: rendererWasm2, fonts } = await loadEngineResources({
      signal: options.signal,
      onProgress: options.onDownloadProgress
    });
    options.signal?.throwIfAborted();
    await Promise.all([
      typst_ts_web_compiler_default({ module_or_path: compilerWasm2 }),
      typst_ts_renderer_default({ module_or_path: rendererWasm2 })
    ]);
    options.signal?.throwIfAborted();
    const builder = new TypstCompilerBuilder();
    await builder.set_dummy_access_model();
    for (const font of fonts) await builder.add_raw_font(font);
    return new _TypstEngine(await builder.build(), new TypstRenderer());
  }
  /** 编译源码并返回自包含 SVG 字符串；signal 只在编译开始前生效（wasm 同步执行不可中断）。 */
  compile(source, signal, inputs = {}) {
    signal?.throwIfAborted();
    if (!source.trim()) throw new Error("\u6E90\u7801\u4E3A\u7A7A");
    const inputPairs = Object.entries(inputs);
    let output;
    try {
      this.compiler.add_source(MAIN_PATH, `${DEFAULT_PRELUDE}${source}`);
      output = this.compiler.compile(
        MAIN_PATH,
        inputPairs,
        "vector",
        STRUCTURED_DIAGNOSTICS
      );
    } catch (error) {
      throw new Error(`Typst \u7F16\u8BD1\u5931\u8D25\uFF1A${formatDiagnostics(error)}`);
    }
    const errors = (output?.diagnostics ?? []).filter((item) => item.severity !== "warning");
    if (errors.length) throw new Error(`Typst \u7F16\u8BD1\u5931\u8D25\uFF1A${formatDiagnostics(errors)}`);
    const artifact = output?.result;
    if (!artifact?.length) throw new Error("Typst \u7F16\u8BD1\u5931\u8D25\uFF1A\u672A\u4EA7\u751F\u6392\u7248\u7ED3\u679C");
    return this.renderer.svg_data(this.renderer.session_from_artifact(artifact, "vector"));
  }
};
var enginePromise = null;
var lastProgress = null;
function getTypstEngine(options = {}) {
  if (!enginePromise) {
    lastProgress = null;
    enginePromise = TypstEngine.create({
      signal: options.signal,
      onDownloadProgress: (progress) => {
        lastProgress = progress;
        options.onDownloadProgress?.(progress);
      }
    }).catch((error) => {
      enginePromise = null;
      lastProgress = null;
      throw error;
    });
  }
  return enginePromise;
}

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
  statusText,
  onCompiled
}) {
  const [html, setHtml] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)(null);
  const callback = (0, import_react3.useRef)(onCompiled);
  callback.current = onCompiled;
  const validCache = !!initialHtml && (!compiledFrom || compiledFrom === content);
  const reported = (0, import_plugins.useReportPreviewError)(error, { stale: !!html });
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
        className: "overflow-x-auto",
        style: { filter: isDark ? "invert(1) hue-rotate(180deg)" : void 0 },
        dangerouslySetInnerHTML: { __html: displayed }
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-ink-3", children: compile ? error ? "\u6682\u65E0\u53EF\u7528\u9884\u89C8\u3002" : statusText ?? "\u6B63\u5728\u7F16\u8BD1\u2026" : "\u6682\u65E0\u5DF2\u4FDD\u5B58\u9884\u89C8\u3002" }),
      !compile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: content }) })
    ] }),
    error && !reported && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "text-danger", children: error })
  ] });
}

// src/editor/TypstBlock.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function TypstBlock({
  attributes,
  element,
  children
}) {
  const { theme } = (0, import_plugins2.useSourceBlock)(element);
  const [statusText, setStatusText] = (0, import_react4.useState)();
  const compile = (0, import_react4.useMemo)(
    () => async (source, signal) => {
      setStatusText("\u6B63\u5728\u51C6\u5907 Typst \u7F16\u8BD1\u7EC4\u4EF6\u2026");
      const engine = await getTypstEngine({
        signal,
        onDownloadProgress: ({ loadedBytes, totalBytes }) => setStatusText(
          `\u6B63\u5728\u4E0B\u8F7D\u7F16\u8BD1\u7EC4\u4EF6\u4E0E\u5B57\u4F53\uFF08\u4EC5\u9996\u6B21\uFF0C\u7EA6 ${Math.round(totalBytes / 1024 / 1024)} MiB\uFF09\uFF1A${Math.floor(loadedBytes / totalBytes * 100)}%`
        )
      });
      setStatusText(void 0);
      return engine.compile(source, signal);
    },
    []
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { ...attributes, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_plugins2.SourceBlockEditor,
      {
        mode: "typst",
        title: "Typst",
        icon: FileType,
        field: "content",
        element,
        center: true,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          TypstPreview,
          {
            compile,
            content: element.content,
            initialHtml: element.compiledFrom === element.content ? element.html : void 0,
            compiledFrom: element.compiledFrom,
            isDark: theme.isDark,
            statusText
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
function embeddableSvg(svg) {
  const withoutScript = svg.replace(/<script[\s\S]*?<\/script>/g, "");
  return withoutScript.includes('<svg style="') ? withoutScript.replace('<svg style="', '<svg style="max-width:100%;height:auto;') : withoutScript.replace("<svg ", '<svg style="max-width:100%;height:auto" ');
}
function typstHtml(element) {
  const content = typeof element.content === "string" ? element.content : "";
  const cached = typeof element.html === "string" ? element.html : "";
  if (cached && (!element.compiledFrom || element.compiledFrom === content)) {
    const inner = cached.trimStart().startsWith("<svg") ? embeddableSvg(cached) : cached;
    return `<div class="typst-html">${inner}</div>`;
  }
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
      dataVersion: 1,
      collaboration: { textFields: ["content"] },
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

// src/index.tsx
var index_default = (0, import_plugins4.definePlugin)({
  ...define_PLUGIN_META_default,
  editorExtensions: [typstExtension],
  editorMetrics,
  editorCodecs: [typstCodec]
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
