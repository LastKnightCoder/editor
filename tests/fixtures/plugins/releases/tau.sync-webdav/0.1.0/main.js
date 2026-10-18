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
var define_PLUGIN_META_default = { id: "tau.sync-webdav", name: "WebDAV \u540C\u6B65\u5B58\u50A8", version: "0.1.0" };

// src/index.tsx
var import_react = require("react");
var import_plugins = require("@tau/plugins");
var import_ui = require("@tau/ui");

// node_modules/.pnpm/webdav@5.10.0/node_modules/webdav/dist/web/index.js
var t = { 2(t2) {
  function e2(t3, e3, i2) {
    t3 instanceof RegExp && (t3 = n2(t3, i2)), e3 instanceof RegExp && (e3 = n2(e3, i2));
    var s2 = r2(t3, e3, i2);
    return s2 && { start: s2[0], end: s2[1], pre: i2.slice(0, s2[0]), body: i2.slice(s2[0] + t3.length, s2[1]), post: i2.slice(s2[1] + e3.length) };
  }
  function n2(t3, e3) {
    var n3 = e3.match(t3);
    return n3 ? n3[0] : null;
  }
  function r2(t3, e3, n3) {
    var r3, i2, s2, o2, a2, h2 = n3.indexOf(t3), l2 = n3.indexOf(e3, h2 + 1), u2 = h2;
    if (h2 >= 0 && l2 > 0) {
      for (r3 = [], s2 = n3.length; u2 >= 0 && !a2; ) u2 == h2 ? (r3.push(u2), h2 = n3.indexOf(t3, u2 + 1)) : 1 == r3.length ? a2 = [r3.pop(), l2] : ((i2 = r3.pop()) < s2 && (s2 = i2, o2 = l2), l2 = n3.indexOf(e3, u2 + 1)), u2 = h2 < l2 && h2 >= 0 ? h2 : l2;
      r3.length && (a2 = [s2, o2]);
    }
    return a2;
  }
  t2.exports = e2, e2.range = r2;
}, 101(t2, e2, n2) {
  var r2;
  t2 = n2.nmd(t2), (function() {
    var i2 = (t2 && t2.exports, "object" == typeof global && global);
    i2.global !== i2 && i2.window;
    var s2 = function(t3) {
      this.message = t3;
    };
    (s2.prototype = new Error()).name = "InvalidCharacterError";
    var o2 = function(t3) {
      throw new s2(t3);
    }, a2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", h2 = /[\t\n\f\r ]/g, l2 = { encode: function(t3) {
      t3 = String(t3), /[^\0-\xFF]/.test(t3) && o2("The string to be encoded contains characters outside of the Latin1 range.");
      for (var e3, n3, r3, i3, s3 = t3.length % 3, h3 = "", l3 = -1, u2 = t3.length - s3; ++l3 < u2; ) e3 = t3.charCodeAt(l3) << 16, n3 = t3.charCodeAt(++l3) << 8, r3 = t3.charCodeAt(++l3), h3 += a2.charAt((i3 = e3 + n3 + r3) >> 18 & 63) + a2.charAt(i3 >> 12 & 63) + a2.charAt(i3 >> 6 & 63) + a2.charAt(63 & i3);
      return 2 == s3 ? (e3 = t3.charCodeAt(l3) << 8, n3 = t3.charCodeAt(++l3), h3 += a2.charAt((i3 = e3 + n3) >> 10) + a2.charAt(i3 >> 4 & 63) + a2.charAt(i3 << 2 & 63) + "=") : 1 == s3 && (i3 = t3.charCodeAt(l3), h3 += a2.charAt(i3 >> 2) + a2.charAt(i3 << 4 & 63) + "=="), h3;
    }, decode: function(t3) {
      var e3 = (t3 = String(t3).replace(h2, "")).length;
      e3 % 4 == 0 && (e3 = (t3 = t3.replace(/==?$/, "")).length), (e3 % 4 == 1 || /[^+a-zA-Z0-9/]/.test(t3)) && o2("Invalid character: the string to be decoded is not correctly encoded.");
      for (var n3, r3, i3 = 0, s3 = "", l3 = -1; ++l3 < e3; ) r3 = a2.indexOf(t3.charAt(l3)), n3 = i3 % 4 ? 64 * n3 + r3 : r3, i3++ % 4 && (s3 += String.fromCharCode(255 & n3 >> (-2 * i3 & 6)));
      return s3;
    }, version: "1.0.0" };
    void 0 === (r2 = function() {
      return l2;
    }.call(e2, n2, e2, t2)) || (t2.exports = r2);
  })();
}, 172(t2, e2) {
  e2.d = function(t3) {
    if (!t3) return 0;
    for (var e3 = (t3 = t3.toString()).length, n2 = t3.length; n2--; ) {
      var r2 = t3.charCodeAt(n2);
      56320 <= r2 && r2 <= 57343 && n2--, 127 < r2 && r2 <= 2047 ? e3++ : 2047 < r2 && r2 <= 65535 && (e3 += 2);
    }
    return e3;
  };
}, 526(t2) {
  var e2 = { utf8: { stringToBytes: function(t3) {
    return e2.bin.stringToBytes(unescape(encodeURIComponent(t3)));
  }, bytesToString: function(t3) {
    return decodeURIComponent(escape(e2.bin.bytesToString(t3)));
  } }, bin: { stringToBytes: function(t3) {
    for (var e3 = [], n2 = 0; n2 < t3.length; n2++) e3.push(255 & t3.charCodeAt(n2));
    return e3;
  }, bytesToString: function(t3) {
    for (var e3 = [], n2 = 0; n2 < t3.length; n2++) e3.push(String.fromCharCode(t3[n2]));
    return e3.join("");
  } } };
  t2.exports = e2;
}, 298(t2) {
  var e2, n2;
  e2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", n2 = { rotl: function(t3, e3) {
    return t3 << e3 | t3 >>> 32 - e3;
  }, rotr: function(t3, e3) {
    return t3 << 32 - e3 | t3 >>> e3;
  }, endian: function(t3) {
    if (t3.constructor == Number) return 16711935 & n2.rotl(t3, 8) | 4278255360 & n2.rotl(t3, 24);
    for (var e3 = 0; e3 < t3.length; e3++) t3[e3] = n2.endian(t3[e3]);
    return t3;
  }, randomBytes: function(t3) {
    for (var e3 = []; t3 > 0; t3--) e3.push(Math.floor(256 * Math.random()));
    return e3;
  }, bytesToWords: function(t3) {
    for (var e3 = [], n3 = 0, r2 = 0; n3 < t3.length; n3++, r2 += 8) e3[r2 >>> 5] |= t3[n3] << 24 - r2 % 32;
    return e3;
  }, wordsToBytes: function(t3) {
    for (var e3 = [], n3 = 0; n3 < 32 * t3.length; n3 += 8) e3.push(t3[n3 >>> 5] >>> 24 - n3 % 32 & 255);
    return e3;
  }, bytesToHex: function(t3) {
    for (var e3 = [], n3 = 0; n3 < t3.length; n3++) e3.push((t3[n3] >>> 4).toString(16)), e3.push((15 & t3[n3]).toString(16));
    return e3.join("");
  }, hexToBytes: function(t3) {
    for (var e3 = [], n3 = 0; n3 < t3.length; n3 += 2) e3.push(parseInt(t3.substr(n3, 2), 16));
    return e3;
  }, bytesToBase64: function(t3) {
    for (var n3 = [], r2 = 0; r2 < t3.length; r2 += 3) for (var i2 = t3[r2] << 16 | t3[r2 + 1] << 8 | t3[r2 + 2], s2 = 0; s2 < 4; s2++) 8 * r2 + 6 * s2 <= 8 * t3.length ? n3.push(e2.charAt(i2 >>> 6 * (3 - s2) & 63)) : n3.push("=");
    return n3.join("");
  }, base64ToBytes: function(t3) {
    t3 = t3.replace(/[^A-Z0-9+\/]/gi, "");
    for (var n3 = [], r2 = 0, i2 = 0; r2 < t3.length; i2 = ++r2 % 4) 0 != i2 && n3.push((e2.indexOf(t3.charAt(r2 - 1)) & Math.pow(2, -2 * i2 + 8) - 1) << 2 * i2 | e2.indexOf(t3.charAt(r2)) >>> 6 - 2 * i2);
    return n3;
  } }, t2.exports = n2;
}, 135(t2) {
  function e2(t3) {
    return !!t3.constructor && "function" == typeof t3.constructor.isBuffer && t3.constructor.isBuffer(t3);
  }
  t2.exports = function(t3) {
    return null != t3 && (e2(t3) || (function(t4) {
      return "function" == typeof t4.readFloatLE && "function" == typeof t4.slice && e2(t4.slice(0, 0));
    })(t3) || !!t3._isBuffer);
  };
}, 542(t2, e2, n2) {
  !(function() {
    var e3 = n2(298), r2 = n2(526).utf8, i2 = n2(135), s2 = n2(526).bin, o2 = function(t3, n3) {
      t3.constructor == String ? t3 = n3 && "binary" === n3.encoding ? s2.stringToBytes(t3) : r2.stringToBytes(t3) : i2(t3) ? t3 = Array.prototype.slice.call(t3, 0) : Array.isArray(t3) || t3.constructor === Uint8Array || (t3 = t3.toString());
      for (var a2 = e3.bytesToWords(t3), h2 = 8 * t3.length, l2 = 1732584193, u2 = -271733879, c2 = -1732584194, p2 = 271733878, f2 = 0; f2 < a2.length; f2++) a2[f2] = 16711935 & (a2[f2] << 8 | a2[f2] >>> 24) | 4278255360 & (a2[f2] << 24 | a2[f2] >>> 8);
      a2[h2 >>> 5] |= 128 << h2 % 32, a2[14 + (h2 + 64 >>> 9 << 4)] = h2;
      var d2 = o2._ff, g2 = o2._gg, m2 = o2._hh, y2 = o2._ii;
      for (f2 = 0; f2 < a2.length; f2 += 16) {
        var b2 = l2, v2 = u2, w2 = c2, x2 = p2;
        l2 = d2(l2, u2, c2, p2, a2[f2 + 0], 7, -680876936), p2 = d2(p2, l2, u2, c2, a2[f2 + 1], 12, -389564586), c2 = d2(c2, p2, l2, u2, a2[f2 + 2], 17, 606105819), u2 = d2(u2, c2, p2, l2, a2[f2 + 3], 22, -1044525330), l2 = d2(l2, u2, c2, p2, a2[f2 + 4], 7, -176418897), p2 = d2(p2, l2, u2, c2, a2[f2 + 5], 12, 1200080426), c2 = d2(c2, p2, l2, u2, a2[f2 + 6], 17, -1473231341), u2 = d2(u2, c2, p2, l2, a2[f2 + 7], 22, -45705983), l2 = d2(l2, u2, c2, p2, a2[f2 + 8], 7, 1770035416), p2 = d2(p2, l2, u2, c2, a2[f2 + 9], 12, -1958414417), c2 = d2(c2, p2, l2, u2, a2[f2 + 10], 17, -42063), u2 = d2(u2, c2, p2, l2, a2[f2 + 11], 22, -1990404162), l2 = d2(l2, u2, c2, p2, a2[f2 + 12], 7, 1804603682), p2 = d2(p2, l2, u2, c2, a2[f2 + 13], 12, -40341101), c2 = d2(c2, p2, l2, u2, a2[f2 + 14], 17, -1502002290), l2 = g2(l2, u2 = d2(u2, c2, p2, l2, a2[f2 + 15], 22, 1236535329), c2, p2, a2[f2 + 1], 5, -165796510), p2 = g2(p2, l2, u2, c2, a2[f2 + 6], 9, -1069501632), c2 = g2(c2, p2, l2, u2, a2[f2 + 11], 14, 643717713), u2 = g2(u2, c2, p2, l2, a2[f2 + 0], 20, -373897302), l2 = g2(l2, u2, c2, p2, a2[f2 + 5], 5, -701558691), p2 = g2(p2, l2, u2, c2, a2[f2 + 10], 9, 38016083), c2 = g2(c2, p2, l2, u2, a2[f2 + 15], 14, -660478335), u2 = g2(u2, c2, p2, l2, a2[f2 + 4], 20, -405537848), l2 = g2(l2, u2, c2, p2, a2[f2 + 9], 5, 568446438), p2 = g2(p2, l2, u2, c2, a2[f2 + 14], 9, -1019803690), c2 = g2(c2, p2, l2, u2, a2[f2 + 3], 14, -187363961), u2 = g2(u2, c2, p2, l2, a2[f2 + 8], 20, 1163531501), l2 = g2(l2, u2, c2, p2, a2[f2 + 13], 5, -1444681467), p2 = g2(p2, l2, u2, c2, a2[f2 + 2], 9, -51403784), c2 = g2(c2, p2, l2, u2, a2[f2 + 7], 14, 1735328473), l2 = m2(l2, u2 = g2(u2, c2, p2, l2, a2[f2 + 12], 20, -1926607734), c2, p2, a2[f2 + 5], 4, -378558), p2 = m2(p2, l2, u2, c2, a2[f2 + 8], 11, -2022574463), c2 = m2(c2, p2, l2, u2, a2[f2 + 11], 16, 1839030562), u2 = m2(u2, c2, p2, l2, a2[f2 + 14], 23, -35309556), l2 = m2(l2, u2, c2, p2, a2[f2 + 1], 4, -1530992060), p2 = m2(p2, l2, u2, c2, a2[f2 + 4], 11, 1272893353), c2 = m2(c2, p2, l2, u2, a2[f2 + 7], 16, -155497632), u2 = m2(u2, c2, p2, l2, a2[f2 + 10], 23, -1094730640), l2 = m2(l2, u2, c2, p2, a2[f2 + 13], 4, 681279174), p2 = m2(p2, l2, u2, c2, a2[f2 + 0], 11, -358537222), c2 = m2(c2, p2, l2, u2, a2[f2 + 3], 16, -722521979), u2 = m2(u2, c2, p2, l2, a2[f2 + 6], 23, 76029189), l2 = m2(l2, u2, c2, p2, a2[f2 + 9], 4, -640364487), p2 = m2(p2, l2, u2, c2, a2[f2 + 12], 11, -421815835), c2 = m2(c2, p2, l2, u2, a2[f2 + 15], 16, 530742520), l2 = y2(l2, u2 = m2(u2, c2, p2, l2, a2[f2 + 2], 23, -995338651), c2, p2, a2[f2 + 0], 6, -198630844), p2 = y2(p2, l2, u2, c2, a2[f2 + 7], 10, 1126891415), c2 = y2(c2, p2, l2, u2, a2[f2 + 14], 15, -1416354905), u2 = y2(u2, c2, p2, l2, a2[f2 + 5], 21, -57434055), l2 = y2(l2, u2, c2, p2, a2[f2 + 12], 6, 1700485571), p2 = y2(p2, l2, u2, c2, a2[f2 + 3], 10, -1894986606), c2 = y2(c2, p2, l2, u2, a2[f2 + 10], 15, -1051523), u2 = y2(u2, c2, p2, l2, a2[f2 + 1], 21, -2054922799), l2 = y2(l2, u2, c2, p2, a2[f2 + 8], 6, 1873313359), p2 = y2(p2, l2, u2, c2, a2[f2 + 15], 10, -30611744), c2 = y2(c2, p2, l2, u2, a2[f2 + 6], 15, -1560198380), u2 = y2(u2, c2, p2, l2, a2[f2 + 13], 21, 1309151649), l2 = y2(l2, u2, c2, p2, a2[f2 + 4], 6, -145523070), p2 = y2(p2, l2, u2, c2, a2[f2 + 11], 10, -1120210379), c2 = y2(c2, p2, l2, u2, a2[f2 + 2], 15, 718787259), u2 = y2(u2, c2, p2, l2, a2[f2 + 9], 21, -343485551), l2 = l2 + b2 >>> 0, u2 = u2 + v2 >>> 0, c2 = c2 + w2 >>> 0, p2 = p2 + x2 >>> 0;
      }
      return e3.endian([l2, u2, c2, p2]);
    };
    o2._ff = function(t3, e4, n3, r3, i3, s3, o3) {
      var a2 = t3 + (e4 & n3 | ~e4 & r3) + (i3 >>> 0) + o3;
      return (a2 << s3 | a2 >>> 32 - s3) + e4;
    }, o2._gg = function(t3, e4, n3, r3, i3, s3, o3) {
      var a2 = t3 + (e4 & r3 | n3 & ~r3) + (i3 >>> 0) + o3;
      return (a2 << s3 | a2 >>> 32 - s3) + e4;
    }, o2._hh = function(t3, e4, n3, r3, i3, s3, o3) {
      var a2 = t3 + (e4 ^ n3 ^ r3) + (i3 >>> 0) + o3;
      return (a2 << s3 | a2 >>> 32 - s3) + e4;
    }, o2._ii = function(t3, e4, n3, r3, i3, s3, o3) {
      var a2 = t3 + (n3 ^ (e4 | ~r3)) + (i3 >>> 0) + o3;
      return (a2 << s3 | a2 >>> 32 - s3) + e4;
    }, o2._blocksize = 16, o2._digestsize = 16, t2.exports = function(t3, n3) {
      if (null == t3) throw new Error("Illegal argument " + t3);
      var r3 = e3.wordsToBytes(o2(t3, n3));
      return n3 && n3.asBytes ? r3 : n3 && n3.asString ? s2.bytesToString(r3) : e3.bytesToHex(r3);
    };
  })();
}, 285(t2, e2, n2) {
  var r2 = n2(2);
  t2.exports = function(t3, e3) {
    if (!t3) return [];
    var n3 = null == (e3 = e3 || {}).max ? 1 / 0 : e3.max;
    return "{}" === t3.substr(0, 2) && (t3 = "\\{\\}" + t3.substr(2)), m2((function(t4) {
      return t4.split("\\\\").join(i2).split("\\{").join(s2).split("\\}").join(o2).split("\\,").join(a2).split("\\.").join(h2);
    })(t3), n3, true).map(u2);
  };
  var i2 = "\0SLASH" + Math.random() + "\0", s2 = "\0OPEN" + Math.random() + "\0", o2 = "\0CLOSE" + Math.random() + "\0", a2 = "\0COMMA" + Math.random() + "\0", h2 = "\0PERIOD" + Math.random() + "\0";
  function l2(t3) {
    return parseInt(t3, 10) == t3 ? parseInt(t3, 10) : t3.charCodeAt(0);
  }
  function u2(t3) {
    return t3.split(i2).join("\\").split(s2).join("{").split(o2).join("}").split(a2).join(",").split(h2).join(".");
  }
  function c2(t3) {
    if (!t3) return [""];
    var e3 = [], n3 = r2("{", "}", t3);
    if (!n3) return t3.split(",");
    var i3 = n3.pre, s3 = n3.body, o3 = n3.post, a3 = i3.split(",");
    a3[a3.length - 1] += "{" + s3 + "}";
    var h3 = c2(o3);
    return o3.length && (a3[a3.length - 1] += h3.shift(), a3.push.apply(a3, h3)), e3.push.apply(e3, a3), e3;
  }
  function p2(t3) {
    return "{" + t3 + "}";
  }
  function f2(t3) {
    return /^-?0\d/.test(t3);
  }
  function d2(t3, e3) {
    return t3 <= e3;
  }
  function g2(t3, e3) {
    return t3 >= e3;
  }
  function m2(t3, e3, n3) {
    var i3 = [], s3 = r2("{", "}", t3);
    if (!s3) return [t3];
    var a3 = s3.pre, h3 = s3.post.length ? m2(s3.post, e3, false) : [""];
    if (/\$$/.test(s3.pre)) for (var u3 = 0; u3 < h3.length && u3 < e3; u3++) {
      var y2 = a3 + "{" + s3.body + "}" + h3[u3];
      i3.push(y2);
    }
    else {
      var b2, v2, w2 = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(s3.body), x2 = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(s3.body), N2 = w2 || x2, E2 = s3.body.indexOf(",") >= 0;
      if (!N2 && !E2) return s3.post.match(/,(?!,).*\}/) ? m2(t3 = s3.pre + "{" + s3.body + o2 + s3.post, e3, true) : [t3];
      if (N2) b2 = s3.body.split(/\.\./);
      else if (1 === (b2 = c2(s3.body)).length && 1 === (b2 = m2(b2[0], e3, false).map(p2)).length) return h3.map((function(t4) {
        return s3.pre + b2[0] + t4;
      }));
      if (N2) {
        var A2 = l2(b2[0]), S2 = l2(b2[1]), P2 = Math.max(b2[0].length, b2[1].length), T2 = 3 == b2.length ? Math.max(Math.abs(l2(b2[2])), 1) : 1, O2 = d2;
        S2 < A2 && (T2 *= -1, O2 = g2);
        var C2 = b2.some(f2);
        v2 = [];
        for (var _2 = A2; O2(_2, S2); _2 += T2) {
          var $2;
          if (x2) "\\" === ($2 = String.fromCharCode(_2)) && ($2 = "");
          else if ($2 = String(_2), C2) {
            var j2 = P2 - $2.length;
            if (j2 > 0) {
              var I2 = new Array(j2 + 1).join("0");
              $2 = _2 < 0 ? "-" + I2 + $2.slice(1) : I2 + $2;
            }
          }
          v2.push($2);
        }
      } else {
        v2 = [];
        for (var M2 = 0; M2 < b2.length; M2++) v2.push.apply(v2, m2(b2[M2], e3, false));
      }
      for (M2 = 0; M2 < v2.length; M2++) for (u3 = 0; u3 < h3.length && i3.length < e3; u3++) y2 = a3 + v2[M2] + h3[u3], (!n3 || N2 || y2) && i3.push(y2);
    }
    return i3;
  }
}, 829(t2) {
  function e2(t3) {
    return e2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(t4) {
      return typeof t4;
    } : function(t4) {
      return t4 && "function" == typeof Symbol && t4.constructor === Symbol && t4 !== Symbol.prototype ? "symbol" : typeof t4;
    }, e2(t3);
  }
  function n2(t3) {
    var e3 = "function" == typeof Map ? /* @__PURE__ */ new Map() : void 0;
    return n2 = function(t4) {
      if (null === t4 || (n3 = t4, -1 === Function.toString.call(n3).indexOf("[native code]"))) return t4;
      var n3;
      if ("function" != typeof t4) throw new TypeError("Super expression must either be null or a function");
      if (void 0 !== e3) {
        if (e3.has(t4)) return e3.get(t4);
        e3.set(t4, o3);
      }
      function o3() {
        return r2(t4, arguments, s2(this).constructor);
      }
      return o3.prototype = Object.create(t4.prototype, { constructor: { value: o3, enumerable: false, writable: true, configurable: true } }), i2(o3, t4);
    }, n2(t3);
  }
  function r2(t3, e3, n3) {
    return r2 = (function() {
      if ("undefined" == typeof Reflect || !Reflect.construct) return false;
      if (Reflect.construct.sham) return false;
      if ("function" == typeof Proxy) return true;
      try {
        return Date.prototype.toString.call(Reflect.construct(Date, [], (function() {
        }))), true;
      } catch (t4) {
        return false;
      }
    })() ? Reflect.construct : function(t4, e4, n4) {
      var r3 = [null];
      r3.push.apply(r3, e4);
      var s3 = new (Function.bind.apply(t4, r3))();
      return n4 && i2(s3, n4.prototype), s3;
    }, r2.apply(null, arguments);
  }
  function i2(t3, e3) {
    return i2 = Object.setPrototypeOf || function(t4, e4) {
      return t4.__proto__ = e4, t4;
    }, i2(t3, e3);
  }
  function s2(t3) {
    return s2 = Object.setPrototypeOf ? Object.getPrototypeOf : function(t4) {
      return t4.__proto__ || Object.getPrototypeOf(t4);
    }, s2(t3);
  }
  var o2 = (function(t3) {
    function n3(t4) {
      var r3;
      return (function(t5, e3) {
        if (!(t5 instanceof e3)) throw new TypeError("Cannot call a class as a function");
      })(this, n3), (r3 = (function(t5, n4) {
        return !n4 || "object" !== e2(n4) && "function" != typeof n4 ? (function(t6) {
          if (void 0 === t6) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
          return t6;
        })(t5) : n4;
      })(this, s2(n3).call(this, t4))).name = "ObjectPrototypeMutationError", r3;
    }
    return (function(t4, e3) {
      if ("function" != typeof e3 && null !== e3) throw new TypeError("Super expression must either be null or a function");
      t4.prototype = Object.create(e3 && e3.prototype, { constructor: { value: t4, writable: true, configurable: true } }), e3 && i2(t4, e3);
    })(n3, t3), n3;
  })(n2(Error));
  function a2(t3, n3) {
    for (var r3 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : function() {
    }, i3 = n3.split("."), s3 = i3.length, o3 = function(e3) {
      var n4 = i3[e3];
      if (!t3) return { v: void 0 };
      if ("+" === n4) {
        if (Array.isArray(t3)) return { v: t3.map((function(n5, s5) {
          var o4 = i3.slice(e3 + 1);
          return o4.length > 0 ? a2(n5, o4.join("."), r3) : r3(t3, s5, i3, e3);
        })) };
        var s4 = i3.slice(0, e3).join(".");
        throw new Error("Object at wildcard (".concat(s4, ") is not an array"));
      }
      t3 = r3(t3, n4, i3, e3);
    }, h3 = 0; h3 < s3; h3++) {
      var l2 = o3(h3);
      if ("object" === e2(l2)) return l2.v;
    }
    return t3;
  }
  function h2(t3, e3) {
    return t3.length === e3 + 1;
  }
  t2.exports = { set: function(t3, n3, r3) {
    if ("object" != e2(t3) || null === t3) return t3;
    if (void 0 === n3) return t3;
    if ("number" == typeof n3) return t3[n3] = r3, t3[n3];
    try {
      return a2(t3, n3, (function(t4, e3, n4, i3) {
        if (t4 === Reflect.getPrototypeOf({})) throw new o2("Attempting to mutate Object.prototype");
        if (!t4[e3]) {
          var s3 = Number.isInteger(Number(n4[i3 + 1])), a3 = "+" === n4[i3 + 1];
          t4[e3] = s3 || a3 ? [] : {};
        }
        return h2(n4, i3) && (t4[e3] = r3), t4[e3];
      }));
    } catch (e3) {
      if (e3 instanceof o2) throw e3;
      return t3;
    }
  }, get: function(t3, n3) {
    if ("object" != e2(t3) || null === t3) return t3;
    if (void 0 === n3) return t3;
    if ("number" == typeof n3) return t3[n3];
    try {
      return a2(t3, n3, (function(t4, e3) {
        return t4[e3];
      }));
    } catch (e3) {
      return t3;
    }
  }, has: function(t3, n3) {
    var r3 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
    if ("object" != e2(t3) || null === t3) return false;
    if (void 0 === n3) return false;
    if ("number" == typeof n3) return n3 in t3;
    try {
      var i3 = false;
      return a2(t3, n3, (function(t4, e3, n4, s3) {
        if (!h2(n4, s3)) return t4 && t4[e3];
        i3 = r3.own ? t4.hasOwnProperty(e3) : e3 in t4;
      })), i3;
    } catch (t4) {
      return false;
    }
  }, hasOwn: function(t3, e3, n3) {
    return this.has(t3, e3, n3 || { own: true });
  }, isIn: function(t3, n3, r3) {
    var i3 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
    if ("object" != e2(t3) || null === t3) return false;
    if (void 0 === n3) return false;
    try {
      var s3 = false, o3 = false;
      return a2(t3, n3, (function(t4, n4, i4, a3) {
        return s3 = s3 || t4 === r3 || !!t4 && t4[n4] === r3, o3 = h2(i4, a3) && "object" === e2(t4) && n4 in t4, t4 && t4[n4];
      })), i3.validPath ? s3 && o3 : s3;
    } catch (t4) {
      return false;
    }
  }, ObjectPrototypeMutationError: o2 };
}, 47(t2, e2, n2) {
  var r2 = n2(410), i2 = function(t3) {
    return "string" == typeof t3;
  };
  function s2(t3, e3) {
    for (var n3 = [], r3 = 0; r3 < t3.length; r3++) {
      var i3 = t3[r3];
      i3 && "." !== i3 && (".." === i3 ? n3.length && ".." !== n3[n3.length - 1] ? n3.pop() : e3 && n3.push("..") : n3.push(i3));
    }
    return n3;
  }
  var o2 = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/, a2 = {};
  function h2(t3) {
    return o2.exec(t3).slice(1);
  }
  a2.resolve = function() {
    for (var t3 = "", e3 = false, n3 = arguments.length - 1; n3 >= -1 && !e3; n3--) {
      var r3 = n3 >= 0 ? arguments[n3] : process.cwd();
      if (!i2(r3)) throw new TypeError("Arguments to path.resolve must be strings");
      r3 && (t3 = r3 + "/" + t3, e3 = "/" === r3.charAt(0));
    }
    return (e3 ? "/" : "") + (t3 = s2(t3.split("/"), !e3).join("/")) || ".";
  }, a2.normalize = function(t3) {
    var e3 = a2.isAbsolute(t3), n3 = "/" === t3.substr(-1);
    return (t3 = s2(t3.split("/"), !e3).join("/")) || e3 || (t3 = "."), t3 && n3 && (t3 += "/"), (e3 ? "/" : "") + t3;
  }, a2.isAbsolute = function(t3) {
    return "/" === t3.charAt(0);
  }, a2.join = function() {
    for (var t3 = "", e3 = 0; e3 < arguments.length; e3++) {
      var n3 = arguments[e3];
      if (!i2(n3)) throw new TypeError("Arguments to path.join must be strings");
      n3 && (t3 += t3 ? "/" + n3 : n3);
    }
    return a2.normalize(t3);
  }, a2.relative = function(t3, e3) {
    function n3(t4) {
      for (var e4 = 0; e4 < t4.length && "" === t4[e4]; e4++) ;
      for (var n4 = t4.length - 1; n4 >= 0 && "" === t4[n4]; n4--) ;
      return e4 > n4 ? [] : t4.slice(e4, n4 + 1);
    }
    t3 = a2.resolve(t3).substr(1), e3 = a2.resolve(e3).substr(1);
    for (var r3 = n3(t3.split("/")), i3 = n3(e3.split("/")), s3 = Math.min(r3.length, i3.length), o3 = s3, h3 = 0; h3 < s3; h3++) if (r3[h3] !== i3[h3]) {
      o3 = h3;
      break;
    }
    var l2 = [];
    for (h3 = o3; h3 < r3.length; h3++) l2.push("..");
    return (l2 = l2.concat(i3.slice(o3))).join("/");
  }, a2._makeLong = function(t3) {
    return t3;
  }, a2.dirname = function(t3) {
    var e3 = h2(t3), n3 = e3[0], r3 = e3[1];
    return n3 || r3 ? (r3 && (r3 = r3.substr(0, r3.length - 1)), n3 + r3) : ".";
  }, a2.basename = function(t3, e3) {
    var n3 = h2(t3)[2];
    return e3 && n3.substr(-1 * e3.length) === e3 && (n3 = n3.substr(0, n3.length - e3.length)), n3;
  }, a2.extname = function(t3) {
    return h2(t3)[3];
  }, a2.format = function(t3) {
    if (!r2.isObject(t3)) throw new TypeError("Parameter 'pathObject' must be an object, not " + typeof t3);
    var e3 = t3.root || "";
    if (!i2(e3)) throw new TypeError("'pathObject.root' must be a string or undefined, not " + typeof t3.root);
    return (t3.dir ? t3.dir + a2.sep : "") + (t3.base || "");
  }, a2.parse = function(t3) {
    if (!i2(t3)) throw new TypeError("Parameter 'pathString' must be a string, not " + typeof t3);
    var e3 = h2(t3);
    if (!e3 || 4 !== e3.length) throw new TypeError("Invalid path '" + t3 + "'");
    return e3[1] = e3[1] || "", e3[2] = e3[2] || "", e3[3] = e3[3] || "", { root: e3[0], dir: e3[0] + e3[1].slice(0, e3[1].length - 1), base: e3[2], ext: e3[3], name: e3[2].slice(0, e3[2].length - e3[3].length) };
  }, a2.sep = "/", a2.delimiter = ":", t2.exports = a2;
}, 647(t2, e2) {
  var n2 = Object.prototype.hasOwnProperty;
  function r2(t3) {
    try {
      return decodeURIComponent(t3.replace(/\+/g, " "));
    } catch (t4) {
      return null;
    }
  }
  function i2(t3) {
    try {
      return encodeURIComponent(t3);
    } catch (t4) {
      return null;
    }
  }
  e2.stringify = function(t3, e3) {
    e3 = e3 || "";
    var r3, s2, o2 = [];
    for (s2 in "string" != typeof e3 && (e3 = "?"), t3) if (n2.call(t3, s2)) {
      if ((r3 = t3[s2]) || null != r3 && !isNaN(r3) || (r3 = ""), s2 = i2(s2), r3 = i2(r3), null === s2 || null === r3) continue;
      o2.push(s2 + "=" + r3);
    }
    return o2.length ? e3 + o2.join("&") : "";
  }, e2.parse = function(t3) {
    for (var e3, n3 = /([^=?#&]+)=?([^&]*)/g, i3 = {}; e3 = n3.exec(t3); ) {
      var s2 = r2(e3[1]), o2 = r2(e3[2]);
      null === s2 || null === o2 || s2 in i3 || (i3[s2] = o2);
    }
    return i3;
  };
}, 670(t2) {
  t2.exports = function(t3, e2) {
    if (e2 = e2.split(":")[0], !(t3 = +t3)) return false;
    switch (e2) {
      case "http":
      case "ws":
        return 80 !== t3;
      case "https":
      case "wss":
        return 443 !== t3;
      case "ftp":
        return 21 !== t3;
      case "gopher":
        return 70 !== t3;
      case "file":
        return false;
    }
    return 0 !== t3;
  };
}, 737(t2, e2, n2) {
  var r2 = n2(670), i2 = n2(647), s2 = /^[\x00-\x20\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/, o2 = /[\n\r\t]/g, a2 = /^[A-Za-z][A-Za-z0-9+-.]*:\/\//, h2 = /:\d+$/, l2 = /^([a-z][a-z0-9.+-]*:)?(\/\/)?([\\/]+)?([\S\s]*)/i, u2 = /^[a-zA-Z]:/;
  function c2(t3) {
    return (t3 || "").toString().replace(s2, "");
  }
  var p2 = [["#", "hash"], ["?", "query"], function(t3, e3) {
    return g2(e3.protocol) ? t3.replace(/\\/g, "/") : t3;
  }, ["/", "pathname"], ["@", "auth", 1], [NaN, "host", void 0, 1, 1], [/:(\d*)$/, "port", void 0, 1], [NaN, "hostname", void 0, 1, 1]], f2 = { hash: 1, query: 1 };
  function d2(t3) {
    var e3, n3 = ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : {}).location || {}, r3 = {}, i3 = typeof (t3 = t3 || n3);
    if ("blob:" === t3.protocol) r3 = new y2(unescape(t3.pathname), {});
    else if ("string" === i3) for (e3 in r3 = new y2(t3, {}), f2) delete r3[e3];
    else if ("object" === i3) {
      for (e3 in t3) e3 in f2 || (r3[e3] = t3[e3]);
      void 0 === r3.slashes && (r3.slashes = a2.test(t3.href));
    }
    return r3;
  }
  function g2(t3) {
    return "file:" === t3 || "ftp:" === t3 || "http:" === t3 || "https:" === t3 || "ws:" === t3 || "wss:" === t3;
  }
  function m2(t3, e3) {
    t3 = (t3 = c2(t3)).replace(o2, ""), e3 = e3 || {};
    var n3, r3 = l2.exec(t3), i3 = r3[1] ? r3[1].toLowerCase() : "", s3 = !!r3[2], a3 = !!r3[3], h3 = 0;
    return s3 ? a3 ? (n3 = r3[2] + r3[3] + r3[4], h3 = r3[2].length + r3[3].length) : (n3 = r3[2] + r3[4], h3 = r3[2].length) : a3 ? (n3 = r3[3] + r3[4], h3 = r3[3].length) : n3 = r3[4], "file:" === i3 ? h3 >= 2 && (n3 = n3.slice(2)) : g2(i3) ? n3 = r3[4] : i3 ? s3 && (n3 = n3.slice(2)) : h3 >= 2 && g2(e3.protocol) && (n3 = r3[4]), { protocol: i3, slashes: s3 || g2(i3), slashesCount: h3, rest: n3 };
  }
  function y2(t3, e3, n3) {
    if (t3 = (t3 = c2(t3)).replace(o2, ""), !(this instanceof y2)) return new y2(t3, e3, n3);
    var s3, a3, h3, l3, f3, b2, v2 = p2.slice(), w2 = typeof e3, x2 = this, N2 = 0;
    for ("object" !== w2 && "string" !== w2 && (n3 = e3, e3 = null), n3 && "function" != typeof n3 && (n3 = i2.parse), s3 = !(a3 = m2(t3 || "", e3 = d2(e3))).protocol && !a3.slashes, x2.slashes = a3.slashes || s3 && e3.slashes, x2.protocol = a3.protocol || e3.protocol || "", t3 = a3.rest, ("file:" === a3.protocol && (2 !== a3.slashesCount || u2.test(t3)) || !a3.slashes && (a3.protocol || a3.slashesCount < 2 || !g2(x2.protocol))) && (v2[3] = [/(.*)/, "pathname"]); N2 < v2.length; N2++) "function" != typeof (l3 = v2[N2]) ? (h3 = l3[0], b2 = l3[1], h3 != h3 ? x2[b2] = t3 : "string" == typeof h3 ? ~(f3 = "@" === h3 ? t3.lastIndexOf(h3) : t3.indexOf(h3)) && ("number" == typeof l3[2] ? (x2[b2] = t3.slice(0, f3), t3 = t3.slice(f3 + l3[2])) : (x2[b2] = t3.slice(f3), t3 = t3.slice(0, f3))) : (f3 = h3.exec(t3)) && (x2[b2] = f3[1], t3 = t3.slice(0, f3.index)), x2[b2] = x2[b2] || s3 && l3[3] && e3[b2] || "", l3[4] && (x2[b2] = x2[b2].toLowerCase())) : t3 = l3(t3, x2);
    n3 && (x2.query = n3(x2.query)), s3 && e3.slashes && "/" !== x2.pathname.charAt(0) && ("" !== x2.pathname || "" !== e3.pathname) && (x2.pathname = (function(t4, e4) {
      if ("" === t4) return e4;
      for (var n4 = (e4 || "/").split("/").slice(0, -1).concat(t4.split("/")), r3 = n4.length, i3 = n4[r3 - 1], s4 = false, o3 = 0; r3--; ) "." === n4[r3] ? n4.splice(r3, 1) : ".." === n4[r3] ? (n4.splice(r3, 1), o3++) : o3 && (0 === r3 && (s4 = true), n4.splice(r3, 1), o3--);
      return s4 && n4.unshift(""), "." !== i3 && ".." !== i3 || n4.push(""), n4.join("/");
    })(x2.pathname, e3.pathname)), "/" !== x2.pathname.charAt(0) && g2(x2.protocol) && (x2.pathname = "/" + x2.pathname), r2(x2.port, x2.protocol) || (x2.host = x2.hostname, x2.port = ""), x2.username = x2.password = "", x2.auth && (~(f3 = x2.auth.indexOf(":")) ? (x2.username = x2.auth.slice(0, f3), x2.username = encodeURIComponent(decodeURIComponent(x2.username)), x2.password = x2.auth.slice(f3 + 1), x2.password = encodeURIComponent(decodeURIComponent(x2.password))) : x2.username = encodeURIComponent(decodeURIComponent(x2.auth)), x2.auth = x2.password ? x2.username + ":" + x2.password : x2.username), x2.origin = "file:" !== x2.protocol && g2(x2.protocol) && x2.host ? x2.protocol + "//" + x2.host : "null", x2.href = x2.toString();
  }
  y2.prototype = { set: function(t3, e3, n3) {
    var s3 = this;
    switch (t3) {
      case "query":
        "string" == typeof e3 && e3.length && (e3 = (n3 || i2.parse)(e3)), s3[t3] = e3;
        break;
      case "port":
        s3[t3] = e3, r2(e3, s3.protocol) ? e3 && (s3.host = s3.hostname + ":" + e3) : (s3.host = s3.hostname, s3[t3] = "");
        break;
      case "hostname":
        s3[t3] = e3, s3.port && (e3 += ":" + s3.port), s3.host = e3;
        break;
      case "host":
        s3[t3] = e3, h2.test(e3) ? (e3 = e3.split(":"), s3.port = e3.pop(), s3.hostname = e3.join(":")) : (s3.hostname = e3, s3.port = "");
        break;
      case "protocol":
        s3.protocol = e3.toLowerCase(), s3.slashes = !n3;
        break;
      case "pathname":
      case "hash":
        if (e3) {
          var o3 = "pathname" === t3 ? "/" : "#";
          s3[t3] = e3.charAt(0) !== o3 ? o3 + e3 : e3;
        } else s3[t3] = e3;
        break;
      case "username":
      case "password":
        s3[t3] = encodeURIComponent(e3);
        break;
      case "auth":
        var a3 = e3.indexOf(":");
        ~a3 ? (s3.username = e3.slice(0, a3), s3.username = encodeURIComponent(decodeURIComponent(s3.username)), s3.password = e3.slice(a3 + 1), s3.password = encodeURIComponent(decodeURIComponent(s3.password))) : s3.username = encodeURIComponent(decodeURIComponent(e3));
    }
    for (var l3 = 0; l3 < p2.length; l3++) {
      var u3 = p2[l3];
      u3[4] && (s3[u3[1]] = s3[u3[1]].toLowerCase());
    }
    return s3.auth = s3.password ? s3.username + ":" + s3.password : s3.username, s3.origin = "file:" !== s3.protocol && g2(s3.protocol) && s3.host ? s3.protocol + "//" + s3.host : "null", s3.href = s3.toString(), s3;
  }, toString: function(t3) {
    t3 && "function" == typeof t3 || (t3 = i2.stringify);
    var e3, n3 = this, r3 = n3.host, s3 = n3.protocol;
    s3 && ":" !== s3.charAt(s3.length - 1) && (s3 += ":");
    var o3 = s3 + (n3.protocol && n3.slashes || g2(n3.protocol) ? "//" : "");
    return n3.username ? (o3 += n3.username, n3.password && (o3 += ":" + n3.password), o3 += "@") : n3.password ? (o3 += ":" + n3.password, o3 += "@") : "file:" !== n3.protocol && g2(n3.protocol) && !r3 && "/" !== n3.pathname && (o3 += "@"), (":" === r3[r3.length - 1] || h2.test(n3.hostname) && !n3.port) && (r3 += ":"), o3 += r3 + n3.pathname, (e3 = "object" == typeof n3.query ? t3(n3.query) : n3.query) && (o3 += "?" !== e3.charAt(0) ? "?" + e3 : e3), n3.hash && (o3 += n3.hash), o3;
  } }, y2.extractProtocol = m2, y2.location = d2, y2.trimLeft = c2, y2.qs = i2, t2.exports = y2;
}, 410() {
}, 388() {
}, 805() {
}, 345() {
}, 800() {
} };
var e = {};
function n(r2) {
  var i2 = e[r2];
  if (void 0 !== i2) return i2.exports;
  var s2 = e[r2] = { id: r2, loaded: false, exports: {} };
  return t[r2].call(s2.exports, s2, s2.exports, n), s2.loaded = true, s2.exports;
}
n.n = (t2) => {
  var e2 = t2 && t2.__esModule ? () => t2.default : () => t2;
  return n.d(e2, { a: e2 }), e2;
}, n.d = (t2, e2) => {
  for (var r2 in e2) n.o(e2, r2) && !n.o(t2, r2) && Object.defineProperty(t2, r2, { enumerable: true, get: e2[r2] });
}, n.o = (t2, e2) => Object.prototype.hasOwnProperty.call(t2, e2), n.nmd = (t2) => (t2.paths = [], t2.children || (t2.children = []), t2);
var r = n(737);
var i = n.n(r);
function s(t2) {
  if (!o(t2)) throw new Error("Parameter was not an error");
}
function o(t2) {
  return !!t2 && "object" == typeof t2 && "[object Error]" === (e2 = t2, Object.prototype.toString.call(e2)) || t2 instanceof Error;
  var e2;
}
var a = class _a extends Error {
  constructor(t2, e2) {
    const n2 = [...arguments], { options: r2, shortMessage: i2 } = (function(t3) {
      let e3, n3 = "";
      if (0 === t3.length) e3 = {};
      else if (o(t3[0])) e3 = { cause: t3[0] }, n3 = t3.slice(1).join(" ") || "";
      else if (t3[0] && "object" == typeof t3[0]) e3 = Object.assign({}, t3[0]), n3 = t3.slice(1).join(" ") || "";
      else {
        if ("string" != typeof t3[0]) throw new Error("Invalid arguments passed to Layerr");
        e3 = {}, n3 = n3 = t3.join(" ") || "";
      }
      return { options: e3, shortMessage: n3 };
    })(n2);
    let s2 = i2;
    if (r2.cause && (s2 = `${s2}: ${r2.cause.message}`), super(s2), this.message = s2, r2.name && "string" == typeof r2.name ? this.name = r2.name : this.name = "Layerr", r2.cause && Object.defineProperty(this, "_cause", { value: r2.cause }), Object.defineProperty(this, "_info", { value: {} }), r2.info && "object" == typeof r2.info && Object.assign(this._info, r2.info), Error.captureStackTrace) {
      const t3 = r2.constructorOpt || this.constructor;
      Error.captureStackTrace(this, t3);
    }
  }
  static cause(t2) {
    return s(t2), t2._cause && o(t2._cause) ? t2._cause : null;
  }
  static fullStack(t2) {
    s(t2);
    const e2 = _a.cause(t2);
    return e2 ? `${t2.stack}
caused by: ${_a.fullStack(e2)}` : t2.stack ?? "";
  }
  static info(t2) {
    s(t2);
    const e2 = {}, n2 = _a.cause(t2);
    return n2 && Object.assign(e2, _a.info(n2)), t2._info && Object.assign(e2, t2._info), e2;
  }
  toString() {
    let t2 = this.name || this.constructor.name || this.constructor.prototype.name;
    return this.message && (t2 = `${t2}: ${this.message}`), t2;
  }
};
var h = n(47);
var l = n.n(h);
var u = "__PATH_SEPARATOR_POSIX__";
var c = "__PATH_SEPARATOR_WINDOWS__";
function p(t2) {
  try {
    const e2 = t2.replace(/\//g, u).replace(/\\\\/g, c);
    return encodeURIComponent(e2).split(c).join("\\\\").split(u).join("/");
  } catch (t3) {
    throw new a(t3, "Failed encoding path");
  }
}
function f(t2) {
  return t2.startsWith("/") ? t2 : "/" + t2;
}
function d(t2) {
  let e2 = t2;
  return "/" !== e2[0] && (e2 = "/" + e2), /^.+\/$/.test(e2) && (e2 = e2.substr(0, e2.length - 1)), e2;
}
function g(t2) {
  let e2 = new (i())(t2).pathname;
  return e2.length <= 0 && (e2 = "/"), d(e2);
}
function m() {
  for (var t2 = arguments.length, e2 = new Array(t2), n2 = 0; n2 < t2; n2++) e2[n2] = arguments[n2];
  return (function() {
    return (function(t3) {
      var e3 = [];
      if (0 === t3.length) return "";
      if ("string" != typeof t3[0]) throw new TypeError("Url must be a string. Received " + t3[0]);
      if (t3[0].match(/^[^/:]+:\/*$/) && t3.length > 1) {
        var n3 = t3.shift();
        t3[0] = n3 + t3[0];
      }
      t3[0].match(/^file:\/\/\//) ? t3[0] = t3[0].replace(/^([^/:]+):\/*/, "$1:///") : t3[0] = t3[0].replace(/^([^/:]+):\/*/, "$1://");
      for (var r2 = 0; r2 < t3.length; r2++) {
        var i2 = t3[r2];
        if ("string" != typeof i2) throw new TypeError("Url must be a string. Received " + i2);
        "" !== i2 && (r2 > 0 && (i2 = i2.replace(/^[\/]+/, "")), i2 = r2 < t3.length - 1 ? i2.replace(/[\/]+$/, "") : i2.replace(/[\/]+$/, "/"), e3.push(i2));
      }
      var s2 = e3.join("/"), o2 = (s2 = s2.replace(/\/(\?|&|#[^!])/g, "$1")).split("?");
      return o2.shift() + (o2.length > 0 ? "?" : "") + o2.join("&");
    })("object" == typeof arguments[0] ? arguments[0] : [].slice.call(arguments));
  })(e2.reduce(((t3, e3, n3) => ((0 === n3 || "/" !== e3 || "/" === e3 && "/" !== t3[t3.length - 1]) && t3.push(e3), t3)), []));
}
var y = n(542);
var b = n.n(y);
function v(t2, e2) {
  const n2 = t2.url.replace("//", ""), r2 = -1 == n2.indexOf("/") ? "/" : n2.slice(n2.indexOf("/")), i2 = t2.method ? t2.method.toUpperCase() : "GET", s2 = !!/(^|,)\s*auth\s*($|,)/.test(e2.qop) && "auth", o2 = `00000000${e2.nc}`.slice(-8), a2 = (function(t3, e3, n3, r3, i3, s3, o3) {
    const a3 = o3 || b()(`${e3}:${n3}:${r3}`);
    return t3 && "md5-sess" === t3.toLowerCase() ? b()(`${a3}:${i3}:${s3}`) : a3;
  })(e2.algorithm, e2.username, e2.realm, e2.password, e2.nonce, e2.cnonce, e2.ha1), h2 = b()(`${i2}:${r2}`), l2 = s2 ? b()(`${a2}:${e2.nonce}:${o2}:${e2.cnonce}:${s2}:${h2}`) : b()(`${a2}:${e2.nonce}:${h2}`), u2 = { username: e2.username, realm: e2.realm, nonce: e2.nonce, uri: r2, qop: s2, response: l2, nc: o2, cnonce: e2.cnonce, algorithm: e2.algorithm, opaque: e2.opaque }, c2 = [];
  for (const t3 in u2) u2[t3] && ("qop" === t3 || "nc" === t3 || "algorithm" === t3 ? c2.push(`${t3}=${u2[t3]}`) : c2.push(`${t3}="${u2[t3]}"`));
  return `Digest ${c2.join(", ")}`;
}
function w(t2) {
  return "digest" === (t2.headers && t2.headers.get("www-authenticate") || "").split(/\s/)[0].toLowerCase();
}
var x = n(101);
var N = n.n(x);
function E(t2) {
  return N().decode(t2);
}
function A(t2, e2) {
  var n2;
  return `Basic ${n2 = `${t2}:${e2}`, N().encode(n2)}`;
}
var S = "undefined" != typeof WorkerGlobalScope && self instanceof WorkerGlobalScope ? self : "undefined" != typeof window ? window : globalThis;
var P = S.fetch.bind(S);
var T = (S.Headers, S.Request);
var O = S.Response;
var C = (function(t2) {
  return t2.Auto = "auto", t2.Digest = "digest", t2.None = "none", t2.Password = "password", t2.Token = "token", t2;
})({});
var _ = (function(t2) {
  return t2.DataTypeNoLength = "data-type-no-length", t2.InvalidAuthType = "invalid-auth-type", t2.InvalidOutputFormat = "invalid-output-format", t2.LinkUnsupportedAuthType = "link-unsupported-auth", t2.InvalidUpdateRange = "invalid-update-range", t2.NotSupported = "not-supported", t2;
})({});
function $(t2, e2, n2, r2, i2) {
  switch (t2.authType) {
    case C.Auto:
      e2 && n2 && (t2.headers.Authorization = A(e2, n2));
      break;
    case C.Digest:
      t2.digest = /* @__PURE__ */ (function(t3, e3, n3) {
        return { username: t3, password: e3, ha1: n3, nc: 0, algorithm: "md5", hasDigestAuth: false };
      })(e2, n2, i2);
      break;
    case C.None:
      break;
    case C.Password:
      t2.headers.Authorization = A(e2, n2);
      break;
    case C.Token:
      t2.headers.Authorization = `${(s2 = r2).token_type} ${s2.access_token}`;
      break;
    default:
      throw new a({ info: { code: _.InvalidAuthType } }, `Invalid auth type: ${t2.authType}`);
  }
  var s2;
}
n(345), n(800);
var j = "@@HOTPATCHER";
var I = () => {
};
function M(t2) {
  return { original: t2, methods: [t2], final: false };
}
var R = class {
  constructor() {
    this._configuration = { registry: {}, getEmptyAction: "null" }, this.__type__ = j;
  }
  get configuration() {
    return this._configuration;
  }
  get getEmptyAction() {
    return this.configuration.getEmptyAction;
  }
  set getEmptyAction(t2) {
    this.configuration.getEmptyAction = t2;
  }
  control(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
    if (!t2 || t2.__type__ !== j) throw new Error("Failed taking control of target HotPatcher instance: Invalid type or object");
    return Object.keys(t2.configuration.registry).forEach(((n2) => {
      this.configuration.registry.hasOwnProperty(n2) ? e2 && (this.configuration.registry[n2] = Object.assign({}, t2.configuration.registry[n2])) : this.configuration.registry[n2] = Object.assign({}, t2.configuration.registry[n2]);
    })), t2._configuration = this.configuration, this;
  }
  execute(t2) {
    const e2 = this.get(t2) || I;
    for (var n2 = arguments.length, r2 = new Array(n2 > 1 ? n2 - 1 : 0), i2 = 1; i2 < n2; i2++) r2[i2 - 1] = arguments[i2];
    return e2(...r2);
  }
  get(t2) {
    const e2 = this.configuration.registry[t2];
    if (!e2) switch (this.getEmptyAction) {
      case "null":
        return null;
      case "throw":
        throw new Error(`Failed handling method request: No method provided for override: ${t2}`);
      default:
        throw new Error(`Failed handling request which resulted in an empty method: Invalid empty-action specified: ${this.getEmptyAction}`);
    }
    return (function() {
      for (var t3 = arguments.length, e3 = new Array(t3), n2 = 0; n2 < t3; n2++) e3[n2] = arguments[n2];
      if (0 === e3.length) throw new Error("Failed creating sequence: No functions provided");
      return function() {
        for (var t4 = arguments.length, n3 = new Array(t4), r2 = 0; r2 < t4; r2++) n3[r2] = arguments[r2];
        let i2 = n3;
        const s2 = this;
        for (; e3.length > 0; ) i2 = [e3.shift().apply(s2, i2)];
        return i2[0];
      };
    })(...e2.methods);
  }
  isPatched(t2) {
    return !!this.configuration.registry[t2];
  }
  patch(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
    const { chain: r2 = false } = n2;
    if (this.configuration.registry[t2] && this.configuration.registry[t2].final) throw new Error(`Failed patching '${t2}': Method marked as being final`);
    if ("function" != typeof e2) throw new Error(`Failed patching '${t2}': Provided method is not a function`);
    if (r2) this.configuration.registry[t2] ? this.configuration.registry[t2].methods.push(e2) : this.configuration.registry[t2] = M(e2);
    else if (this.isPatched(t2)) {
      const { original: n3 } = this.configuration.registry[t2];
      this.configuration.registry[t2] = Object.assign(M(e2), { original: n3 });
    } else this.configuration.registry[t2] = M(e2);
    return this;
  }
  patchInline(t2, e2) {
    this.isPatched(t2) || this.patch(t2, e2);
    for (var n2 = arguments.length, r2 = new Array(n2 > 2 ? n2 - 2 : 0), i2 = 2; i2 < n2; i2++) r2[i2 - 2] = arguments[i2];
    return this.execute(t2, ...r2);
  }
  plugin(t2) {
    for (var e2 = arguments.length, n2 = new Array(e2 > 1 ? e2 - 1 : 0), r2 = 1; r2 < e2; r2++) n2[r2 - 1] = arguments[r2];
    return n2.forEach(((e3) => {
      this.patch(t2, e3, { chain: true });
    })), this;
  }
  restore(t2) {
    if (!this.isPatched(t2)) throw new Error(`Failed restoring method: No method present for key: ${t2}`);
    if ("function" != typeof this.configuration.registry[t2].original) throw new Error(`Failed restoring method: Original method not found or of invalid type for key: ${t2}`);
    return this.configuration.registry[t2].methods = [this.configuration.registry[t2].original], this;
  }
  setFinal(t2) {
    if (!this.configuration.registry.hasOwnProperty(t2)) throw new Error(`Failed marking '${t2}' as final: No method found for key`);
    return this.configuration.registry[t2].final = true, this;
  }
};
var k = null;
function L() {
  return k || (k = new R()), k;
}
function D(t2) {
  return (function(t3) {
    if ("object" != typeof t3 || null === t3 || "[object Object]" != Object.prototype.toString.call(t3)) return false;
    if (null === Object.getPrototypeOf(t3)) return true;
    let e2 = t3;
    for (; null !== Object.getPrototypeOf(e2); ) e2 = Object.getPrototypeOf(e2);
    return Object.getPrototypeOf(t3) === e2;
  })(t2) ? Object.assign({}, t2) : Object.setPrototypeOf(Object.assign({}, t2), Object.getPrototypeOf(t2));
}
function U() {
  for (var t2 = arguments.length, e2 = new Array(t2), n2 = 0; n2 < t2; n2++) e2[n2] = arguments[n2];
  let r2 = null, i2 = [...e2];
  for (; i2.length > 0; ) {
    const t3 = i2.shift();
    r2 = r2 ? F(r2, t3) : D(t3);
  }
  return r2;
}
function F(t2, e2) {
  const n2 = D(t2);
  return Object.keys(e2).forEach(((t3) => {
    n2.hasOwnProperty(t3) ? Array.isArray(e2[t3]) ? n2[t3] = Array.isArray(n2[t3]) ? [...n2[t3], ...e2[t3]] : [...e2[t3]] : "object" == typeof e2[t3] && e2[t3] ? n2[t3] = "object" == typeof n2[t3] && n2[t3] ? F(n2[t3], e2[t3]) : D(e2[t3]) : n2[t3] = e2[t3] : n2[t3] = e2[t3];
  })), n2;
}
function V(t2) {
  const e2 = {};
  for (const n2 of t2.keys()) e2[n2] = t2.get(n2);
  return e2;
}
function W() {
  for (var t2 = arguments.length, e2 = new Array(t2), n2 = 0; n2 < t2; n2++) e2[n2] = arguments[n2];
  if (0 === e2.length) return {};
  const r2 = {};
  return e2.reduce(((t3, e3) => (Object.keys(e3).forEach(((n3) => {
    const i2 = n3.toLowerCase();
    r2.hasOwnProperty(i2) ? t3[r2[i2]] = e3[n3] : (r2[i2] = n3, t3[n3] = e3[n3]);
  })), t3)), {});
}
n(805);
var B = "function" == typeof ArrayBuffer;
var { toString: G } = Object.prototype;
function z(t2) {
  return B && (t2 instanceof ArrayBuffer || "[object ArrayBuffer]" === G.call(t2));
}
function q(t2) {
  return null != t2 && null != t2.constructor && "function" == typeof t2.constructor.isBuffer && t2.constructor.isBuffer(t2);
}
function H(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
}
function Y(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var X = H((function(t2) {
  const e2 = t2._digest;
  return delete t2._digest, e2.hasDigestAuth && (t2 = U(t2, { headers: { Authorization: v(t2, e2) } })), Y(Q(t2), (function(n2) {
    let r2 = false;
    return i2 = function(t3) {
      return r2 ? t3 : n2;
    }, (s2 = (function() {
      if (401 == n2.status) return e2.hasDigestAuth = (function(t3, e3) {
        if (!w(t3)) return false;
        const n3 = /([a-z0-9_-]+)=(?:"([^"]+)"|([a-z0-9_-]+))/gi;
        for (; ; ) {
          const r3 = t3.headers && t3.headers.get("www-authenticate") || "", i3 = n3.exec(r3);
          if (!i3) break;
          e3[i3[1]] = i3[2] || i3[3];
        }
        return e3.nc += 1, e3.cnonce = (function() {
          let t4 = "";
          for (let e4 = 0; e4 < 32; ++e4) t4 = `${t4}${"abcdef0123456789"[Math.floor(16 * Math.random())]}`;
          return t4;
        })(), true;
      })(n2, e2), (function() {
        if (e2.hasDigestAuth) return Y(Q(t2 = U(t2, { headers: { Authorization: v(t2, e2) } })), (function(t3) {
          return 401 == t3.status ? e2.hasDigestAuth = false : e2.nc++, r2 = true, t3;
        }));
      })();
      e2.nc++;
    })()) && s2.then ? s2.then(i2) : i2(s2);
    var i2, s2;
  }));
}));
var Z = H((function(t2, e2) {
  return Y(Q(t2), (function(n2) {
    return n2.ok ? (e2.authType = C.Password, n2) : 401 == n2.status && w(n2) ? (e2.authType = C.Digest, $(e2, e2.username, e2.password, void 0, void 0), t2._digest = e2.digest, X(t2)) : n2;
  }));
}));
var J = H((function(t2, e2) {
  return e2.authType === C.Auto ? Z(t2, e2) : t2._digest ? X(t2) : Q(t2);
}));
function K(t2, e2, n2) {
  const r2 = D(t2);
  return r2.headers = W(e2.headers, r2.headers || {}, n2.headers || {}), void 0 !== n2.data && (r2.data = n2.data), n2.signal && (r2.signal = n2.signal), e2.httpAgent && (r2.httpAgent = e2.httpAgent), e2.httpsAgent && (r2.httpsAgent = e2.httpsAgent), e2.digest && (r2._digest = e2.digest), "boolean" == typeof e2.withCredentials && (r2.withCredentials = e2.withCredentials), r2;
}
function Q(t2) {
  const e2 = L();
  return e2.patchInline("request", ((t3) => e2.patchInline("fetch", P, t3.url, (function(t4) {
    let e3 = {};
    const n2 = { method: t4.method };
    if (t4.headers && (e3 = W(e3, t4.headers)), void 0 !== t4.data) {
      const [r2, i2] = (function(t5) {
        if ("string" == typeof t5) return [t5, {}];
        if (q(t5)) return [t5, {}];
        if (z(t5)) return [t5, {}];
        if (t5 && "object" == typeof t5) return [JSON.stringify(t5), { "content-type": "application/json" }];
        throw new Error("Unable to convert request body: Unexpected body type: " + typeof t5);
      })(t4.data);
      n2.body = r2, e3 = W(e3, i2);
    }
    return t4.signal && (n2.signal = t4.signal), t4.withCredentials && (n2.credentials = "include"), n2.headers = e3, n2;
  })(t3))), t2);
}
var tt = n(285);
var et = (t2) => {
  if ("string" != typeof t2) throw new TypeError("invalid pattern");
  if (t2.length > 65536) throw new TypeError("pattern is too long");
};
var nt = { "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true], "[:alpha:]": ["\\p{L}\\p{Nl}", true], "[:ascii:]": ["\\x00-\\x7f", false], "[:blank:]": ["\\p{Zs}\\t", true], "[:cntrl:]": ["\\p{Cc}", true], "[:digit:]": ["\\p{Nd}", true], "[:graph:]": ["\\p{Z}\\p{C}", true, true], "[:lower:]": ["\\p{Ll}", true], "[:print:]": ["\\p{C}", true], "[:punct:]": ["\\p{P}", true], "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true], "[:upper:]": ["\\p{Lu}", true], "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true], "[:xdigit:]": ["A-Fa-f0-9", false] };
var rt = (t2) => t2.replace(/[[\]\\-]/g, "\\$&");
var it = (t2) => t2.join("");
var st = (t2, e2) => {
  const n2 = e2;
  if ("[" !== t2.charAt(n2)) throw new Error("not in a brace expression");
  const r2 = [], i2 = [];
  let s2 = n2 + 1, o2 = false, a2 = false, h2 = false, l2 = false, u2 = n2, c2 = "";
  t: for (; s2 < t2.length; ) {
    const e3 = t2.charAt(s2);
    if ("!" !== e3 && "^" !== e3 || s2 !== n2 + 1) {
      if ("]" === e3 && o2 && !h2) {
        u2 = s2 + 1;
        break;
      }
      if (o2 = true, "\\" !== e3 || h2) {
        if ("[" === e3 && !h2) {
          for (const [e4, [o3, h3, l3]] of Object.entries(nt)) if (t2.startsWith(e4, s2)) {
            if (c2) return ["$.", false, t2.length - n2, true];
            s2 += e4.length, l3 ? i2.push(o3) : r2.push(o3), a2 = a2 || h3;
            continue t;
          }
        }
        h2 = false, c2 ? (e3 > c2 ? r2.push(rt(c2) + "-" + rt(e3)) : e3 === c2 && r2.push(rt(e3)), c2 = "", s2++) : t2.startsWith("-]", s2 + 1) ? (r2.push(rt(e3 + "-")), s2 += 2) : t2.startsWith("-", s2 + 1) ? (c2 = e3, s2 += 2) : (r2.push(rt(e3)), s2++);
      } else h2 = true, s2++;
    } else l2 = true, s2++;
  }
  if (u2 < s2) return ["", false, 0, false];
  if (!r2.length && !i2.length) return ["$.", false, t2.length - n2, true];
  if (0 === i2.length && 1 === r2.length && /^\\?.$/.test(r2[0]) && !l2) {
    return [(p2 = 2 === r2[0].length ? r2[0].slice(-1) : r2[0], p2.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")), false, u2 - n2, false];
  }
  var p2;
  const f2 = "[" + (l2 ? "^" : "") + it(r2) + "]", d2 = "[" + (l2 ? "" : "^") + it(i2) + "]";
  return [r2.length && i2.length ? "(" + f2 + "|" + d2 + ")" : r2.length ? f2 : d2, a2, u2 - n2, true];
};
var ot = function(t2) {
  let { windowsPathsNoEscape: e2 = false } = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  return e2 ? t2.replace(/\[([^\/\\])\]/g, "$1") : t2.replace(/((?!\\).|^)\[([^\/\\])\]/g, "$1$2").replace(/\\([^\/])/g, "$1");
};
var at;
var ht = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]);
var lt = (t2) => ht.has(t2);
var ut = (t2) => lt(t2.type);
var ct = /* @__PURE__ */ new Map([["!", ["@"]], ["?", ["?", "@"]], ["@", ["@"]], ["*", ["*", "+", "?", "@"]], ["+", ["+", "@"]]]);
var pt = /* @__PURE__ */ new Map([["!", ["?"]], ["@", ["?"]], ["+", ["?", "*"]]]);
var ft = /* @__PURE__ */ new Map([["!", ["?", "@"]], ["?", ["?", "@"]], ["@", ["?", "@"]], ["*", ["*", "+", "?", "@"]], ["+", ["+", "@", "?", "*"]]]);
var dt = /* @__PURE__ */ new Map([["!", /* @__PURE__ */ new Map([["!", "@"]])], ["?", /* @__PURE__ */ new Map([["*", "*"], ["+", "*"]])], ["@", /* @__PURE__ */ new Map([["!", "!"], ["?", "?"], ["@", "@"], ["*", "*"], ["+", "+"]])], ["+", /* @__PURE__ */ new Map([["?", "*"], ["*", "*"]])]]);
var gt = "(?!\\.)";
var mt = /* @__PURE__ */ new Set(["[", "."]);
var yt = /* @__PURE__ */ new Set(["..", "."]);
var bt = new Set("().*{}+?[]^$\\!");
var vt = "[^/]";
var wt = vt + "*?";
var xt = vt + "+?";
var Nt = class {
  type;
  #t;
  #e;
  #n = false;
  #r = [];
  #i;
  #s;
  #o;
  #a = false;
  #h;
  #l;
  #u = false;
  constructor(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
    this.type = t2, t2 && (this.#e = true), this.#i = e2, this.#t = this.#i ? this.#i.#t : this, this.#h = this.#t === this ? n2 : this.#t.#h, this.#o = this.#t === this ? [] : this.#t.#o, "!" !== t2 || this.#t.#a || this.#o.push(this), this.#s = this.#i ? this.#i.#r.length : 0;
  }
  get hasMagic() {
    if (void 0 !== this.#e) return this.#e;
    for (const t2 of this.#r) if ("string" != typeof t2 && (t2.type || t2.hasMagic)) return this.#e = true;
    return this.#e;
  }
  toString() {
    return void 0 !== this.#l ? this.#l : this.type ? this.#l = this.type + "(" + this.#r.map(((t2) => String(t2))).join("|") + ")" : this.#l = this.#r.map(((t2) => String(t2))).join("");
  }
  #c() {
    if (this !== this.#t) throw new Error("should only call on root");
    if (this.#a) return this;
    let t2;
    for (this.toString(), this.#a = true; t2 = this.#o.pop(); ) {
      if ("!" !== t2.type) continue;
      let e2 = t2, n2 = e2.#i;
      for (; n2; ) {
        for (let r2 = e2.#s + 1; !n2.type && r2 < n2.#r.length; r2++) for (const e3 of t2.#r) {
          if ("string" == typeof e3) throw new Error("string part in extglob AST??");
          e3.copyIn(n2.#r[r2]);
        }
        e2 = n2, n2 = e2.#i;
      }
    }
    return this;
  }
  push() {
    for (var t2 = arguments.length, e2 = new Array(t2), n2 = 0; n2 < t2; n2++) e2[n2] = arguments[n2];
    for (const t3 of e2) if ("" !== t3) {
      if ("string" != typeof t3 && !(t3 instanceof at && t3.#i === this)) throw new Error("invalid part: " + t3);
      this.#r.push(t3);
    }
  }
  toJSON() {
    const t2 = null === this.type ? this.#r.slice().map(((t3) => "string" == typeof t3 ? t3 : t3.toJSON())) : [this.type, ...this.#r.map(((t3) => t3.toJSON()))];
    return this.isStart() && !this.type && t2.unshift([]), this.isEnd() && (this === this.#t || this.#t.#a && "!" === this.#i?.type) && t2.push({}), t2;
  }
  isStart() {
    if (this.#t === this) return true;
    if (!this.#i?.isStart()) return false;
    if (0 === this.#s) return true;
    const t2 = this.#i;
    for (let e2 = 0; e2 < this.#s; e2++) {
      const n2 = t2.#r[e2];
      if (!(n2 instanceof at && "!" === n2.type)) return false;
    }
    return true;
  }
  isEnd() {
    if (this.#t === this) return true;
    if ("!" === this.#i?.type) return true;
    if (!this.#i?.isEnd()) return false;
    if (!this.type) return this.#i?.isEnd();
    const t2 = this.#i ? this.#i.#r.length : 0;
    return this.#s === t2 - 1;
  }
  copyIn(t2) {
    "string" == typeof t2 ? this.push(t2) : this.push(t2.clone(this));
  }
  clone(t2) {
    const e2 = new at(this.type, t2);
    for (const t3 of this.#r) e2.copyIn(t3);
    return e2;
  }
  static #p(t2, e2, n2, r2, i2) {
    const s2 = r2.maxExtglobRecursion ?? 2;
    let o2 = false, a2 = false, h2 = -1, l2 = false;
    if (null === e2.type) {
      let u3 = n2, c3 = "";
      for (; u3 < t2.length; ) {
        const n3 = t2.charAt(u3++);
        if (o2 || "\\" === n3) o2 = !o2, c3 += n3;
        else if (a2) u3 === h2 + 1 ? "^" !== n3 && "!" !== n3 || (l2 = true) : "]" !== n3 || u3 === h2 + 2 && l2 || (a2 = false), c3 += n3;
        else if ("[" !== n3) if (!r2.noext && lt(n3) && "(" === t2.charAt(u3) && i2 <= s2) {
          e2.push(c3), c3 = "";
          const s3 = new at(n3, e2);
          u3 = at.#p(t2, s3, u3, r2, i2 + 1), e2.push(s3);
        } else c3 += n3;
        else a2 = true, h2 = u3, l2 = false, c3 += n3;
      }
      return e2.push(c3), u3;
    }
    let u2 = n2 + 1, c2 = new at(null, e2);
    const p2 = [];
    let f2 = "";
    for (; u2 < t2.length; ) {
      const n3 = t2.charAt(u2++);
      if (o2 || "\\" === n3) o2 = !o2, f2 += n3;
      else if (a2) u2 === h2 + 1 ? "^" !== n3 && "!" !== n3 || (l2 = true) : "]" !== n3 || u2 === h2 + 2 && l2 || (a2 = false), f2 += n3;
      else if ("[" !== n3) if (lt(n3) && "(" === t2.charAt(u2) && (i2 <= s2 || e2 && e2.#f(n3))) {
        const s3 = e2 && e2.#f(n3) ? 0 : 1;
        c2.push(f2), f2 = "";
        const o3 = new at(n3, c2);
        c2.push(o3), u2 = at.#p(t2, o3, u2, r2, i2 + s3);
      } else if ("|" !== n3) {
        if (")" === n3) return "" === f2 && 0 === e2.#r.length && (e2.#u = true), c2.push(f2), f2 = "", e2.push(...p2, c2), u2;
        f2 += n3;
      } else c2.push(f2), f2 = "", p2.push(c2), c2 = new at(null, e2);
      else a2 = true, h2 = u2, l2 = false, f2 += n3;
    }
    return e2.type = null, e2.#e = void 0, e2.#r = [t2.substring(n2 - 1)], u2;
  }
  #d(t2) {
    return this.#g(t2, pt);
  }
  #g(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : ct;
    if (!t2 || "object" != typeof t2 || null !== t2.type || 1 !== t2.#r.length || null === this.type) return false;
    const n2 = t2.#r[0];
    return !(!n2 || "object" != typeof n2 || null === n2.type) && this.#f(n2.type, e2);
  }
  #f(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : ft;
    return !!e2.get(this.type)?.includes(t2);
  }
  #m(t2, e2) {
    const n2 = t2.#r[0], r2 = new at(null, n2, this.options);
    r2.#r.push(""), n2.push(r2), this.#y(t2, e2);
  }
  #y(t2, e2) {
    const n2 = t2.#r[0];
    this.#r.splice(e2, 1, ...n2.#r);
    for (const t3 of n2.#r) "object" == typeof t3 && (t3.#i = this);
    this.#l = void 0;
  }
  #b(t2) {
    const e2 = dt.get(this.type);
    return !!e2?.has(t2);
  }
  #v(t2) {
    if (!t2 || "object" != typeof t2 || null !== t2.type || 1 !== t2.#r.length || null === this.type || 1 !== this.#r.length) return false;
    const e2 = t2.#r[0];
    return !(!e2 || "object" != typeof e2 || null === e2.type) && this.#b(e2.type);
  }
  #w(t2) {
    const e2 = dt.get(this.type), n2 = t2.#r[0], r2 = e2?.get(n2.type);
    if (!r2) return false;
    this.#r = n2.#r;
    for (const t3 of this.#r) "object" == typeof t3 && (t3.#i = this);
    this.type = r2, this.#l = void 0, this.#u = false;
  }
  #x() {
    if (ut(this)) {
      let t2 = 0, e2 = false;
      do {
        e2 = true;
        for (let t3 = 0; t3 < this.#r.length; t3++) {
          const n2 = this.#r[t3];
          "object" == typeof n2 && (n2.#x(), this.#g(n2) ? (e2 = false, this.#y(n2, t3)) : this.#d(n2) ? (e2 = false, this.#m(n2, t3)) : this.#v(n2) && (e2 = false, this.#w(n2)));
        }
      } while (!e2 && ++t2 < 10);
    } else for (const t2 of this.#r) "object" == typeof t2 && t2.#x();
    this.#l = void 0;
  }
  static fromGlob(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    const n2 = new at(null, void 0, e2);
    return at.#p(t2, n2, 0, e2, 0), n2;
  }
  toMMPattern() {
    if (this !== this.#t) return this.#t.toMMPattern();
    const t2 = this.toString(), [e2, n2, r2, i2] = this.toRegExpSource();
    if (!(r2 || this.#e || this.#h.nocase && !this.#h.nocaseMagicOnly && t2.toUpperCase() !== t2.toLowerCase())) return n2;
    const s2 = (this.#h.nocase ? "i" : "") + (i2 ? "u" : "");
    return Object.assign(new RegExp(`^${e2}$`, s2), { _src: e2, _glob: t2 });
  }
  get options() {
    return this.#h;
  }
  toRegExpSource(t2) {
    const e2 = t2 ?? !!this.#h.dot;
    if (this.#t === this && (this.#x(), this.#c()), !ut(this)) {
      const n3 = this.isStart() && this.isEnd(), r3 = this.#r.map(((e3) => {
        const [r4, i4, s4, o3] = "string" == typeof e3 ? at.#N(e3, this.#e, n3) : e3.toRegExpSource(t2);
        return this.#e = this.#e || s4, this.#n = this.#n || o3, r4;
      })).join("");
      let i3 = "";
      if (this.isStart() && "string" == typeof this.#r[0] && (1 !== this.#r.length || !yt.has(this.#r[0]))) {
        const n4 = mt, s4 = e2 && n4.has(r3.charAt(0)) || r3.startsWith("\\.") && n4.has(r3.charAt(2)) || r3.startsWith("\\.\\.") && n4.has(r3.charAt(4)), o3 = !e2 && !t2 && n4.has(r3.charAt(0));
        i3 = s4 ? "(?!(?:^|/)\\.\\.?(?:$|/))" : o3 ? gt : "";
      }
      let s3 = "";
      return this.isEnd() && this.#t.#a && "!" === this.#i?.type && (s3 = "(?:$|\\/)"), [i3 + r3 + s3, ot(r3), this.#e = !!this.#e, this.#n];
    }
    const n2 = "*" === this.type || "+" === this.type, r2 = "!" === this.type ? "(?:(?!(?:" : "(?:";
    let i2 = this.#E(e2);
    if (this.isStart() && this.isEnd() && !i2 && "!" !== this.type) {
      const t3 = this.toString(), e3 = this;
      return e3.#r = [t3], e3.type = null, e3.#e = void 0, [t3, ot(this.toString()), false, false];
    }
    let s2 = !n2 || t2 || e2 ? "" : this.#E(true);
    s2 === i2 && (s2 = ""), s2 && (i2 = `(?:${i2})(?:${s2})*?`);
    let o2 = "";
    return o2 = "!" === this.type && this.#u ? (this.isStart() && !e2 ? gt : "") + xt : r2 + i2 + ("!" === this.type ? "))" + (!this.isStart() || e2 || t2 ? "" : gt) + wt + ")" : "@" === this.type ? ")" : "?" === this.type ? ")?" : "+" === this.type && s2 ? ")" : "*" === this.type && s2 ? ")?" : `)${this.type}`), [o2, ot(i2), this.#e = !!this.#e, this.#n];
  }
  #E(t2) {
    return this.#r.map(((e2) => {
      if ("string" == typeof e2) throw new Error("string type in extglob ast??");
      const [n2, r2, i2, s2] = e2.toRegExpSource(t2);
      return this.#n = this.#n || s2, n2;
    })).filter(((t3) => !(this.isStart() && this.isEnd() && !t3))).join("|");
  }
  static #N(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] && arguments[2], r2 = false, i2 = "", s2 = false, o2 = false;
    for (let a2 = 0; a2 < t2.length; a2++) {
      const h2 = t2.charAt(a2);
      if (r2) r2 = false, i2 += (bt.has(h2) ? "\\" : "") + h2, o2 = false;
      else if ("\\" !== h2) {
        if ("[" === h2) {
          const [n3, r3, h3, l2] = st(t2, a2);
          if (h3) {
            i2 += n3, s2 = s2 || r3, a2 += h3 - 1, e2 = e2 || l2, o2 = false;
            continue;
          }
        }
        if ("*" !== h2) o2 = false, "?" !== h2 ? i2 += h2.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") : (i2 += vt, e2 = true);
        else {
          if (o2) continue;
          o2 = true, i2 += n2 && /^[*]+$/.test(t2) ? xt : wt, e2 = true;
        }
      } else a2 === t2.length - 1 ? i2 += "\\\\" : r2 = true;
    }
    return [i2, ot(t2), !!e2, s2];
  }
};
at = Nt;
var Et = function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  return et(e2), !(!n2.nocomment && "#" === e2.charAt(0)) && new Xt(e2, n2).match(t2);
};
var At = /^\*+([^+@!?\*\[\(]*)$/;
var St = (t2) => (e2) => !e2.startsWith(".") && e2.endsWith(t2);
var Pt = (t2) => (e2) => e2.endsWith(t2);
var Tt = (t2) => (t2 = t2.toLowerCase(), (e2) => !e2.startsWith(".") && e2.toLowerCase().endsWith(t2));
var Ot = (t2) => (t2 = t2.toLowerCase(), (e2) => e2.toLowerCase().endsWith(t2));
var Ct = /^\*+\.\*+$/;
var _t = (t2) => !t2.startsWith(".") && t2.includes(".");
var $t = (t2) => "." !== t2 && ".." !== t2 && t2.includes(".");
var jt = /^\.\*+$/;
var It = (t2) => "." !== t2 && ".." !== t2 && t2.startsWith(".");
var Mt = /^\*+$/;
var Rt = (t2) => 0 !== t2.length && !t2.startsWith(".");
var kt = (t2) => 0 !== t2.length && "." !== t2 && ".." !== t2;
var Lt = /^\?+([^+@!?\*\[\(]*)?$/;
var Dt = (t2) => {
  let [e2, n2 = ""] = t2;
  const r2 = Wt([e2]);
  return n2 ? (n2 = n2.toLowerCase(), (t3) => r2(t3) && t3.toLowerCase().endsWith(n2)) : r2;
};
var Ut = (t2) => {
  let [e2, n2 = ""] = t2;
  const r2 = Bt([e2]);
  return n2 ? (n2 = n2.toLowerCase(), (t3) => r2(t3) && t3.toLowerCase().endsWith(n2)) : r2;
};
var Ft = (t2) => {
  let [e2, n2 = ""] = t2;
  const r2 = Bt([e2]);
  return n2 ? (t3) => r2(t3) && t3.endsWith(n2) : r2;
};
var Vt = (t2) => {
  let [e2, n2 = ""] = t2;
  const r2 = Wt([e2]);
  return n2 ? (t3) => r2(t3) && t3.endsWith(n2) : r2;
};
var Wt = (t2) => {
  let [e2] = t2;
  const n2 = e2.length;
  return (t3) => t3.length === n2 && !t3.startsWith(".");
};
var Bt = (t2) => {
  let [e2] = t2;
  const n2 = e2.length;
  return (t3) => t3.length === n2 && "." !== t3 && ".." !== t3;
};
var Gt = "object" == typeof process && process ? "object" == typeof process.env && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
Et.sep = "win32" === Gt ? "\\" : "/";
var zt = Symbol("globstar **");
Et.GLOBSTAR = zt, Et.filter = function(t2) {
  let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  return (n2) => Et(n2, t2, e2);
};
var qt = function(t2) {
  let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  return Object.assign({}, t2, e2);
};
Et.defaults = (t2) => {
  if (!t2 || "object" != typeof t2 || !Object.keys(t2).length) return Et;
  const e2 = Et;
  return Object.assign((function(n2, r2) {
    return e2(n2, r2, qt(t2, arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {}));
  }), { Minimatch: class extends e2.Minimatch {
    constructor(e3) {
      super(e3, qt(t2, arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {}));
    }
    static defaults(n2) {
      return e2.defaults(qt(t2, n2)).Minimatch;
    }
  }, AST: class extends e2.AST {
    constructor(e3, n2) {
      super(e3, n2, qt(t2, arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {}));
    }
    static fromGlob(n2) {
      let r2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
      return e2.AST.fromGlob(n2, qt(t2, r2));
    }
  }, unescape: function(n2) {
    let r2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return e2.unescape(n2, qt(t2, r2));
  }, escape: function(n2) {
    let r2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return e2.escape(n2, qt(t2, r2));
  }, filter: function(n2) {
    let r2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return e2.filter(n2, qt(t2, r2));
  }, defaults: (n2) => e2.defaults(qt(t2, n2)), makeRe: function(n2) {
    let r2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return e2.makeRe(n2, qt(t2, r2));
  }, braceExpand: function(n2) {
    let r2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return e2.braceExpand(n2, qt(t2, r2));
  }, match: function(n2, r2) {
    let i2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
    return e2.match(n2, r2, qt(t2, i2));
  }, sep: e2.sep, GLOBSTAR: zt });
};
var Ht = function(t2) {
  let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  return et(t2), e2.nobrace || !/\{(?:(?!\{).)*\}/.test(t2) ? [t2] : tt(t2);
};
Et.braceExpand = Ht, Et.makeRe = function(t2) {
  return new Xt(t2, arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {}).makeRe();
}, Et.match = function(t2, e2) {
  const n2 = new Xt(e2, arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {});
  return t2 = t2.filter(((t3) => n2.match(t3))), n2.options.nonull && !t2.length && t2.push(e2), t2;
};
var Yt = /[?*]|[+@!]\(.*?\)|\[|\]/;
var Xt = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  maxGlobstarRecursion;
  regexp;
  constructor(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    et(t2), e2 = e2 || {}, this.options = e2, this.maxGlobstarRecursion = e2.maxGlobstarRecursion ?? 200, this.pattern = t2, this.platform = e2.platform || Gt, this.isWindows = "win32" === this.platform, this.windowsPathsNoEscape = !!e2.windowsPathsNoEscape || false === e2.allowWindowsEscape, this.windowsPathsNoEscape && (this.pattern = this.pattern.replace(/\\/g, "/")), this.preserveMultipleSlashes = !!e2.preserveMultipleSlashes, this.regexp = null, this.negate = false, this.nonegate = !!e2.nonegate, this.comment = false, this.empty = false, this.partial = !!e2.partial, this.nocase = !!this.options.nocase, this.windowsNoMagicRoot = void 0 !== e2.windowsNoMagicRoot ? e2.windowsNoMagicRoot : !(!this.isWindows || !this.nocase), this.globSet = [], this.globParts = [], this.set = [], this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) return true;
    for (const t2 of this.set) for (const e2 of t2) if ("string" != typeof e2) return true;
    return false;
  }
  debug() {
  }
  make() {
    const t2 = this.pattern, e2 = this.options;
    if (!e2.nocomment && "#" === t2.charAt(0)) return void (this.comment = true);
    if (!t2) return void (this.empty = true);
    this.parseNegate(), this.globSet = [...new Set(this.braceExpand())], e2.debug && (this.debug = function() {
      return console.error(...arguments);
    }), this.debug(this.pattern, this.globSet);
    const n2 = this.globSet.map(((t3) => this.slashSplit(t3)));
    this.globParts = this.preprocess(n2), this.debug(this.pattern, this.globParts);
    let r2 = this.globParts.map(((t3, e3, n3) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        const e4 = !("" !== t3[0] || "" !== t3[1] || "?" !== t3[2] && Yt.test(t3[2]) || Yt.test(t3[3])), n4 = /^[a-z]:/i.test(t3[0]);
        if (e4) return [...t3.slice(0, 4), ...t3.slice(4).map(((t4) => this.parse(t4)))];
        if (n4) return [t3[0], ...t3.slice(1).map(((t4) => this.parse(t4)))];
      }
      return t3.map(((t4) => this.parse(t4)));
    }));
    if (this.debug(this.pattern, r2), this.set = r2.filter(((t3) => -1 === t3.indexOf(false))), this.isWindows) for (let t3 = 0; t3 < this.set.length; t3++) {
      const e3 = this.set[t3];
      "" === e3[0] && "" === e3[1] && "?" === this.globParts[t3][2] && "string" == typeof e3[3] && /^[a-z]:$/i.test(e3[3]) && (e3[2] = "?");
    }
    this.debug(this.pattern, this.set);
  }
  preprocess(t2) {
    if (this.options.noglobstar) for (let e3 = 0; e3 < t2.length; e3++) for (let n2 = 0; n2 < t2[e3].length; n2++) "**" === t2[e3][n2] && (t2[e3][n2] = "*");
    const { optimizationLevel: e2 = 1 } = this.options;
    return e2 >= 2 ? (t2 = this.firstPhasePreProcess(t2), t2 = this.secondPhasePreProcess(t2)) : t2 = e2 >= 1 ? this.levelOneOptimize(t2) : this.adjascentGlobstarOptimize(t2), t2;
  }
  adjascentGlobstarOptimize(t2) {
    return t2.map(((t3) => {
      let e2 = -1;
      for (; -1 !== (e2 = t3.indexOf("**", e2 + 1)); ) {
        let n2 = e2;
        for (; "**" === t3[n2 + 1]; ) n2++;
        n2 !== e2 && t3.splice(e2, n2 - e2);
      }
      return t3;
    }));
  }
  levelOneOptimize(t2) {
    return t2.map(((t3) => 0 === (t3 = t3.reduce(((t4, e2) => {
      const n2 = t4[t4.length - 1];
      return "**" === e2 && "**" === n2 ? t4 : ".." === e2 && n2 && ".." !== n2 && "." !== n2 && "**" !== n2 ? (t4.pop(), t4) : (t4.push(e2), t4);
    }), [])).length ? [""] : t3));
  }
  levelTwoFileOptimize(t2) {
    Array.isArray(t2) || (t2 = this.slashSplit(t2));
    let e2 = false;
    do {
      if (e2 = false, !this.preserveMultipleSlashes) {
        for (let n3 = 1; n3 < t2.length - 1; n3++) {
          const r2 = t2[n3];
          1 === n3 && "" === r2 && "" === t2[0] || "." !== r2 && "" !== r2 || (e2 = true, t2.splice(n3, 1), n3--);
        }
        "." !== t2[0] || 2 !== t2.length || "." !== t2[1] && "" !== t2[1] || (e2 = true, t2.pop());
      }
      let n2 = 0;
      for (; -1 !== (n2 = t2.indexOf("..", n2 + 1)); ) {
        const r2 = t2[n2 - 1];
        r2 && "." !== r2 && ".." !== r2 && "**" !== r2 && (e2 = true, t2.splice(n2 - 1, 2), n2 -= 2);
      }
    } while (e2);
    return 0 === t2.length ? [""] : t2;
  }
  firstPhasePreProcess(t2) {
    let e2 = false;
    do {
      e2 = false;
      for (let n2 of t2) {
        let r2 = -1;
        for (; -1 !== (r2 = n2.indexOf("**", r2 + 1)); ) {
          let i3 = r2;
          for (; "**" === n2[i3 + 1]; ) i3++;
          i3 > r2 && n2.splice(r2 + 1, i3 - r2);
          let s2 = n2[r2 + 1];
          const o2 = n2[r2 + 2], a2 = n2[r2 + 3];
          if (".." !== s2) continue;
          if (!o2 || "." === o2 || ".." === o2 || !a2 || "." === a2 || ".." === a2) continue;
          e2 = true, n2.splice(r2, 1);
          const h2 = n2.slice(0);
          h2[r2] = "**", t2.push(h2), r2--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let t3 = 1; t3 < n2.length - 1; t3++) {
            const r3 = n2[t3];
            1 === t3 && "" === r3 && "" === n2[0] || "." !== r3 && "" !== r3 || (e2 = true, n2.splice(t3, 1), t3--);
          }
          "." !== n2[0] || 2 !== n2.length || "." !== n2[1] && "" !== n2[1] || (e2 = true, n2.pop());
        }
        let i2 = 0;
        for (; -1 !== (i2 = n2.indexOf("..", i2 + 1)); ) {
          const t3 = n2[i2 - 1];
          if (t3 && "." !== t3 && ".." !== t3 && "**" !== t3) {
            e2 = true;
            const t4 = 1 === i2 && "**" === n2[i2 + 1] ? ["."] : [];
            n2.splice(i2 - 1, 2, ...t4), 0 === n2.length && n2.push(""), i2 -= 2;
          }
        }
      }
    } while (e2);
    return t2;
  }
  secondPhasePreProcess(t2) {
    for (let e2 = 0; e2 < t2.length - 1; e2++) for (let n2 = e2 + 1; n2 < t2.length; n2++) {
      const r2 = this.partsMatch(t2[e2], t2[n2], !this.preserveMultipleSlashes);
      if (r2) {
        t2[e2] = [], t2[n2] = r2;
        break;
      }
    }
    return t2.filter(((t3) => t3.length));
  }
  partsMatch(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] && arguments[2], r2 = 0, i2 = 0, s2 = [], o2 = "";
    for (; r2 < t2.length && i2 < e2.length; ) if (t2[r2] === e2[i2]) s2.push("b" === o2 ? e2[i2] : t2[r2]), r2++, i2++;
    else if (n2 && "**" === t2[r2] && e2[i2] === t2[r2 + 1]) s2.push(t2[r2]), r2++;
    else if (n2 && "**" === e2[i2] && t2[r2] === e2[i2 + 1]) s2.push(e2[i2]), i2++;
    else if ("*" !== t2[r2] || !e2[i2] || !this.options.dot && e2[i2].startsWith(".") || "**" === e2[i2]) {
      if ("*" !== e2[i2] || !t2[r2] || !this.options.dot && t2[r2].startsWith(".") || "**" === t2[r2]) return false;
      if ("a" === o2) return false;
      o2 = "b", s2.push(e2[i2]), r2++, i2++;
    } else {
      if ("b" === o2) return false;
      o2 = "a", s2.push(t2[r2]), r2++, i2++;
    }
    return t2.length === e2.length && s2;
  }
  parseNegate() {
    if (this.nonegate) return;
    const t2 = this.pattern;
    let e2 = false, n2 = 0;
    for (let r2 = 0; r2 < t2.length && "!" === t2.charAt(r2); r2++) e2 = !e2, n2++;
    n2 && (this.pattern = t2.slice(n2)), this.negate = e2;
  }
  matchOne(t2, e2) {
    let n2 = arguments.length > 2 && void 0 !== arguments[2] && arguments[2], r2 = 0, i2 = 0;
    if (this.isWindows) {
      const n3 = "string" == typeof t2[0] && /^[a-z]:$/i.test(t2[0]), s3 = !n3 && "" === t2[0] && "" === t2[1] && "?" === t2[2] && /^[a-z]:$/i.test(t2[3]), o2 = "string" == typeof e2[0] && /^[a-z]:$/i.test(e2[0]), a2 = s3 ? 3 : n3 ? 0 : void 0, h2 = !o2 && "" === e2[0] && "" === e2[1] && "?" === e2[2] && "string" == typeof e2[3] && /^[a-z]:$/i.test(e2[3]) ? 3 : o2 ? 0 : void 0;
      if ("number" == typeof a2 && "number" == typeof h2) {
        const [n4, s4] = [t2[a2], e2[h2]];
        n4.toLowerCase() === s4.toLowerCase() && (e2[h2] = n4, i2 = h2, r2 = a2);
      }
    }
    const { optimizationLevel: s2 = 1 } = this.options;
    return s2 >= 2 && (t2 = this.levelTwoFileOptimize(t2)), e2.includes(zt) ? this.#A(t2, e2, n2, r2, i2) : this.#S(t2, e2, n2, r2, i2);
  }
  #A(t2, e2, n2, r2, i2) {
    const s2 = e2.indexOf(zt, i2), o2 = e2.lastIndexOf(zt), [a2, h2, l2] = n2 ? [e2.slice(i2, s2), e2.slice(s2 + 1), []] : [e2.slice(i2, s2), e2.slice(s2 + 1, o2), e2.slice(o2 + 1)];
    if (a2.length) {
      const e3 = t2.slice(r2, r2 + a2.length);
      if (!this.#S(e3, a2, n2, 0, 0)) return false;
      r2 += a2.length;
    }
    let u2 = 0;
    if (l2.length) {
      if (l2.length + r2 > t2.length) return false;
      let e3 = t2.length - l2.length;
      if (this.#S(t2, l2, n2, e3, 0)) u2 = l2.length;
      else {
        if ("" !== t2[t2.length - 1] || r2 + l2.length === t2.length) return false;
        if (e3--, !this.#S(t2, l2, n2, e3, 0)) return false;
        u2 = l2.length + 1;
      }
    }
    if (!h2.length) {
      let e3 = !!u2;
      for (let n3 = r2; n3 < t2.length - u2; n3++) {
        const r3 = String(t2[n3]);
        if (e3 = true, "." === r3 || ".." === r3 || !this.options.dot && r3.startsWith(".")) return false;
      }
      return n2 || e3;
    }
    const c2 = [[[], 0]];
    let p2 = c2[0], f2 = 0;
    const d2 = [0];
    for (const t3 of h2) t3 === zt ? (d2.push(f2), p2 = [[], 0], c2.push(p2)) : (p2[0].push(t3), f2++);
    let g2 = c2.length - 1;
    const m2 = t2.length - u2;
    for (const t3 of c2) t3[1] = m2 - (d2[g2--] + t3[0].length);
    return !!this.#P(t2, c2, r2, 0, n2, 0, !!u2);
  }
  #P(t2, e2, n2, r2, i2, s2, o2) {
    const a2 = e2[r2];
    if (!a2) {
      for (let e3 = n2; e3 < t2.length; e3++) {
        o2 = true;
        const n3 = t2[e3];
        if ("." === n3 || ".." === n3 || !this.options.dot && n3.startsWith(".")) return false;
      }
      return o2;
    }
    const [h2, l2] = a2;
    for (; n2 <= l2; ) {
      if (this.#S(t2.slice(0, n2 + h2.length), h2, i2, n2, 0) && s2 < this.maxGlobstarRecursion) {
        const a4 = this.#P(t2, e2, n2 + h2.length, r2 + 1, i2, s2 + 1, o2);
        if (false !== a4) return a4;
      }
      const a3 = t2[n2];
      if ("." === a3 || ".." === a3 || !this.options.dot && a3.startsWith(".")) return false;
      n2++;
    }
    return i2 || null;
  }
  #S(t2, e2, n2, r2, i2) {
    let s2, o2, a2, h2;
    for (s2 = r2, o2 = i2, h2 = t2.length, a2 = e2.length; s2 < h2 && o2 < a2; s2++, o2++) {
      this.debug("matchOne loop");
      let n3, r3 = e2[o2], i3 = t2[s2];
      if (this.debug(e2, r3, i3), false === r3 || r3 === zt) return false;
      if ("string" == typeof r3 ? (n3 = i3 === r3, this.debug("string match", r3, i3, n3)) : (n3 = r3.test(i3), this.debug("pattern match", r3, i3, n3)), !n3) return false;
    }
    if (s2 === h2 && o2 === a2) return true;
    if (s2 === h2) return n2;
    if (o2 === a2) return s2 === h2 - 1 && "" === t2[s2];
    throw new Error("wtf?");
  }
  braceExpand() {
    return Ht(this.pattern, this.options);
  }
  parse(t2) {
    et(t2);
    const e2 = this.options;
    if ("**" === t2) return zt;
    if ("" === t2) return "";
    let n2, r2 = null;
    (n2 = t2.match(Mt)) ? r2 = e2.dot ? kt : Rt : (n2 = t2.match(At)) ? r2 = (e2.nocase ? e2.dot ? Ot : Tt : e2.dot ? Pt : St)(n2[1]) : (n2 = t2.match(Lt)) ? r2 = (e2.nocase ? e2.dot ? Ut : Dt : e2.dot ? Ft : Vt)(n2) : (n2 = t2.match(Ct)) ? r2 = e2.dot ? $t : _t : (n2 = t2.match(jt)) && (r2 = It);
    const i2 = Nt.fromGlob(t2, this.options).toMMPattern();
    return r2 && "object" == typeof i2 && Reflect.defineProperty(i2, "test", { value: r2 }), i2;
  }
  makeRe() {
    if (this.regexp || false === this.regexp) return this.regexp;
    const t2 = this.set;
    if (!t2.length) return this.regexp = false, this.regexp;
    const e2 = this.options, n2 = e2.noglobstar ? "[^/]*?" : e2.dot ? "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?" : "(?:(?!(?:\\/|^)\\.).)*?", r2 = new Set(e2.nocase ? ["i"] : []);
    let i2 = t2.map(((t3) => {
      const e3 = t3.map(((t4) => {
        if (t4 instanceof RegExp) for (const e4 of t4.flags.split("")) r2.add(e4);
        return "string" == typeof t4 ? t4.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") : t4 === zt ? zt : t4._src;
      }));
      return e3.forEach(((t4, r3) => {
        const i3 = e3[r3 + 1], s3 = e3[r3 - 1];
        t4 === zt && s3 !== zt && (void 0 === s3 ? void 0 !== i3 && i3 !== zt ? e3[r3 + 1] = "(?:\\/|" + n2 + "\\/)?" + i3 : e3[r3] = n2 : void 0 === i3 ? e3[r3 - 1] = s3 + "(?:\\/|" + n2 + ")?" : i3 !== zt && (e3[r3 - 1] = s3 + "(?:\\/|\\/" + n2 + "\\/)" + i3, e3[r3 + 1] = zt));
      })), e3.filter(((t4) => t4 !== zt)).join("/");
    })).join("|");
    const [s2, o2] = t2.length > 1 ? ["(?:", ")"] : ["", ""];
    i2 = "^" + s2 + i2 + o2 + "$", this.negate && (i2 = "^(?!" + i2 + ").+$");
    try {
      this.regexp = new RegExp(i2, [...r2].join(""));
    } catch (t3) {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(t2) {
    return this.preserveMultipleSlashes ? t2.split("/") : this.isWindows && /^\/\/[^\/]+/.test(t2) ? ["", ...t2.split(/\/+/)] : t2.split(/\/+/);
  }
  match(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : this.partial;
    if (this.debug("match", t2, this.pattern), this.comment) return false;
    if (this.empty) return "" === t2;
    if ("/" === t2 && e2) return true;
    const n2 = this.options;
    this.isWindows && (t2 = t2.split("\\").join("/"));
    const r2 = this.slashSplit(t2);
    this.debug(this.pattern, "split", r2);
    const i2 = this.set;
    this.debug(this.pattern, "set", i2);
    let s2 = r2[r2.length - 1];
    if (!s2) for (let t3 = r2.length - 2; !s2 && t3 >= 0; t3--) s2 = r2[t3];
    for (let t3 = 0; t3 < i2.length; t3++) {
      const o2 = i2[t3];
      let a2 = r2;
      if (n2.matchBase && 1 === o2.length && (a2 = [s2]), this.matchOne(a2, o2, e2)) return !!n2.flipNegate || !this.negate;
    }
    return !n2.flipNegate && this.negate;
  }
  static defaults(t2) {
    return Et.defaults(t2).Minimatch;
  }
};
function Zt(t2) {
  const e2 = new Error(`${arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : ""}Invalid response: ${t2.status} ${t2.statusText}`);
  return e2.status = t2.status, e2.response = t2, e2;
}
function Jt(t2, e2) {
  const { status: n2 } = e2;
  if (401 === n2 && t2.digest) return e2;
  if (n2 >= 400) throw Zt(e2);
  return e2;
}
function Kt(t2, e2) {
  return arguments.length > 2 && void 0 !== arguments[2] && arguments[2] ? { data: e2, headers: t2.headers ? V(t2.headers) : {}, status: t2.status, statusText: t2.statusText } : e2;
}
Et.AST = Nt, Et.Minimatch = Xt, Et.escape = function(t2) {
  let { windowsPathsNoEscape: e2 = false } = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  return e2 ? t2.replace(/[?*()[\]]/g, "[$&]") : t2.replace(/[?*()[\]\\]/g, "\\$&");
}, Et.unescape = ot;
var Qt = (te = function(t2, e2, n2) {
  let r2 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
  const i2 = K({ url: m(t2.remoteURL, p(e2)), method: "COPY", headers: { Destination: m(t2.remoteURL, p(n2)), Overwrite: false === r2.overwrite ? "F" : "T", Depth: r2.shallow ? "0" : "infinity" } }, t2, r2);
  return o2 = function(e3) {
    Jt(t2, e3);
  }, (s2 = J(i2, t2)) && s2.then || (s2 = Promise.resolve(s2)), o2 ? s2.then(o2) : s2;
  var s2, o2;
}, function() {
  for (var t2 = [], e2 = 0; e2 < arguments.length; e2++) t2[e2] = arguments[e2];
  try {
    return Promise.resolve(te.apply(this, t2));
  } catch (t3) {
    return Promise.reject(t3);
  }
});
var te;
var ee = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
var ne = new RegExp("^[" + ee + "][" + ee + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$");
function re(t2, e2) {
  const n2 = [];
  let r2 = e2.exec(t2);
  for (; r2; ) {
    const i2 = [];
    i2.startIndex = e2.lastIndex - r2[0].length;
    const s2 = r2.length;
    for (let t3 = 0; t3 < s2; t3++) i2.push(r2[t3]);
    n2.push(i2), r2 = e2.exec(t2);
  }
  return n2;
}
var ie = function(t2) {
  return !(null == ne.exec(t2));
};
var se = ["hasOwnProperty", "toString", "valueOf", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"];
var oe = ["__proto__", "constructor", "prototype"];
var ae = (t2) => se.includes(t2) ? "__" + t2 : t2;
var he = { preserveOrder: false, attributeNamePrefix: "@_", attributesGroupName: false, textNodeName: "#text", ignoreAttributes: true, removeNSPrefix: false, allowBooleanAttributes: false, parseTagValue: true, parseAttributeValue: false, trimValues: true, cdataPropName: false, numberParseOptions: { hex: true, leadingZeros: true, eNotation: true }, tagValueProcessor: function(t2, e2) {
  return e2;
}, attributeValueProcessor: function(t2, e2) {
  return e2;
}, stopNodes: [], alwaysCreateTextNode: false, isArray: () => false, commentPropName: false, unpairedTags: [], processEntities: true, htmlEntities: false, entityDecoder: null, ignoreDeclaration: false, ignorePiTags: false, transformTagName: false, transformAttributeName: false, updateTag: function(t2, e2, n2) {
  return t2;
}, captureMetaData: false, maxNestedTags: 100, strictReservedNames: true, jPath: true, onDangerousProperty: ae };
function le(t2, e2) {
  if ("string" != typeof t2) return;
  const n2 = t2.toLowerCase();
  if (se.some(((t3) => n2 === t3.toLowerCase()))) throw new Error(`[SECURITY] Invalid ${e2}: "${t2}" is a reserved JavaScript keyword that could cause prototype pollution`);
  if (oe.some(((t3) => n2 === t3.toLowerCase()))) throw new Error(`[SECURITY] Invalid ${e2}: "${t2}" is a reserved JavaScript keyword that could cause prototype pollution`);
}
function ue(t2, e2) {
  return "boolean" == typeof t2 ? { enabled: t2, maxEntitySize: 1e4, maxExpansionDepth: 1e4, maxTotalExpansions: 1 / 0, maxExpandedLength: 1e5, maxEntityCount: 1e3, allowedTags: null, tagFilter: null, appliesTo: "all" } : "object" == typeof t2 && null !== t2 ? { enabled: false !== t2.enabled, maxEntitySize: Math.max(1, t2.maxEntitySize ?? 1e4), maxExpansionDepth: Math.max(1, t2.maxExpansionDepth ?? 1e4), maxTotalExpansions: Math.max(1, t2.maxTotalExpansions ?? 1 / 0), maxExpandedLength: Math.max(1, t2.maxExpandedLength ?? 1e5), maxEntityCount: Math.max(1, t2.maxEntityCount ?? 1e3), allowedTags: t2.allowedTags ?? null, tagFilter: t2.tagFilter ?? null, appliesTo: t2.appliesTo ?? "all" } : ue(true);
}
var ce = function(t2) {
  const e2 = Object.assign({}, he, t2), n2 = [{ value: e2.attributeNamePrefix, name: "attributeNamePrefix" }, { value: e2.attributesGroupName, name: "attributesGroupName" }, { value: e2.textNodeName, name: "textNodeName" }, { value: e2.cdataPropName, name: "cdataPropName" }, { value: e2.commentPropName, name: "commentPropName" }];
  for (const { value: t3, name: e3 } of n2) t3 && le(t3, e3);
  return null === e2.onDangerousProperty && (e2.onDangerousProperty = ae), e2.processEntities = ue(e2.processEntities, e2.htmlEntities), e2.unpairedTagsSet = new Set(e2.unpairedTags), e2.stopNodes && Array.isArray(e2.stopNodes) && (e2.stopNodes = e2.stopNodes.map(((t3) => "string" == typeof t3 && t3.startsWith("*.") ? ".." + t3.substring(2) : t3))), e2;
};
var pe;
pe = "function" != typeof Symbol ? "@@xmlMetadata" : Symbol("XML Node Metadata");
var fe = class {
  constructor(t2) {
    this.tagname = t2, this.child = [], this[":@"] = /* @__PURE__ */ Object.create(null);
  }
  add(t2, e2) {
    "__proto__" === t2 && (t2 = "#__proto__"), this.child.push({ [t2]: e2 });
  }
  addChild(t2, e2) {
    "__proto__" === t2.tagname && (t2.tagname = "#__proto__"), t2[":@"] && Object.keys(t2[":@"]).length > 0 ? this.child.push({ [t2.tagname]: t2.child, ":@": t2[":@"] }) : this.child.push({ [t2.tagname]: t2.child }), void 0 !== e2 && (this.child[this.child.length - 1][pe] = { startIndex: e2 });
  }
  static getMetaDataSymbol() {
    return pe;
  }
};
var de = class {
  constructor(t2) {
    this.suppressValidationErr = !t2, this.options = t2;
  }
  readDocType(t2, e2) {
    const n2 = /* @__PURE__ */ Object.create(null);
    let r2 = 0;
    if ("O" !== t2[e2 + 3] || "C" !== t2[e2 + 4] || "T" !== t2[e2 + 5] || "Y" !== t2[e2 + 6] || "P" !== t2[e2 + 7] || "E" !== t2[e2 + 8]) throw new Error("Invalid Tag instead of DOCTYPE");
    {
      e2 += 9;
      let i2 = 1, s2 = false, o2 = false, a2 = "";
      for (; e2 < t2.length; e2++) if ("<" !== t2[e2] || o2) if (">" === t2[e2]) {
        if (o2 ? "-" === t2[e2 - 1] && "-" === t2[e2 - 2] && (o2 = false, i2--) : i2--, 0 === i2) break;
      } else "[" === t2[e2] ? s2 = true : a2 += t2[e2];
      else {
        if (s2 && me(t2, "!ENTITY", e2)) {
          let i3, s3;
          if (e2 += 7, [i3, s3, e2] = this.readEntityExp(t2, e2 + 1, this.suppressValidationErr), -1 === s3.indexOf("&")) {
            if (false !== this.options.enabled && null != this.options.maxEntityCount && r2 >= this.options.maxEntityCount) throw new Error(`Entity count (${r2 + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`);
            n2[i3] = s3, r2++;
          }
        } else if (s2 && me(t2, "!ELEMENT", e2)) {
          e2 += 8;
          const { index: n3 } = this.readElementExp(t2, e2 + 1);
          e2 = n3;
        } else if (s2 && me(t2, "!ATTLIST", e2)) e2 += 8;
        else if (s2 && me(t2, "!NOTATION", e2)) {
          e2 += 9;
          const { index: n3 } = this.readNotationExp(t2, e2 + 1, this.suppressValidationErr);
          e2 = n3;
        } else {
          if (!me(t2, "!--", e2)) throw new Error("Invalid DOCTYPE");
          o2 = true;
        }
        i2++, a2 = "";
      }
      if (0 !== i2) throw new Error("Unclosed DOCTYPE");
    }
    return { entities: n2, i: e2 };
  }
  readEntityExp(t2, e2) {
    const n2 = e2 = ge(t2, e2);
    for (; e2 < t2.length && !/\s/.test(t2[e2]) && '"' !== t2[e2] && "'" !== t2[e2]; ) e2++;
    let r2 = t2.substring(n2, e2);
    if (ye(r2), e2 = ge(t2, e2), !this.suppressValidationErr) {
      if ("SYSTEM" === t2.substring(e2, e2 + 6).toUpperCase()) throw new Error("External entities are not supported");
      if ("%" === t2[e2]) throw new Error("Parameter entities are not supported");
    }
    let i2 = "";
    if ([e2, i2] = this.readIdentifierVal(t2, e2, "entity"), false !== this.options.enabled && null != this.options.maxEntitySize && i2.length > this.options.maxEntitySize) throw new Error(`Entity "${r2}" size (${i2.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`);
    return [r2, i2, --e2];
  }
  readNotationExp(t2, e2) {
    const n2 = e2 = ge(t2, e2);
    for (; e2 < t2.length && !/\s/.test(t2[e2]); ) e2++;
    let r2 = t2.substring(n2, e2);
    !this.suppressValidationErr && ye(r2), e2 = ge(t2, e2);
    const i2 = t2.substring(e2, e2 + 6).toUpperCase();
    if (!this.suppressValidationErr && "SYSTEM" !== i2 && "PUBLIC" !== i2) throw new Error(`Expected SYSTEM or PUBLIC, found "${i2}"`);
    e2 += i2.length, e2 = ge(t2, e2);
    let s2 = null, o2 = null;
    if ("PUBLIC" === i2) [e2, s2] = this.readIdentifierVal(t2, e2, "publicIdentifier"), '"' !== t2[e2 = ge(t2, e2)] && "'" !== t2[e2] || ([e2, o2] = this.readIdentifierVal(t2, e2, "systemIdentifier"));
    else if ("SYSTEM" === i2 && ([e2, o2] = this.readIdentifierVal(t2, e2, "systemIdentifier"), !this.suppressValidationErr && !o2)) throw new Error("Missing mandatory system identifier for SYSTEM notation");
    return { notationName: r2, publicIdentifier: s2, systemIdentifier: o2, index: --e2 };
  }
  readIdentifierVal(t2, e2, n2) {
    let r2 = "";
    const i2 = t2[e2];
    if ('"' !== i2 && "'" !== i2) throw new Error(`Expected quoted string, found "${i2}"`);
    const s2 = ++e2;
    for (; e2 < t2.length && t2[e2] !== i2; ) e2++;
    if (r2 = t2.substring(s2, e2), t2[e2] !== i2) throw new Error(`Unterminated ${n2} value`);
    return [++e2, r2];
  }
  readElementExp(t2, e2) {
    const n2 = e2 = ge(t2, e2);
    for (; e2 < t2.length && !/\s/.test(t2[e2]); ) e2++;
    let r2 = t2.substring(n2, e2);
    if (!this.suppressValidationErr && !ie(r2)) throw new Error(`Invalid element name: "${r2}"`);
    let i2 = "";
    if ("E" === t2[e2 = ge(t2, e2)] && me(t2, "MPTY", e2)) e2 += 4;
    else if ("A" === t2[e2] && me(t2, "NY", e2)) e2 += 2;
    else if ("(" === t2[e2]) {
      const n3 = ++e2;
      for (; e2 < t2.length && ")" !== t2[e2]; ) e2++;
      if (i2 = t2.substring(n3, e2), ")" !== t2[e2]) throw new Error("Unterminated content model");
    } else if (!this.suppressValidationErr) throw new Error(`Invalid Element Expression, found "${t2[e2]}"`);
    return { elementName: r2, contentModel: i2.trim(), index: e2 };
  }
  readAttlistExp(t2, e2) {
    let n2 = e2 = ge(t2, e2);
    for (; e2 < t2.length && !/\s/.test(t2[e2]); ) e2++;
    let r2 = t2.substring(n2, e2);
    for (ye(r2), n2 = e2 = ge(t2, e2); e2 < t2.length && !/\s/.test(t2[e2]); ) e2++;
    let i2 = t2.substring(n2, e2);
    if (!ye(i2)) throw new Error(`Invalid attribute name: "${i2}"`);
    e2 = ge(t2, e2);
    let s2 = "";
    if ("NOTATION" === t2.substring(e2, e2 + 8).toUpperCase()) {
      if (s2 = "NOTATION", "(" !== t2[e2 = ge(t2, e2 += 8)]) throw new Error(`Expected '(', found "${t2[e2]}"`);
      e2++;
      let n3 = [];
      for (; e2 < t2.length && ")" !== t2[e2]; ) {
        const r3 = e2;
        for (; e2 < t2.length && "|" !== t2[e2] && ")" !== t2[e2]; ) e2++;
        let i3 = t2.substring(r3, e2);
        if (i3 = i3.trim(), !ye(i3)) throw new Error(`Invalid notation name: "${i3}"`);
        n3.push(i3), "|" === t2[e2] && (e2++, e2 = ge(t2, e2));
      }
      if (")" !== t2[e2]) throw new Error("Unterminated list of notations");
      e2++, s2 += " (" + n3.join("|") + ")";
    } else {
      const n3 = e2;
      for (; e2 < t2.length && !/\s/.test(t2[e2]); ) e2++;
      s2 += t2.substring(n3, e2);
      const r3 = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
      if (!this.suppressValidationErr && !r3.includes(s2.toUpperCase())) throw new Error(`Invalid attribute type: "${s2}"`);
    }
    e2 = ge(t2, e2);
    let o2 = "";
    return "#REQUIRED" === t2.substring(e2, e2 + 8).toUpperCase() ? (o2 = "#REQUIRED", e2 += 8) : "#IMPLIED" === t2.substring(e2, e2 + 7).toUpperCase() ? (o2 = "#IMPLIED", e2 += 7) : [e2, o2] = this.readIdentifierVal(t2, e2, "ATTLIST"), { elementName: r2, attributeName: i2, attributeType: s2, defaultValue: o2, index: e2 };
  }
};
var ge = (t2, e2) => {
  for (; e2 < t2.length && /\s/.test(t2[e2]); ) e2++;
  return e2;
};
function me(t2, e2, n2) {
  for (let r2 = 0; r2 < e2.length; r2++) if (e2[r2] !== t2[n2 + r2 + 1]) return false;
  return true;
}
function ye(t2) {
  if (ie(t2)) return t2;
  throw new Error(`Invalid entity name ${t2}`);
}
var be = /^[-+]?0x[a-fA-F0-9]+$/;
var ve = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
var we = { hex: true, leadingZeros: true, decimalPoint: ".", eNotation: true, infinity: "original" };
var xe = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
var Ne = class {
  constructor(t2) {
    this._matcher = t2;
  }
  get separator() {
    return this._matcher.separator;
  }
  getCurrentTag() {
    const t2 = this._matcher.path;
    return t2.length > 0 ? t2[t2.length - 1].tag : void 0;
  }
  getCurrentNamespace() {
    const t2 = this._matcher.path;
    return t2.length > 0 ? t2[t2.length - 1].namespace : void 0;
  }
  getAttrValue(t2) {
    const e2 = this._matcher.path;
    if (0 !== e2.length) return e2[e2.length - 1].values?.[t2];
  }
  hasAttr(t2) {
    const e2 = this._matcher.path;
    if (0 === e2.length) return false;
    const n2 = e2[e2.length - 1];
    return void 0 !== n2.values && t2 in n2.values;
  }
  getPosition() {
    const t2 = this._matcher.path;
    return 0 === t2.length ? -1 : t2[t2.length - 1].position ?? 0;
  }
  getCounter() {
    const t2 = this._matcher.path;
    return 0 === t2.length ? -1 : t2[t2.length - 1].counter ?? 0;
  }
  getIndex() {
    return this.getPosition();
  }
  getDepth() {
    return this._matcher.path.length;
  }
  toString(t2) {
    let e2 = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
    return this._matcher.toString(t2, e2);
  }
  toArray() {
    return this._matcher.path.map(((t2) => t2.tag));
  }
  matches(t2) {
    return this._matcher.matches(t2);
  }
  matchesAny(t2) {
    return t2.matchesAny(this._matcher);
  }
};
var Ee = class {
  constructor() {
    let t2 = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    this.separator = t2.separator || ".", this.path = [], this.siblingStacks = [], this._pathStringCache = null, this._view = new Ne(this);
  }
  push(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : null, n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : null;
    this._pathStringCache = null, this.path.length > 0 && (this.path[this.path.length - 1].values = void 0);
    const r2 = this.path.length;
    this.siblingStacks[r2] || (this.siblingStacks[r2] = /* @__PURE__ */ new Map());
    const i2 = this.siblingStacks[r2], s2 = n2 ? `${n2}:${t2}` : t2, o2 = i2.get(s2) || 0;
    let a2 = 0;
    for (const t3 of i2.values()) a2 += t3;
    i2.set(s2, o2 + 1);
    const h2 = { tag: t2, position: a2, counter: o2 };
    null != n2 && (h2.namespace = n2), null != e2 && (h2.values = e2), this.path.push(h2);
  }
  pop() {
    if (0 === this.path.length) return;
    this._pathStringCache = null;
    const t2 = this.path.pop();
    return this.siblingStacks.length > this.path.length + 1 && (this.siblingStacks.length = this.path.length + 1), t2;
  }
  updateCurrent(t2) {
    if (this.path.length > 0) {
      const e2 = this.path[this.path.length - 1];
      null != t2 && (e2.values = t2);
    }
  }
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
  }
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
  }
  getAttrValue(t2) {
    if (0 !== this.path.length) return this.path[this.path.length - 1].values?.[t2];
  }
  hasAttr(t2) {
    if (0 === this.path.length) return false;
    const e2 = this.path[this.path.length - 1];
    return void 0 !== e2.values && t2 in e2.values;
  }
  getPosition() {
    return 0 === this.path.length ? -1 : this.path[this.path.length - 1].position ?? 0;
  }
  getCounter() {
    return 0 === this.path.length ? -1 : this.path[this.path.length - 1].counter ?? 0;
  }
  getIndex() {
    return this.getPosition();
  }
  getDepth() {
    return this.path.length;
  }
  toString(t2) {
    let e2 = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
    const n2 = t2 || this.separator;
    if (n2 === this.separator && true === e2) {
      if (null !== this._pathStringCache) return this._pathStringCache;
      const t3 = this.path.map(((t4) => t4.namespace ? `${t4.namespace}:${t4.tag}` : t4.tag)).join(n2);
      return this._pathStringCache = t3, t3;
    }
    return this.path.map(((t3) => e2 && t3.namespace ? `${t3.namespace}:${t3.tag}` : t3.tag)).join(n2);
  }
  toArray() {
    return this.path.map(((t2) => t2.tag));
  }
  reset() {
    this._pathStringCache = null, this.path = [], this.siblingStacks = [];
  }
  matches(t2) {
    const e2 = t2.segments;
    return 0 !== e2.length && (t2.hasDeepWildcard() ? this._matchWithDeepWildcard(e2) : this._matchSimple(e2));
  }
  _matchSimple(t2) {
    if (this.path.length !== t2.length) return false;
    for (let e2 = 0; e2 < t2.length; e2++) if (!this._matchSegment(t2[e2], this.path[e2], e2 === this.path.length - 1)) return false;
    return true;
  }
  _matchWithDeepWildcard(t2) {
    let e2 = this.path.length - 1, n2 = t2.length - 1;
    for (; n2 >= 0 && e2 >= 0; ) {
      const r2 = t2[n2];
      if ("deep-wildcard" === r2.type) {
        if (n2--, n2 < 0) return true;
        const r3 = t2[n2];
        let i2 = false;
        for (let t3 = e2; t3 >= 0; t3--) if (this._matchSegment(r3, this.path[t3], t3 === this.path.length - 1)) {
          e2 = t3 - 1, n2--, i2 = true;
          break;
        }
        if (!i2) return false;
      } else {
        if (!this._matchSegment(r2, this.path[e2], e2 === this.path.length - 1)) return false;
        e2--, n2--;
      }
    }
    return n2 < 0;
  }
  _matchSegment(t2, e2, n2) {
    if ("*" !== t2.tag && t2.tag !== e2.tag) return false;
    if (void 0 !== t2.namespace && "*" !== t2.namespace && t2.namespace !== e2.namespace) return false;
    if (void 0 !== t2.attrName) {
      if (!n2) return false;
      if (!e2.values || !(t2.attrName in e2.values)) return false;
      if (void 0 !== t2.attrValue && String(e2.values[t2.attrName]) !== String(t2.attrValue)) return false;
    }
    if (void 0 !== t2.position) {
      if (!n2) return false;
      const r2 = e2.counter ?? 0;
      if ("first" === t2.position && 0 !== r2) return false;
      if ("odd" === t2.position && r2 % 2 != 1) return false;
      if ("even" === t2.position && r2 % 2 != 0) return false;
      if ("nth" === t2.position && r2 !== t2.positionValue) return false;
    }
    return true;
  }
  matchesAny(t2) {
    return t2.matchesAny(this);
  }
  snapshot() {
    return { path: this.path.map(((t2) => ({ ...t2 }))), siblingStacks: this.siblingStacks.map(((t2) => new Map(t2))) };
  }
  restore(t2) {
    this._pathStringCache = null, this.path = t2.path.map(((t3) => ({ ...t3 }))), this.siblingStacks = t2.siblingStacks.map(((t3) => new Map(t3)));
  }
  readOnly() {
    return this._view;
  }
};
var Ae = class {
  constructor(t2) {
    let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {}, n2 = arguments.length > 2 ? arguments[2] : void 0;
    this.pattern = t2, this.separator = e2.separator || ".", this.segments = this._parse(t2), this.data = n2, this._hasDeepWildcard = this.segments.some(((t3) => "deep-wildcard" === t3.type)), this._hasAttributeCondition = this.segments.some(((t3) => void 0 !== t3.attrName)), this._hasPositionSelector = this.segments.some(((t3) => void 0 !== t3.position));
  }
  _parse(t2) {
    const e2 = [];
    let n2 = 0, r2 = "";
    for (; n2 < t2.length; ) t2[n2] === this.separator ? n2 + 1 < t2.length && t2[n2 + 1] === this.separator ? (r2.trim() && (e2.push(this._parseSegment(r2.trim())), r2 = ""), e2.push({ type: "deep-wildcard" }), n2 += 2) : (r2.trim() && e2.push(this._parseSegment(r2.trim())), r2 = "", n2++) : (r2 += t2[n2], n2++);
    return r2.trim() && e2.push(this._parseSegment(r2.trim())), e2;
  }
  _parseSegment(t2) {
    const e2 = { type: "tag" };
    let n2 = null, r2 = t2;
    const i2 = t2.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
    if (i2 && (r2 = i2[1] + i2[3], i2[2])) {
      const t3 = i2[2].slice(1, -1);
      t3 && (n2 = t3);
    }
    let s2, o2, a2 = r2;
    if (r2.includes("::")) {
      const e3 = r2.indexOf("::");
      if (s2 = r2.substring(0, e3).trim(), a2 = r2.substring(e3 + 2).trim(), !s2) throw new Error(`Invalid namespace in pattern: ${t2}`);
    }
    let h2 = null;
    if (a2.includes(":")) {
      const t3 = a2.lastIndexOf(":"), e3 = a2.substring(0, t3).trim(), n3 = a2.substring(t3 + 1).trim();
      ["first", "last", "odd", "even"].includes(n3) || /^nth\(\d+\)$/.test(n3) ? (o2 = e3, h2 = n3) : o2 = a2;
    } else o2 = a2;
    if (!o2) throw new Error(`Invalid segment pattern: ${t2}`);
    if (e2.tag = o2, s2 && (e2.namespace = s2), n2) if (n2.includes("=")) {
      const t3 = n2.indexOf("=");
      e2.attrName = n2.substring(0, t3).trim(), e2.attrValue = n2.substring(t3 + 1).trim();
    } else e2.attrName = n2.trim();
    if (h2) {
      const t3 = h2.match(/^nth\((\d+)\)$/);
      t3 ? (e2.position = "nth", e2.positionValue = parseInt(t3[1], 10)) : e2.position = h2;
    }
    return e2;
  }
  get length() {
    return this.segments.length;
  }
  hasDeepWildcard() {
    return this._hasDeepWildcard;
  }
  hasAttributeCondition() {
    return this._hasAttributeCondition;
  }
  hasPositionSelector() {
    return this._hasPositionSelector;
  }
  toString() {
    return this.pattern;
  }
};
var Se = class {
  constructor() {
    this._byDepthAndTag = /* @__PURE__ */ new Map(), this._wildcardByDepth = /* @__PURE__ */ new Map(), this._deepWildcards = [], this._patterns = /* @__PURE__ */ new Set(), this._sealed = false;
  }
  add(t2) {
    if (this._sealed) throw new TypeError("ExpressionSet is sealed. Create a new ExpressionSet to add more expressions.");
    if (this._patterns.has(t2.pattern)) return this;
    if (this._patterns.add(t2.pattern), t2.hasDeepWildcard()) return this._deepWildcards.push(t2), this;
    const e2 = t2.length, n2 = t2.segments[t2.segments.length - 1], r2 = n2?.tag;
    if (r2 && "*" !== r2) {
      const n3 = `${e2}:${r2}`;
      this._byDepthAndTag.has(n3) || this._byDepthAndTag.set(n3, []), this._byDepthAndTag.get(n3).push(t2);
    } else this._wildcardByDepth.has(e2) || this._wildcardByDepth.set(e2, []), this._wildcardByDepth.get(e2).push(t2);
    return this;
  }
  addAll(t2) {
    for (const e2 of t2) this.add(e2);
    return this;
  }
  has(t2) {
    return this._patterns.has(t2.pattern);
  }
  get size() {
    return this._patterns.size;
  }
  seal() {
    return this._sealed = true, this;
  }
  get isSealed() {
    return this._sealed;
  }
  matchesAny(t2) {
    return null !== this.findMatch(t2);
  }
  findMatch(t2) {
    const e2 = t2.getDepth(), n2 = `${e2}:${t2.getCurrentTag()}`, r2 = this._byDepthAndTag.get(n2);
    if (r2) {
      for (let e3 = 0; e3 < r2.length; e3++) if (t2.matches(r2[e3])) return r2[e3];
    }
    const i2 = this._wildcardByDepth.get(e2);
    if (i2) {
      for (let e3 = 0; e3 < i2.length; e3++) if (t2.matches(i2[e3])) return i2[e3];
    }
    for (let e3 = 0; e3 < this._deepWildcards.length; e3++) if (t2.matches(this._deepWildcards[e3])) return this._deepWildcards[e3];
    return null;
  }
};
var Pe = { cent: "\xA2", pound: "\xA3", curren: "\xA4", yen: "\xA5", euro: "\u20AC", dollar: "$", euro: "\u20AC", fnof: "\u0192", inr: "\u20B9", af: "\u060B", birr: "\u1265\u122D", peso: "\u20B1", rub: "\u20BD", won: "\u20A9", yuan: "\xA5", cedil: "\xB8" };
var Te = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
var Oe = { nbsp: "\xA0", copy: "\xA9", reg: "\xAE", trade: "\u2122", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", laquo: "\xAB", raquo: "\xBB", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D", bull: "\u2022", para: "\xB6", sect: "\xA7", deg: "\xB0", frac12: "\xBD", frac14: "\xBC", frac34: "\xBE" };
var Ce = new Set("!?\\\\/[]$%{}^&*()<>|+");
function _e(t2) {
  if ("#" === t2[0]) throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${t2}"`);
  for (const e2 of t2) if (Ce.has(e2)) throw new Error(`[EntityReplacer] Invalid character '${e2}' in entity name: "${t2}"`);
  return t2;
}
function $e() {
  const t2 = /* @__PURE__ */ Object.create(null);
  for (var e2 = arguments.length, n2 = new Array(e2), r2 = 0; r2 < e2; r2++) n2[r2] = arguments[r2];
  for (const e3 of n2) if (e3) for (const n3 of Object.keys(e3)) {
    const r3 = e3[n3];
    if ("string" == typeof r3) t2[n3] = r3;
    else if (r3 && "object" == typeof r3 && void 0 !== r3.val) {
      const e4 = r3.val;
      "string" == typeof e4 && (t2[n3] = e4);
    }
  }
  return t2;
}
var je = "external";
var Ie = "base";
var Me = "all";
var Re = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
var ke = /* @__PURE__ */ new Set([9, 10, 13]);
var Le = class {
  constructor() {
    let t2 = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    var e2;
    this._limit = t2.limit || {}, this._maxTotalExpansions = this._limit.maxTotalExpansions || 0, this._maxExpandedLength = this._limit.maxExpandedLength || 0, this._postCheck = "function" == typeof t2.postCheck ? t2.postCheck : (t3) => t3, this._limitTiers = (e2 = this._limit.applyLimitsTo ?? je) && e2 !== je ? e2 === Me ? /* @__PURE__ */ new Set([Me]) : e2 === Ie ? /* @__PURE__ */ new Set([Ie]) : Array.isArray(e2) ? new Set(e2) : /* @__PURE__ */ new Set([je]) : /* @__PURE__ */ new Set([je]), this._numericAllowed = t2.numericAllowed ?? true, this._baseMap = $e(Te, t2.namedEntities || null), this._externalMap = /* @__PURE__ */ Object.create(null), this._inputMap = /* @__PURE__ */ Object.create(null), this._totalExpansions = 0, this._expandedLength = 0, this._removeSet = new Set(t2.remove && Array.isArray(t2.remove) ? t2.remove : []), this._leaveSet = new Set(t2.leave && Array.isArray(t2.leave) ? t2.leave : []);
    const n2 = (function(t3) {
      if (!t3) return { xmlVersion: 1, onLevel: Re.allow, nullLevel: Re.remove };
      const e3 = 1.1 === t3.xmlVersion ? 1.1 : 1, n3 = Re[t3.onNCR] ?? Re.allow, r2 = Re[t3.nullNCR] ?? Re.remove;
      return { xmlVersion: e3, onLevel: n3, nullLevel: Math.max(r2, Re.remove) };
    })(t2.ncr);
    this._ncrXmlVersion = n2.xmlVersion, this._ncrOnLevel = n2.onLevel, this._ncrNullLevel = n2.nullLevel;
  }
  setExternalEntities(t2) {
    if (t2) for (const e2 of Object.keys(t2)) _e(e2);
    this._externalMap = $e(t2);
  }
  addExternalEntity(t2, e2) {
    _e(t2), "string" == typeof e2 && -1 === e2.indexOf("&") && (this._externalMap[t2] = e2);
  }
  addInputEntities(t2) {
    this._totalExpansions = 0, this._expandedLength = 0, this._inputMap = $e(t2);
  }
  reset() {
    return this._inputMap = /* @__PURE__ */ Object.create(null), this._totalExpansions = 0, this._expandedLength = 0, this;
  }
  setXmlVersion(t2) {
    this._ncrXmlVersion = 1.1 === t2 ? 1.1 : 1;
  }
  decode(t2) {
    if ("string" != typeof t2 || 0 === t2.length) return t2;
    const e2 = t2, n2 = [], r2 = t2.length;
    let i2 = 0, s2 = 0;
    const o2 = this._maxTotalExpansions > 0, a2 = this._maxExpandedLength > 0, h2 = o2 || a2;
    for (; s2 < r2; ) {
      if (38 !== t2.charCodeAt(s2)) {
        s2++;
        continue;
      }
      let e3 = s2 + 1;
      for (; e3 < r2 && 59 !== t2.charCodeAt(e3) && e3 - s2 <= 32; ) e3++;
      if (e3 >= r2 || 59 !== t2.charCodeAt(e3)) {
        s2++;
        continue;
      }
      const l3 = t2.slice(s2 + 1, e3);
      if (0 === l3.length) {
        s2++;
        continue;
      }
      let u2, c2;
      if (this._removeSet.has(l3)) u2 = "", void 0 === c2 && (c2 = je);
      else {
        if (this._leaveSet.has(l3)) {
          s2++;
          continue;
        }
        if (35 === l3.charCodeAt(0)) {
          const t3 = this._resolveNCR(l3);
          if (void 0 === t3) {
            s2++;
            continue;
          }
          u2 = t3, c2 = Ie;
        } else {
          const t3 = this._resolveName(l3);
          u2 = t3?.value, c2 = t3?.tier;
        }
      }
      if (void 0 !== u2) {
        if (s2 > i2 && n2.push(t2.slice(i2, s2)), n2.push(u2), i2 = e3 + 1, s2 = i2, h2 && this._tierCounts(c2)) {
          if (o2 && (this._totalExpansions++, this._totalExpansions > this._maxTotalExpansions)) throw new Error(`[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`);
          if (a2) {
            const t3 = u2.length - (l3.length + 2);
            if (t3 > 0 && (this._expandedLength += t3, this._expandedLength > this._maxExpandedLength)) throw new Error(`[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`);
          }
        }
      } else s2++;
    }
    i2 < r2 && n2.push(t2.slice(i2));
    const l2 = 0 === n2.length ? t2 : n2.join("");
    return this._postCheck(l2, e2);
  }
  _tierCounts(t2) {
    return !!this._limitTiers.has(Me) || this._limitTiers.has(t2);
  }
  _resolveName(t2) {
    return t2 in this._inputMap ? { value: this._inputMap[t2], tier: je } : t2 in this._externalMap ? { value: this._externalMap[t2], tier: je } : t2 in this._baseMap ? { value: this._baseMap[t2], tier: Ie } : void 0;
  }
  _classifyNCR(t2) {
    return 0 === t2 ? this._ncrNullLevel : t2 >= 55296 && t2 <= 57343 || 1 === this._ncrXmlVersion && t2 >= 1 && t2 <= 31 && !ke.has(t2) ? Re.remove : -1;
  }
  _applyNCRAction(t2, e2, n2) {
    switch (t2) {
      case Re.allow:
        return String.fromCodePoint(n2);
      case Re.remove:
        return "";
      case Re.leave:
        return;
      case Re.throw:
        throw new Error(`[EntityDecoder] Prohibited numeric character reference &${e2}; (U+${n2.toString(16).toUpperCase().padStart(4, "0")})`);
      default:
        return String.fromCodePoint(n2);
    }
  }
  _resolveNCR(t2) {
    const e2 = t2.charCodeAt(1);
    let n2;
    if (n2 = 120 === e2 || 88 === e2 ? parseInt(t2.slice(2), 16) : parseInt(t2.slice(1), 10), Number.isNaN(n2) || n2 < 0 || n2 > 1114111) return;
    const r2 = this._classifyNCR(n2);
    if (!this._numericAllowed && r2 < Re.remove) return;
    const i2 = -1 === r2 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, r2);
    return this._applyNCRAction(i2, t2, n2);
  }
};
function De(t2, e2) {
  if (!t2) return {};
  const n2 = e2.attributesGroupName ? t2[e2.attributesGroupName] : t2;
  if (!n2) return {};
  const r2 = {};
  for (const t3 in n2) t3.startsWith(e2.attributeNamePrefix) ? r2[t3.substring(e2.attributeNamePrefix.length)] = n2[t3] : r2[t3] = n2[t3];
  return r2;
}
function Ue(t2) {
  if (!t2 || "string" != typeof t2) return;
  const e2 = t2.indexOf(":");
  if (-1 !== e2 && e2 > 0) {
    const n2 = t2.substring(0, e2);
    if ("xmlns" !== n2) return n2;
  }
}
var Fe = class {
  constructor(t2, e2) {
    var n2;
    this.options = t2, this.currentNode = null, this.tagsNodeStack = [], this.parseXml = ze, this.parseTextData = Ve, this.resolveNameSpace = We, this.buildAttributesMap = Ge, this.isItStopNode = Xe, this.replaceEntitiesValue = He, this.readStopNodeData = Qe, this.saveTextToParentTag = Ye, this.addChild = qe, this.ignoreAttributesFn = "function" == typeof (n2 = this.options.ignoreAttributes) ? n2 : Array.isArray(n2) ? (t3) => {
      for (const e3 of n2) {
        if ("string" == typeof e3 && t3 === e3) return true;
        if (e3 instanceof RegExp && e3.test(t3)) return true;
      }
    } : () => false, this.entityExpansionCount = 0, this.currentExpandedLength = 0;
    let r2 = { ...Te };
    this.options.entityDecoder ? this.entityDecoder = this.options.entityDecoder : ("object" == typeof this.options.htmlEntities ? r2 = this.options.htmlEntities : true === this.options.htmlEntities && (r2 = { ...Oe, ...Pe }), this.entityDecoder = new Le({ namedEntities: { ...r2, ...e2 }, numericAllowed: this.options.htmlEntities, limit: { maxTotalExpansions: this.options.processEntities.maxTotalExpansions, maxExpandedLength: this.options.processEntities.maxExpandedLength, applyLimitsTo: this.options.processEntities.appliesTo } })), this.matcher = new Ee(), this.readonlyMatcher = this.matcher.readOnly(), this.isCurrentNodeStopNode = false, this.stopNodeExpressionsSet = new Se();
    const i2 = this.options.stopNodes;
    if (i2 && i2.length > 0) {
      for (let t3 = 0; t3 < i2.length; t3++) {
        const e3 = i2[t3];
        "string" == typeof e3 ? this.stopNodeExpressionsSet.add(new Ae(e3)) : e3 instanceof Ae && this.stopNodeExpressionsSet.add(e3);
      }
      this.stopNodeExpressionsSet.seal();
    }
  }
};
function Ve(t2, e2, n2, r2, i2, s2, o2) {
  const a2 = this.options;
  if (void 0 !== t2 && (a2.trimValues && !r2 && (t2 = t2.trim()), t2.length > 0)) {
    o2 || (t2 = this.replaceEntitiesValue(t2, e2, n2));
    const r3 = a2.jPath ? n2.toString() : n2, h2 = a2.tagValueProcessor(e2, t2, r3, i2, s2);
    return null == h2 ? t2 : typeof h2 != typeof t2 || h2 !== t2 ? h2 : a2.trimValues || t2.trim() === t2 ? tn(t2, a2.parseTagValue, a2.numberParseOptions) : t2;
  }
}
function We(t2) {
  if (this.options.removeNSPrefix) {
    const e2 = t2.split(":"), n2 = "/" === t2.charAt(0) ? "/" : "";
    if ("xmlns" === e2[0]) return "";
    2 === e2.length && (t2 = n2 + e2[1]);
  }
  return t2;
}
var Be = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function Ge(t2, e2, n2) {
  let r2 = arguments.length > 3 && void 0 !== arguments[3] && arguments[3];
  const i2 = this.options;
  if (true === r2 || true !== i2.ignoreAttributes && "string" == typeof t2) {
    const r3 = re(t2, Be), s2 = r3.length, o2 = {}, a2 = new Array(s2);
    let h2 = false;
    const l2 = {};
    for (let t3 = 0; t3 < s2; t3++) {
      const e3 = this.resolveNameSpace(r3[t3][1]), s3 = r3[t3][4];
      if (e3.length && void 0 !== s3) {
        let r4 = s3;
        i2.trimValues && (r4 = r4.trim()), r4 = this.replaceEntitiesValue(r4, n2, this.readonlyMatcher), a2[t3] = r4, l2[e3] = r4, h2 = true;
      }
    }
    h2 && "object" == typeof e2 && e2.updateCurrent && e2.updateCurrent(l2);
    const u2 = i2.jPath ? e2.toString() : this.readonlyMatcher;
    let c2 = false;
    for (let t3 = 0; t3 < s2; t3++) {
      const e3 = this.resolveNameSpace(r3[t3][1]);
      if (this.ignoreAttributesFn(e3, u2)) continue;
      let n3 = i2.attributeNamePrefix + e3;
      if (e3.length) if (i2.transformAttributeName && (n3 = i2.transformAttributeName(n3)), n3 = nn(n3, i2), void 0 !== r3[t3][4]) {
        const r4 = a2[t3], s3 = i2.attributeValueProcessor(e3, r4, u2);
        o2[n3] = null == s3 ? r4 : typeof s3 != typeof r4 || s3 !== r4 ? s3 : tn(r4, i2.parseAttributeValue, i2.numberParseOptions), c2 = true;
      } else i2.allowBooleanAttributes && (o2[n3] = true, c2 = true);
    }
    if (!c2) return;
    if (i2.attributesGroupName && !i2.preserveOrder) {
      const t3 = {};
      return t3[i2.attributesGroupName] = o2, t3;
    }
    return o2;
  }
}
var ze = function(t2) {
  t2 = t2.replace(/\r\n?/g, "\n");
  const e2 = new fe("!xml");
  let n2 = e2, r2 = "";
  this.matcher.reset(), this.entityDecoder.reset(), this.entityExpansionCount = 0, this.currentExpandedLength = 0;
  const i2 = this.options, s2 = new de(i2.processEntities), o2 = t2.length;
  for (let a2 = 0; a2 < o2; a2++) if ("<" === t2[a2]) {
    const h2 = t2.charCodeAt(a2 + 1);
    if (47 === h2) {
      const e3 = Ze(t2, ">", a2, "Closing Tag is not closed.");
      let s3 = t2.substring(a2 + 2, e3).trim();
      if (i2.removeNSPrefix) {
        const t3 = s3.indexOf(":");
        -1 !== t3 && (s3 = s3.substr(t3 + 1));
      }
      s3 = en(i2.transformTagName, s3, "", i2).tagName, n2 && (r2 = this.saveTextToParentTag(r2, n2, this.readonlyMatcher));
      const o3 = this.matcher.getCurrentTag();
      if (s3 && i2.unpairedTagsSet.has(s3)) throw new Error(`Unpaired tag can not be used as closing tag: </${s3}>`);
      o3 && i2.unpairedTagsSet.has(o3) && (this.matcher.pop(), this.tagsNodeStack.pop()), this.matcher.pop(), this.isCurrentNodeStopNode = false, n2 = this.tagsNodeStack.pop(), r2 = "", a2 = e3;
    } else if (63 === h2) {
      let e3 = Ke(t2, a2, false, "?>");
      if (!e3) throw new Error("Pi Tag is not closed.");
      r2 = this.saveTextToParentTag(r2, n2, this.readonlyMatcher);
      const s3 = this.buildAttributesMap(e3.tagExp, this.matcher, e3.tagName, true);
      if (s3) {
        const t3 = s3[this.options.attributeNamePrefix + "version"];
        this.entityDecoder.setXmlVersion(Number(t3) || 1);
      }
      if (i2.ignoreDeclaration && "?xml" === e3.tagName || i2.ignorePiTags) ;
      else {
        const t3 = new fe(e3.tagName);
        t3.add(i2.textNodeName, ""), e3.tagName !== e3.tagExp && e3.attrExpPresent && true !== i2.ignoreAttributes && (t3[":@"] = s3), this.addChild(n2, t3, this.readonlyMatcher, a2);
      }
      a2 = e3.closeIndex + 1;
    } else if (33 === h2 && 45 === t2.charCodeAt(a2 + 2) && 45 === t2.charCodeAt(a2 + 3)) {
      const e3 = Ze(t2, "-->", a2 + 4, "Comment is not closed.");
      if (i2.commentPropName) {
        const s3 = t2.substring(a2 + 4, e3 - 2);
        r2 = this.saveTextToParentTag(r2, n2, this.readonlyMatcher), n2.add(i2.commentPropName, [{ [i2.textNodeName]: s3 }]);
      }
      a2 = e3;
    } else if (33 === h2 && 68 === t2.charCodeAt(a2 + 2)) {
      const e3 = s2.readDocType(t2, a2);
      this.entityDecoder.addInputEntities(e3.entities), a2 = e3.i;
    } else if (33 === h2 && 91 === t2.charCodeAt(a2 + 2)) {
      const e3 = Ze(t2, "]]>", a2, "CDATA is not closed.") - 2, s3 = t2.substring(a2 + 9, e3);
      r2 = this.saveTextToParentTag(r2, n2, this.readonlyMatcher);
      let o3 = this.parseTextData(s3, n2.tagname, this.readonlyMatcher, true, false, true, true);
      null == o3 && (o3 = ""), i2.cdataPropName ? n2.add(i2.cdataPropName, [{ [i2.textNodeName]: s3 }]) : n2.add(i2.textNodeName, o3), a2 = e3 + 2;
    } else {
      let s3 = Ke(t2, a2, i2.removeNSPrefix);
      if (!s3) {
        const e3 = t2.substring(Math.max(0, a2 - 50), Math.min(o2, a2 + 50));
        throw new Error(`readTagExp returned undefined at position ${a2}. Context: "${e3}"`);
      }
      let h3 = s3.tagName;
      const l2 = s3.rawTagName;
      let u2 = s3.tagExp, c2 = s3.attrExpPresent, p2 = s3.closeIndex;
      if ({ tagName: h3, tagExp: u2 } = en(i2.transformTagName, h3, u2, i2), i2.strictReservedNames && (h3 === i2.commentPropName || h3 === i2.cdataPropName || h3 === i2.textNodeName || h3 === i2.attributesGroupName)) throw new Error(`Invalid tag name: ${h3}`);
      n2 && r2 && "!xml" !== n2.tagname && (r2 = this.saveTextToParentTag(r2, n2, this.readonlyMatcher, false));
      const f2 = n2;
      f2 && i2.unpairedTagsSet.has(f2.tagname) && (n2 = this.tagsNodeStack.pop(), this.matcher.pop());
      let d2 = false;
      u2.length > 0 && u2.lastIndexOf("/") === u2.length - 1 && (d2 = true, "/" === h3[h3.length - 1] ? (h3 = h3.substr(0, h3.length - 1), u2 = h3) : u2 = u2.substr(0, u2.length - 1), c2 = h3 !== u2);
      let g2, m2 = null, y2 = {};
      g2 = Ue(l2), h3 !== e2.tagname && this.matcher.push(h3, {}, g2), h3 !== u2 && c2 && (m2 = this.buildAttributesMap(u2, this.matcher, h3), m2 && (y2 = De(m2, i2))), h3 !== e2.tagname && (this.isCurrentNodeStopNode = this.isItStopNode());
      const b2 = a2;
      if (this.isCurrentNodeStopNode) {
        let e3 = "";
        if (d2) a2 = s3.closeIndex;
        else if (i2.unpairedTagsSet.has(h3)) a2 = s3.closeIndex;
        else {
          const n3 = this.readStopNodeData(t2, l2, p2 + 1);
          if (!n3) throw new Error(`Unexpected end of ${l2}`);
          a2 = n3.i, e3 = n3.tagContent;
        }
        const r3 = new fe(h3);
        m2 && (r3[":@"] = m2), r3.add(i2.textNodeName, e3), this.matcher.pop(), this.isCurrentNodeStopNode = false, this.addChild(n2, r3, this.readonlyMatcher, b2);
      } else {
        if (d2) {
          ({ tagName: h3, tagExp: u2 } = en(i2.transformTagName, h3, u2, i2));
          const t3 = new fe(h3);
          m2 && (t3[":@"] = m2), this.addChild(n2, t3, this.readonlyMatcher, b2), this.matcher.pop(), this.isCurrentNodeStopNode = false;
        } else {
          if (i2.unpairedTagsSet.has(h3)) {
            const t3 = new fe(h3);
            m2 && (t3[":@"] = m2), this.addChild(n2, t3, this.readonlyMatcher, b2), this.matcher.pop(), this.isCurrentNodeStopNode = false, a2 = s3.closeIndex;
            continue;
          }
          {
            const t3 = new fe(h3);
            if (this.tagsNodeStack.length > i2.maxNestedTags) throw new Error("Maximum nested tags exceeded");
            this.tagsNodeStack.push(n2), m2 && (t3[":@"] = m2), this.addChild(n2, t3, this.readonlyMatcher, b2), n2 = t3;
          }
        }
        r2 = "", a2 = p2;
      }
    }
  } else r2 += t2[a2];
  return e2.child;
};
function qe(t2, e2, n2, r2) {
  this.options.captureMetaData || (r2 = void 0);
  const i2 = this.options.jPath ? n2.toString() : n2, s2 = this.options.updateTag(e2.tagname, i2, e2[":@"]);
  false === s2 || ("string" == typeof s2 ? (e2.tagname = s2, t2.addChild(e2, r2)) : t2.addChild(e2, r2));
}
function He(t2, e2, n2) {
  const r2 = this.options.processEntities;
  if (!r2 || !r2.enabled) return t2;
  if (r2.allowedTags) {
    const i2 = this.options.jPath ? n2.toString() : n2;
    if (!(Array.isArray(r2.allowedTags) ? r2.allowedTags.includes(e2) : r2.allowedTags(e2, i2))) return t2;
  }
  if (r2.tagFilter) {
    const i2 = this.options.jPath ? n2.toString() : n2;
    if (!r2.tagFilter(e2, i2)) return t2;
  }
  return this.entityDecoder.decode(t2);
}
function Ye(t2, e2, n2, r2) {
  return t2 && (void 0 === r2 && (r2 = 0 === e2.child.length), void 0 !== (t2 = this.parseTextData(t2, e2.tagname, n2, false, !!e2[":@"] && 0 !== Object.keys(e2[":@"]).length, r2)) && "" !== t2 && e2.add(this.options.textNodeName, t2), t2 = ""), t2;
}
function Xe() {
  return 0 !== this.stopNodeExpressionsSet.size && this.matcher.matchesAny(this.stopNodeExpressionsSet);
}
function Ze(t2, e2, n2, r2) {
  const i2 = t2.indexOf(e2, n2);
  if (-1 === i2) throw new Error(r2);
  return i2 + e2.length - 1;
}
function Je(t2, e2, n2, r2) {
  const i2 = t2.indexOf(e2, n2);
  if (-1 === i2) throw new Error(r2);
  return i2;
}
function Ke(t2, e2, n2) {
  const r2 = (function(t3, e3) {
    let n3 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ">", r3 = 0;
    const i3 = t3.length, s3 = n3.charCodeAt(0), o3 = n3.length > 1 ? n3.charCodeAt(1) : -1;
    let a3 = "", h3 = e3;
    for (let n4 = e3; n4 < i3; n4++) {
      const e4 = t3.charCodeAt(n4);
      if (r3) e4 === r3 && (r3 = 0);
      else if (34 === e4 || 39 === e4) r3 = e4;
      else if (e4 === s3) {
        if (-1 === o3) return a3 += t3.substring(h3, n4), { data: a3, index: n4 };
        if (t3.charCodeAt(n4 + 1) === o3) return a3 += t3.substring(h3, n4), { data: a3, index: n4 };
      } else 9 !== e4 || r3 || (a3 += t3.substring(h3, n4) + " ", h3 = n4 + 1);
    }
  })(t2, e2 + 1, arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : ">");
  if (!r2) return;
  let i2 = r2.data;
  const s2 = r2.index, o2 = i2.search(/\s/);
  let a2 = i2, h2 = true;
  -1 !== o2 && (a2 = i2.substring(0, o2), i2 = i2.substring(o2 + 1).trimStart());
  const l2 = a2;
  if (n2) {
    const t3 = a2.indexOf(":");
    -1 !== t3 && (a2 = a2.substr(t3 + 1), h2 = a2 !== r2.data.substr(t3 + 1));
  }
  return { tagName: a2, tagExp: i2, closeIndex: s2, attrExpPresent: h2, rawTagName: l2 };
}
function Qe(t2, e2, n2) {
  const r2 = n2;
  let i2 = 1;
  const s2 = t2.length;
  for (; n2 < s2; n2++) if ("<" === t2[n2]) {
    const s3 = t2.charCodeAt(n2 + 1);
    if (47 === s3) {
      const s4 = Je(t2, ">", n2, `${e2} is not closed`);
      if (t2.substring(n2 + 2, s4).trim() === e2 && (i2--, 0 === i2)) return { tagContent: t2.substring(r2, n2), i: s4 };
      n2 = s4;
    } else if (63 === s3) n2 = Ze(t2, "?>", n2 + 1, "StopNode is not closed.");
    else if (33 === s3 && 45 === t2.charCodeAt(n2 + 2) && 45 === t2.charCodeAt(n2 + 3)) n2 = Ze(t2, "-->", n2 + 3, "StopNode is not closed.");
    else if (33 === s3 && 91 === t2.charCodeAt(n2 + 2)) n2 = Ze(t2, "]]>", n2, "StopNode is not closed.") - 2;
    else {
      const r3 = Ke(t2, n2, ">");
      r3 && ((r3 && r3.tagName) === e2 && "/" !== r3.tagExp[r3.tagExp.length - 1] && i2++, n2 = r3.closeIndex);
    }
  }
}
function tn(t2, e2, n2) {
  if (e2 && "string" == typeof t2) {
    const e3 = t2.trim();
    return "true" === e3 || "false" !== e3 && (function(t3) {
      let e4 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
      if (e4 = Object.assign({}, we, e4), !t3 || "string" != typeof t3) return t3;
      let n3 = t3.trim();
      if (0 === n3.length) return t3;
      if (void 0 !== e4.skipLike && e4.skipLike.test(n3)) return t3;
      if ("0" === n3) return 0;
      if (e4.hex && be.test(n3)) return (function(t4) {
        if (parseInt) return parseInt(t4, 16);
        if (Number.parseInt) return Number.parseInt(t4, 16);
        if (window && window.parseInt) return window.parseInt(t4, 16);
        throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
      })(n3);
      if (isFinite(n3)) {
        if (n3.includes("e") || n3.includes("E")) return (function(t4, e5, n4) {
          if (!n4.eNotation) return t4;
          const r3 = e5.match(xe);
          if (r3) {
            let i2 = r3[1] || "";
            const s2 = -1 === r3[3].indexOf("e") ? "E" : "e", o2 = r3[2], a2 = i2 ? t4[o2.length + 1] === s2 : t4[o2.length] === s2;
            return o2.length > 1 && a2 ? t4 : (1 !== o2.length || !r3[3].startsWith(`.${s2}`) && r3[3][0] !== s2) && o2.length > 0 ? n4.leadingZeros && !a2 ? (e5 = (r3[1] || "") + r3[3], Number(e5)) : t4 : Number(e5);
          }
          return t4;
        })(t3, n3, e4);
        {
          const i2 = ve.exec(n3);
          if (i2) {
            const s2 = i2[1] || "", o2 = i2[2];
            let a2 = (r2 = i2[3]) && -1 !== r2.indexOf(".") ? ("." === (r2 = r2.replace(/0+$/, "")) ? r2 = "0" : "." === r2[0] ? r2 = "0" + r2 : "." === r2[r2.length - 1] && (r2 = r2.substring(0, r2.length - 1)), r2) : r2;
            const h2 = s2 ? "." === t3[o2.length + 1] : "." === t3[o2.length];
            if (!e4.leadingZeros && (o2.length > 1 || 1 === o2.length && !h2)) return t3;
            {
              const r3 = Number(n3), i3 = String(r3);
              if (0 === r3) return r3;
              if (-1 !== i3.search(/[eE]/)) return e4.eNotation ? r3 : t3;
              if (-1 !== n3.indexOf(".")) return "0" === i3 || i3 === a2 || i3 === `${s2}${a2}` ? r3 : t3;
              let h3 = o2 ? a2 : n3;
              return o2 ? h3 === i3 || s2 + h3 === i3 ? r3 : t3 : h3 === i3 || h3 === s2 + i3 ? r3 : t3;
            }
          }
          return t3;
        }
      }
      var r2;
      return (function(t4, e5, n4) {
        const r3 = e5 === 1 / 0;
        switch (n4.infinity.toLowerCase()) {
          case "null":
            return null;
          case "infinity":
            return e5;
          case "string":
            return r3 ? "Infinity" : "-Infinity";
          default:
            return t4;
        }
      })(t3, Number(n3), e4);
    })(t2, n2);
  }
  return void 0 !== t2 ? t2 : "";
}
function en(t2, e2, n2, r2) {
  if (t2) {
    const r3 = t2(e2);
    n2 === e2 && (n2 = r3), e2 = r3;
  }
  return { tagName: e2 = nn(e2, r2), tagExp: n2 };
}
function nn(t2, e2) {
  if (oe.includes(t2)) throw new Error(`[SECURITY] Invalid name: "${t2}" is a reserved JavaScript keyword that could cause prototype pollution`);
  return se.includes(t2) ? e2.onDangerousProperty(t2) : t2;
}
var rn = fe.getMetaDataSymbol();
function sn(t2, e2) {
  if (!t2 || "object" != typeof t2) return {};
  if (!e2) return t2;
  const n2 = {};
  for (const r2 in t2) r2.startsWith(e2) ? n2[r2.substring(e2.length)] = t2[r2] : n2[r2] = t2[r2];
  return n2;
}
function on(t2, e2, n2, r2) {
  return an(t2, e2, n2, r2);
}
function an(t2, e2, n2, r2) {
  let i2;
  const s2 = {};
  for (let o2 = 0; o2 < t2.length; o2++) {
    const a2 = t2[o2], h2 = hn(a2);
    if (void 0 !== h2 && h2 !== e2.textNodeName) {
      const t3 = sn(a2[":@"] || {}, e2.attributeNamePrefix);
      n2.push(h2, t3);
    }
    if (h2 === e2.textNodeName) void 0 === i2 ? i2 = a2[h2] : i2 += "" + a2[h2];
    else {
      if (void 0 === h2) continue;
      if (a2[h2]) {
        let t3 = an(a2[h2], e2, n2, r2);
        const i3 = un(t3, e2);
        if (a2[":@"] ? ln(t3, a2[":@"], r2, e2) : 1 !== Object.keys(t3).length || void 0 === t3[e2.textNodeName] || e2.alwaysCreateTextNode ? 0 === Object.keys(t3).length && (e2.alwaysCreateTextNode ? t3[e2.textNodeName] = "" : t3 = "") : t3 = t3[e2.textNodeName], void 0 !== a2[rn] && "object" == typeof t3 && null !== t3 && (t3[rn] = a2[rn]), void 0 !== s2[h2] && Object.prototype.hasOwnProperty.call(s2, h2)) Array.isArray(s2[h2]) || (s2[h2] = [s2[h2]]), s2[h2].push(t3);
        else {
          const n3 = e2.jPath ? r2.toString() : r2;
          e2.isArray(h2, n3, i3) ? s2[h2] = [t3] : s2[h2] = t3;
        }
        void 0 !== h2 && h2 !== e2.textNodeName && n2.pop();
      }
    }
  }
  return "string" == typeof i2 ? i2.length > 0 && (s2[e2.textNodeName] = i2) : void 0 !== i2 && (s2[e2.textNodeName] = i2), s2;
}
function hn(t2) {
  const e2 = Object.keys(t2);
  for (let t3 = 0; t3 < e2.length; t3++) {
    const n2 = e2[t3];
    if (":@" !== n2) return n2;
  }
}
function ln(t2, e2, n2, r2) {
  if (e2) {
    const i2 = Object.keys(e2), s2 = i2.length;
    for (let o2 = 0; o2 < s2; o2++) {
      const s3 = i2[o2], a2 = s3.startsWith(r2.attributeNamePrefix) ? s3.substring(r2.attributeNamePrefix.length) : s3, h2 = r2.jPath ? n2.toString() + "." + a2 : n2;
      r2.isArray(s3, h2, true, true) ? t2[s3] = [e2[s3]] : t2[s3] = e2[s3];
    }
  }
}
function un(t2, e2) {
  const { textNodeName: n2 } = e2, r2 = Object.keys(t2).length;
  return 0 === r2 || !(1 !== r2 || !t2[n2] && "boolean" != typeof t2[n2] && 0 !== t2[n2]);
}
var cn = { allowBooleanAttributes: false, unpairedTags: [] };
function pn(t2) {
  return " " === t2 || "	" === t2 || "\n" === t2 || "\r" === t2;
}
function fn(t2, e2) {
  const n2 = e2;
  for (; e2 < t2.length; e2++) if ("?" != t2[e2] && " " != t2[e2]) ;
  else {
    const r2 = t2.substr(n2, e2 - n2);
    if (e2 > 5 && "xml" === r2) return vn("InvalidXml", "XML declaration allowed only at the start of the document.", xn(t2, e2));
    if ("?" == t2[e2] && ">" == t2[e2 + 1]) {
      e2++;
      break;
    }
  }
  return e2;
}
function dn(t2, e2) {
  if (t2.length > e2 + 5 && "-" === t2[e2 + 1] && "-" === t2[e2 + 2]) {
    for (e2 += 3; e2 < t2.length; e2++) if ("-" === t2[e2] && "-" === t2[e2 + 1] && ">" === t2[e2 + 2]) {
      e2 += 2;
      break;
    }
  } else if (t2.length > e2 + 8 && "D" === t2[e2 + 1] && "O" === t2[e2 + 2] && "C" === t2[e2 + 3] && "T" === t2[e2 + 4] && "Y" === t2[e2 + 5] && "P" === t2[e2 + 6] && "E" === t2[e2 + 7]) {
    let n2 = 1;
    for (e2 += 8; e2 < t2.length; e2++) if ("<" === t2[e2]) n2++;
    else if (">" === t2[e2] && (n2--, 0 === n2)) break;
  } else if (t2.length > e2 + 9 && "[" === t2[e2 + 1] && "C" === t2[e2 + 2] && "D" === t2[e2 + 3] && "A" === t2[e2 + 4] && "T" === t2[e2 + 5] && "A" === t2[e2 + 6] && "[" === t2[e2 + 7]) {
    for (e2 += 8; e2 < t2.length; e2++) if ("]" === t2[e2] && "]" === t2[e2 + 1] && ">" === t2[e2 + 2]) {
      e2 += 2;
      break;
    }
  }
  return e2;
}
function gn(t2, e2) {
  let n2 = "", r2 = "", i2 = false;
  for (; e2 < t2.length; e2++) {
    if ('"' === t2[e2] || "'" === t2[e2]) "" === r2 ? r2 = t2[e2] : r2 !== t2[e2] || (r2 = "");
    else if (">" === t2[e2] && "" === r2) {
      i2 = true;
      break;
    }
    n2 += t2[e2];
  }
  return "" === r2 && { value: n2, index: e2, tagClosed: i2 };
}
var mn = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function yn(t2, e2) {
  const n2 = re(t2, mn), r2 = {};
  for (let t3 = 0; t3 < n2.length; t3++) {
    if (0 === n2[t3][1].length) return vn("InvalidAttr", "Attribute '" + n2[t3][2] + "' has no space in starting.", Nn(n2[t3]));
    if (void 0 !== n2[t3][3] && void 0 === n2[t3][4]) return vn("InvalidAttr", "Attribute '" + n2[t3][2] + "' is without value.", Nn(n2[t3]));
    if (void 0 === n2[t3][3] && !e2.allowBooleanAttributes) return vn("InvalidAttr", "boolean attribute '" + n2[t3][2] + "' is not allowed.", Nn(n2[t3]));
    const i2 = n2[t3][2];
    if (!wn(i2)) return vn("InvalidAttr", "Attribute '" + i2 + "' is an invalid name.", Nn(n2[t3]));
    if (Object.prototype.hasOwnProperty.call(r2, i2)) return vn("InvalidAttr", "Attribute '" + i2 + "' is repeated.", Nn(n2[t3]));
    r2[i2] = 1;
  }
  return true;
}
function bn(t2, e2) {
  if (";" === t2[++e2]) return -1;
  if ("#" === t2[e2]) return (function(t3, e3) {
    let n3 = /\d/;
    for ("x" === t3[e3] && (e3++, n3 = /[\da-fA-F]/); e3 < t3.length; e3++) {
      if (";" === t3[e3]) return e3;
      if (!t3[e3].match(n3)) break;
    }
    return -1;
  })(t2, ++e2);
  let n2 = 0;
  for (; e2 < t2.length; e2++, n2++) if (!(t2[e2].match(/\w/) && n2 < 20)) {
    if (";" === t2[e2]) break;
    return -1;
  }
  return e2;
}
function vn(t2, e2, n2) {
  return { err: { code: t2, msg: e2, line: n2.line || n2, col: n2.col } };
}
function wn(t2) {
  return ie(t2);
}
function xn(t2, e2) {
  const n2 = t2.substring(0, e2).split(/\r?\n/);
  return { line: n2.length, col: n2[n2.length - 1].length + 1 };
}
function Nn(t2) {
  return t2.startIndex + t2[1].length;
}
var En = class {
  constructor(t2) {
    this.externalEntities = {}, this.options = ce(t2);
  }
  parse(t2, e2) {
    if ("string" != typeof t2 && t2.toString) t2 = t2.toString();
    else if ("string" != typeof t2) throw new Error("XML data is accepted in String or Bytes[] form.");
    if (e2) {
      true === e2 && (e2 = {});
      const n3 = (function(t3, e3) {
        e3 = Object.assign({}, cn, e3);
        const n4 = [];
        let r3 = false, i2 = false;
        "\uFEFF" === t3[0] && (t3 = t3.substr(1));
        for (let s2 = 0; s2 < t3.length; s2++) if ("<" === t3[s2] && "?" === t3[s2 + 1]) {
          if (s2 += 2, s2 = fn(t3, s2), s2.err) return s2;
        } else {
          if ("<" !== t3[s2]) {
            if (pn(t3[s2])) continue;
            return vn("InvalidChar", "char '" + t3[s2] + "' is not expected.", xn(t3, s2));
          }
          {
            let o2 = s2;
            if (s2++, "!" === t3[s2]) {
              s2 = dn(t3, s2);
              continue;
            }
            {
              let a2 = false;
              "/" === t3[s2] && (a2 = true, s2++);
              let h2 = "";
              for (; s2 < t3.length && ">" !== t3[s2] && " " !== t3[s2] && "	" !== t3[s2] && "\n" !== t3[s2] && "\r" !== t3[s2]; s2++) h2 += t3[s2];
              if (h2 = h2.trim(), "/" === h2[h2.length - 1] && (h2 = h2.substring(0, h2.length - 1), s2--), !ie(h2)) {
                let e4;
                return e4 = 0 === h2.trim().length ? "Invalid space after '<'." : "Tag '" + h2 + "' is an invalid name.", vn("InvalidTag", e4, xn(t3, s2));
              }
              const l2 = gn(t3, s2);
              if (false === l2) return vn("InvalidAttr", "Attributes for '" + h2 + "' have open quote.", xn(t3, s2));
              let u2 = l2.value;
              if (s2 = l2.index, "/" === u2[u2.length - 1]) {
                const n5 = s2 - u2.length;
                u2 = u2.substring(0, u2.length - 1);
                const i3 = yn(u2, e3);
                if (true !== i3) return vn(i3.err.code, i3.err.msg, xn(t3, n5 + i3.err.line));
                r3 = true;
              } else if (a2) {
                if (!l2.tagClosed) return vn("InvalidTag", "Closing tag '" + h2 + "' doesn't have proper closing.", xn(t3, s2));
                if (u2.trim().length > 0) return vn("InvalidTag", "Closing tag '" + h2 + "' can't have attributes or invalid starting.", xn(t3, o2));
                if (0 === n4.length) return vn("InvalidTag", "Closing tag '" + h2 + "' has not been opened.", xn(t3, o2));
                {
                  const e4 = n4.pop();
                  if (h2 !== e4.tagName) {
                    let n5 = xn(t3, e4.tagStartPos);
                    return vn("InvalidTag", "Expected closing tag '" + e4.tagName + "' (opened in line " + n5.line + ", col " + n5.col + ") instead of closing tag '" + h2 + "'.", xn(t3, o2));
                  }
                  0 == n4.length && (i2 = true);
                }
              } else {
                const a3 = yn(u2, e3);
                if (true !== a3) return vn(a3.err.code, a3.err.msg, xn(t3, s2 - u2.length + a3.err.line));
                if (true === i2) return vn("InvalidXml", "Multiple possible root nodes found.", xn(t3, s2));
                -1 !== e3.unpairedTags.indexOf(h2) || n4.push({ tagName: h2, tagStartPos: o2 }), r3 = true;
              }
              for (s2++; s2 < t3.length; s2++) if ("<" === t3[s2]) {
                if ("!" === t3[s2 + 1]) {
                  s2++, s2 = dn(t3, s2);
                  continue;
                }
                if ("?" !== t3[s2 + 1]) break;
                if (s2 = fn(t3, ++s2), s2.err) return s2;
              } else if ("&" === t3[s2]) {
                const e4 = bn(t3, s2);
                if (-1 == e4) return vn("InvalidChar", "char '&' is not expected.", xn(t3, s2));
                s2 = e4;
              } else if (true === i2 && !pn(t3[s2])) return vn("InvalidXml", "Extra text at the end", xn(t3, s2));
              "<" === t3[s2] && s2--;
            }
          }
        }
        return r3 ? 1 == n4.length ? vn("InvalidTag", "Unclosed tag '" + n4[0].tagName + "'.", xn(t3, n4[0].tagStartPos)) : !(n4.length > 0) || vn("InvalidXml", "Invalid '" + JSON.stringify(n4.map(((t4) => t4.tagName)), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 }) : vn("InvalidXml", "Start tag expected.", 1);
      })(t2, e2);
      if (true !== n3) throw Error(`${n3.err.msg}:${n3.err.line}:${n3.err.col}`);
    }
    const n2 = new Fe(this.options, this.externalEntities), r2 = n2.parseXml(t2);
    return this.options.preserveOrder || void 0 === r2 ? r2 : on(r2, this.options, n2.matcher, n2.readonlyMatcher);
  }
  addEntity(t2, e2) {
    if (-1 !== e2.indexOf("&")) throw new Error("Entity value can't have '&'");
    if (-1 !== t2.indexOf("&") || -1 !== t2.indexOf(";")) throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    if ("&" === e2) throw new Error("An entity with value '&' is not permitted");
    this.externalEntities[t2] = e2;
  }
  static getMetaDataSymbol() {
    return fe.getMetaDataSymbol();
  }
};
var An = n(829);
var Sn = n.n(An);
var Pn = (function(t2) {
  return t2.Array = "array", t2.Object = "object", t2.Original = "original", t2;
})(Pn || {});
function Tn(t2) {
  return "string" == typeof t2 ? t2 : t2.toString(".", false);
}
function On(t2, e2) {
  if (!t2.endsWith("propstat.prop.displayname")) return e2;
}
function Cn(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : Pn.Original;
  const r2 = Sn().get(t2, e2);
  return "array" === n2 && false === Array.isArray(r2) ? [r2] : "object" === n2 && Array.isArray(r2) ? r2[0] : r2;
}
function _n(t2, e2) {
  return e2 = e2 ?? { attributeNamePrefix: "@", attributeParsers: [], tagParsers: [On] }, new Promise(((n2) => {
    n2((function(t3) {
      const { multistatus: e3 } = t3;
      if ("" === e3) return { multistatus: { response: [] } };
      if (!e3) throw new Error("Invalid response: No root multistatus found");
      const n3 = { multistatus: Array.isArray(e3) ? e3[0] : e3 };
      return Sn().set(n3, "multistatus.response", Cn(n3, "multistatus.response", Pn.Array)), Sn().set(n3, "multistatus.response", Sn().get(n3, "multistatus.response").map(((t4) => (function(t5) {
        const e4 = Object.assign({}, t5);
        return e4.status ? Sn().set(e4, "status", Cn(e4, "status", Pn.Object)) : (Sn().set(e4, "propstat", Cn(e4, "propstat", Pn.Object)), Sn().set(e4, "propstat.prop", Cn(e4, "propstat.prop", Pn.Object))), e4;
      })(t4)))), n3;
    })((function(t3) {
      let { attributeNamePrefix: e3, attributeParsers: n3, entityDecoder: r2, tagParsers: i2 } = t3;
      const s2 = { allowBooleanAttributes: true, attributeNamePrefix: e3, textNodeName: "text", ignoreAttributes: false, removeNSPrefix: true, jPath: false, numberParseOptions: { hex: true, leadingZeros: false }, attributeValueProcessor(t4, e4, r3) {
        const i3 = Tn(r3);
        for (const t5 of n3) try {
          const n4 = t5(i3, e4);
          if (n4 !== e4) return n4;
        } catch (t6) {
        }
        return e4;
      }, tagValueProcessor(t4, e4, n4) {
        const r3 = Tn(n4);
        for (const t5 of i2) try {
          const n5 = t5(r3, e4);
          if (n5 !== e4) return n5;
        } catch (t6) {
        }
        return e4;
      } };
      return r2 && (s2.entityDecoder = new Le({ limit: { maxTotalExpansions: r2.limit?.maxTotalExpansions ?? 0, maxExpandedLength: r2.limit?.maxExpandedLength ?? 0 } })), new En(s2);
    })(e2).parse(t2)));
  }));
}
function $n(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] && arguments[2];
  const { getlastmodified: r2 = null, getcontentlength: i2 = "0", resourcetype: s2 = null, getcontenttype: o2 = null, getetag: a2 = null } = t2, h2 = s2 && "object" == typeof s2 && void 0 !== s2.collection ? "directory" : "file", u2 = { filename: e2, basename: l().basename(e2), lastmod: r2, size: parseInt(i2, 10), type: h2, etag: "string" == typeof a2 ? a2.replace(/"/g, "") : null };
  return "file" === h2 && (u2.mime = o2 && "string" == typeof o2 ? o2.split(";")[0] : ""), n2 && (void 0 !== t2.displayname && (t2.displayname = String(t2.displayname)), u2.props = t2), u2;
}
function jn(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] && arguments[2], r2 = null;
  try {
    t2.multistatus.response[0].propstat && (r2 = t2.multistatus.response[0]);
  } catch (t3) {
  }
  if (!r2) throw new Error("Failed getting item stat: bad response");
  const { propstat: { prop: i2, status: s2 } } = r2, [o2, a2, h2] = s2.split(" ", 3), l2 = parseInt(a2, 10);
  if (l2 >= 400) {
    const t3 = new Error(`Invalid response: ${l2} ${h2}`);
    throw t3.status = l2, t3;
  }
  return $n(i2, d(e2), n2);
}
function In(t2) {
  switch (String(t2)) {
    case "-3":
      return "unlimited";
    case "-2":
    case "-1":
      return "unknown";
    default:
      return parseInt(String(t2), 10);
  }
}
function Mn(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var Rn = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const { details: r2 = false } = n2, i2 = K({ url: m(t2.remoteURL, p(e2)), method: "PROPFIND", headers: { Accept: "text/plain,application/xml", Depth: "0" } }, t2, n2);
  return Mn(J(i2, t2), (function(n3) {
    return Jt(t2, n3), Mn(n3.text(), (function(i3) {
      return Mn(_n(i3, t2.parsing), (function(t3) {
        const i4 = jn(t3, e2, r2);
        return Kt(n3, i4, r2);
      }));
    }));
  }));
}));
function kn(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var Ln = Dn((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = (function(t3) {
    if (!t3 || "/" === t3) return [];
    let e3 = t3;
    const n3 = [];
    do {
      n3.push(e3), e3 = l().dirname(e3);
    } while (e3 && "/" !== e3);
    return n3;
  })(d(e2));
  r2.sort(((t3, e3) => t3.length > e3.length ? 1 : e3.length > t3.length ? -1 : 0));
  let i2 = false;
  return (function(t3, e3, n3) {
    if ("function" == typeof t3[Vn]) {
      let u2 = function(t4) {
        try {
          for (; !(r3 = o2.next()).done; ) if ((t4 = e3(r3.value)) && t4.then) {
            if (!Gn(t4)) return void t4.then(u2, s2 || (s2 = Wn.bind(null, i3 = new Bn(), 2)));
            t4 = t4.v;
          }
          i3 ? Wn(i3, 1, t4) : i3 = t4;
        } catch (t5) {
          Wn(i3 || (i3 = new Bn()), 2, t5);
        }
      };
      var r3, i3, s2, o2 = t3[Vn]();
      if (u2(), o2.return) {
        var a2 = function(t4) {
          try {
            r3.done || o2.return();
          } catch (t5) {
          }
          return t4;
        };
        if (i3 && i3.then) return i3.then(a2, (function(t4) {
          throw a2(t4);
        }));
        a2();
      }
      return i3;
    }
    if (!("length" in t3)) throw new TypeError("Object is not iterable");
    for (var h2 = [], l2 = 0; l2 < t3.length; l2++) h2.push(t3[l2]);
    return (function(t4, e4, n4) {
      var r4, i4, s3 = -1;
      return (function o3(a3) {
        try {
          for (; ++s3 < t4.length && (!n4 || !n4()); ) if ((a3 = e4(s3)) && a3.then) {
            if (!Gn(a3)) return void a3.then(o3, i4 || (i4 = Wn.bind(null, r4 = new Bn(), 2)));
            a3 = a3.v;
          }
          r4 ? Wn(r4, 1, a3) : r4 = a3;
        } catch (t5) {
          Wn(r4 || (r4 = new Bn()), 2, t5);
        }
      })(), r4;
    })(h2, (function(t4) {
      return e3(h2[t4]);
    }), n3);
  })(r2, (function(r3) {
    return s2 = function() {
      return (function(n3, i3) {
        try {
          var s3 = kn(Rn(t2, r3), (function(t3) {
            if ("directory" !== t3.type) throw new Error(`Path includes a file: ${e2}`);
          }));
        } catch (t3) {
          return i3(t3);
        }
        return s3 && s3.then ? s3.then(void 0, i3) : s3;
      })(0, (function(e3) {
        const s3 = e3;
        return (function() {
          if (404 === s3.status) return i2 = true, Fn(zn(t2, r3, { ...n2, recursive: false }));
          throw e3;
        })();
      }));
    }, (o2 = (function() {
      if (i2) return Fn(zn(t2, r3, { ...n2, recursive: false }));
    })()) && o2.then ? o2.then(s2) : s2();
    var s2, o2;
  }), (function() {
    return false;
  }));
}));
function Dn(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
}
function Un() {
}
function Fn(t2, e2) {
  if (!e2) return t2 && t2.then ? t2.then(Un) : Promise.resolve();
}
var Vn = "undefined" != typeof Symbol ? Symbol.iterator || (Symbol.iterator = Symbol("Symbol.iterator")) : "@@iterator";
function Wn(t2, e2, n2) {
  if (!t2.s) {
    if (n2 instanceof Bn) {
      if (!n2.s) return void (n2.o = Wn.bind(null, t2, e2));
      1 & e2 && (e2 = n2.s), n2 = n2.v;
    }
    if (n2 && n2.then) return void n2.then(Wn.bind(null, t2, e2), Wn.bind(null, t2, 2));
    t2.s = e2, t2.v = n2;
    const r2 = t2.o;
    r2 && r2(t2);
  }
}
var Bn = (function() {
  function t2() {
  }
  return t2.prototype.then = function(e2, n2) {
    const r2 = new t2(), i2 = this.s;
    if (i2) {
      const t3 = 1 & i2 ? e2 : n2;
      if (t3) {
        try {
          Wn(r2, 1, t3(this.v));
        } catch (t4) {
          Wn(r2, 2, t4);
        }
        return r2;
      }
      return this;
    }
    return this.o = function(t3) {
      try {
        const i3 = t3.v;
        1 & t3.s ? Wn(r2, 1, e2 ? e2(i3) : i3) : n2 ? Wn(r2, 1, n2(i3)) : Wn(r2, 2, i3);
      } catch (t4) {
        Wn(r2, 2, t4);
      }
    }, r2;
  }, t2;
})();
function Gn(t2) {
  return t2 instanceof Bn && 1 & t2.s;
}
var zn = Dn((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  if (true === n2.recursive) return Ln(t2, e2, n2);
  const r2 = K({ url: m(t2.remoteURL, (i2 = p(e2), i2.endsWith("/") ? i2 : i2 + "/")), method: "MKCOL" }, t2, n2);
  var i2;
  return kn(J(r2, t2), (function(e3) {
    Jt(t2, e3);
  }));
}));
var qn = n(388);
var Hn = n.n(qn);
var Yn = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = {};
  if ("object" == typeof n2.range && "number" == typeof n2.range.start) {
    let t3 = `bytes=${n2.range.start}-`;
    "number" == typeof n2.range.end && (t3 = `${t3}${n2.range.end}`), r2.Range = t3;
  }
  const i2 = K({ url: m(t2.remoteURL, p(e2)), method: "GET", headers: r2 }, t2, n2);
  return o2 = function(e3) {
    if (Jt(t2, e3), r2.Range && 206 !== e3.status) {
      const t3 = new Error(`Invalid response code for partial request: ${e3.status}`);
      throw t3.status = e3.status, t3;
    }
    return n2.callback && setTimeout((() => {
      n2.callback(e3);
    }), 0), e3.body;
  }, (s2 = J(i2, t2)) && s2.then || (s2 = Promise.resolve(s2)), o2 ? s2.then(o2) : s2;
  var s2, o2;
}));
var Xn = () => {
};
var Zn = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2, n2) {
  n2.url || (n2.url = m(t2.remoteURL, p(e2)));
  const r2 = K(n2, t2, {});
  return s2 = function(e3) {
    return Jt(t2, e3), e3;
  }, (i2 = J(r2, t2)) && i2.then || (i2 = Promise.resolve(i2)), s2 ? i2.then(s2) : i2;
  var i2, s2;
}));
var Jn = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = K({ url: m(t2.remoteURL, p(e2)), method: "DELETE" }, t2, n2);
  return s2 = function(e3) {
    Jt(t2, e3);
  }, (i2 = J(r2, t2)) && i2.then || (i2 = Promise.resolve(i2)), s2 ? i2.then(s2) : i2;
  var i2, s2;
}));
var Kn = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  return (function(r2, i2) {
    try {
      var s2 = (o2 = Rn(t2, e2, n2), a2 = function() {
        return true;
      }, h2 ? a2 ? a2(o2) : o2 : (o2 && o2.then || (o2 = Promise.resolve(o2)), a2 ? o2.then(a2) : o2));
    } catch (t3) {
      return i2(t3);
    }
    var o2, a2, h2;
    return s2 && s2.then ? s2.then(void 0, i2) : s2;
  })(0, (function(t3) {
    if (404 === t3.status) return false;
    throw t3;
  }));
}));
function Qn(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var tr = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = K({ url: m(t2.remoteURL, p(e2), "/"), method: "PROPFIND", headers: { Accept: "text/plain,application/xml", Depth: n2.deep ? "infinity" : "1" } }, t2, n2);
  return Qn(J(r2, t2), (function(r3) {
    return Jt(t2, r3), Qn(r3.text(), (function(i2) {
      if (!i2) throw new Error("Failed parsing directory contents: Empty response");
      return Qn(_n(i2, t2.parsing), (function(i3) {
        const s2 = f(e2);
        let o2 = (function(t3, e3, n3) {
          let r4 = arguments.length > 3 && void 0 !== arguments[3] && arguments[3], i4 = arguments.length > 4 && void 0 !== arguments[4] && arguments[4];
          const s3 = l().join(e3, "/"), { multistatus: { response: o3 } } = t3, h2 = o3.map(((t4) => {
            const e4 = (function(t5) {
              try {
                return t5.replace(/^https?:\/\/[^\/]+/, "");
              } catch (t6) {
                throw new a(t6, "Failed normalising HREF");
              }
            })(t4.href), { propstat: { prop: n4 } } = t4;
            return $n(n4, "/" === s3 ? decodeURIComponent(d(e4)) : d(l().relative(decodeURIComponent(s3), decodeURIComponent(e4))), r4);
          }));
          return i4 ? h2 : h2.filter(((t4) => t4.basename && ("file" === t4.type || t4.filename !== n3.replace(/\/$/, ""))));
        })(i3, f(t2.remoteBasePath || t2.remotePath), s2, n2.details, n2.includeSelf);
        return n2.glob && (o2 = (function(t3, e3) {
          return t3.filter(((t4) => Et(t4.filename, e3, { matchBase: true })));
        })(o2, n2.glob)), Kt(r3, o2, n2.details);
      }));
    }));
  }));
}));
function er(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
}
var nr = er((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = K({ url: m(t2.remoteURL, p(e2)), method: "GET", headers: { Accept: "text/plain" }, transformResponse: [or] }, t2, n2);
  return rr(J(r2, t2), (function(e3) {
    return Jt(t2, e3), rr(e3.text(), (function(t3) {
      return Kt(e3, t3, n2.details);
    }));
  }));
}));
function rr(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var ir = er((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = K({ url: m(t2.remoteURL, p(e2)), method: "GET" }, t2, n2);
  return rr(J(r2, t2), (function(e3) {
    let r3;
    return Jt(t2, e3), (function(t3, e4) {
      var n3 = t3();
      return n3 && n3.then ? n3.then(e4) : e4();
    })((function() {
      return rr(e3.arrayBuffer(), (function(t3) {
        r3 = t3;
      }));
    }), (function() {
      return Kt(e3, r3, n2.details);
    }));
  }));
}));
var sr = er((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const { format: r2 = "binary" } = n2;
  if ("binary" !== r2 && "text" !== r2) throw new a({ info: { code: _.InvalidOutputFormat } }, `Invalid output format: ${r2}`);
  return "text" === r2 ? nr(t2, e2, n2) : ir(t2, e2, n2);
}));
var or = (t2) => t2;
function ar(t2, e2) {
  let n2 = "";
  e2.format && e2.indentBy.length > 0 && (n2 = "\n");
  const r2 = [];
  if (e2.stopNodes && Array.isArray(e2.stopNodes)) for (let t3 = 0; t3 < e2.stopNodes.length; t3++) {
    const n3 = e2.stopNodes[t3];
    "string" == typeof n3 ? r2.push(new Ae(n3)) : n3 instanceof Ae && r2.push(n3);
  }
  return hr(t2, e2, n2, new Ee(), r2);
}
function hr(t2, e2, n2, r2, i2) {
  let s2 = "", o2 = false;
  if (e2.maxNestedTags && r2.getDepth() > e2.maxNestedTags) throw new Error("Maximum nested tags exceeded");
  if (!Array.isArray(t2)) {
    if (null != t2) {
      let n3 = t2.toString();
      return n3 = gr(n3, e2), n3;
    }
    return "";
  }
  for (let a2 = 0; a2 < t2.length; a2++) {
    const h2 = t2[a2], l2 = pr(h2);
    if (void 0 === l2) continue;
    const u2 = lr(h2[":@"], e2);
    r2.push(l2, u2);
    const c2 = dr(r2, i2);
    if (l2 === e2.textNodeName) {
      let t3 = h2[l2];
      c2 || (t3 = e2.tagValueProcessor(l2, t3), t3 = gr(t3, e2)), o2 && (s2 += n2), s2 += t3, o2 = false, r2.pop();
      continue;
    }
    if (l2 === e2.cdataPropName) {
      o2 && (s2 += n2);
      const t3 = h2[l2][0][e2.textNodeName];
      s2 += `<![CDATA[${String(t3).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`, o2 = false, r2.pop();
      continue;
    }
    if (l2 === e2.commentPropName) {
      const t3 = h2[l2][0][e2.textNodeName];
      s2 += n2 + `<!--${String(t3).replace(/--/g, "- -").replace(/-$/, "- ")}-->`, o2 = true, r2.pop();
      continue;
    }
    if ("?" === l2[0]) {
      const t3 = fr(h2[":@"], e2, c2), i3 = "?xml" === l2 ? "" : n2;
      let a3 = h2[l2][0][e2.textNodeName];
      a3 = 0 !== a3.length ? " " + a3 : "", s2 += i3 + `<${l2}${a3}${t3}?>`, o2 = true, r2.pop();
      continue;
    }
    let p2 = n2;
    "" !== p2 && (p2 += e2.indentBy);
    const f2 = n2 + `<${l2}${fr(h2[":@"], e2, c2)}`;
    let d2;
    d2 = c2 ? ur(h2[l2], e2) : hr(h2[l2], e2, p2, r2, i2), -1 !== e2.unpairedTags.indexOf(l2) ? e2.suppressUnpairedNode ? s2 += f2 + ">" : s2 += f2 + "/>" : d2 && 0 !== d2.length || !e2.suppressEmptyNode ? d2 && d2.endsWith(">") ? s2 += f2 + `>${d2}${n2}</${l2}>` : (s2 += f2 + ">", d2 && "" !== n2 && (d2.includes("/>") || d2.includes("</")) ? s2 += n2 + e2.indentBy + d2 + n2 : s2 += d2, s2 += `</${l2}>`) : s2 += f2 + "/>", o2 = true, r2.pop();
  }
  return s2;
}
function lr(t2, e2) {
  if (!t2 || e2.ignoreAttributes) return null;
  const n2 = {};
  let r2 = false;
  for (let i2 in t2) Object.prototype.hasOwnProperty.call(t2, i2) && (n2[i2.startsWith(e2.attributeNamePrefix) ? i2.substr(e2.attributeNamePrefix.length) : i2] = t2[i2], r2 = true);
  return r2 ? n2 : null;
}
function ur(t2, e2) {
  if (!Array.isArray(t2)) return null != t2 ? t2.toString() : "";
  let n2 = "";
  for (let r2 = 0; r2 < t2.length; r2++) {
    const i2 = t2[r2], s2 = pr(i2);
    if (s2 === e2.textNodeName) n2 += i2[s2];
    else if (s2 === e2.cdataPropName) n2 += i2[s2][0][e2.textNodeName];
    else if (s2 === e2.commentPropName) n2 += i2[s2][0][e2.textNodeName];
    else {
      if (s2 && "?" === s2[0]) continue;
      if (s2) {
        const t3 = cr(i2[":@"], e2), r3 = ur(i2[s2], e2);
        r3 && 0 !== r3.length ? n2 += `<${s2}${t3}>${r3}</${s2}>` : n2 += `<${s2}${t3}/>`;
      }
    }
  }
  return n2;
}
function cr(t2, e2) {
  let n2 = "";
  if (t2 && !e2.ignoreAttributes) for (let r2 in t2) {
    if (!Object.prototype.hasOwnProperty.call(t2, r2)) continue;
    let i2 = t2[r2];
    true === i2 && e2.suppressBooleanAttributes ? n2 += ` ${r2.substr(e2.attributeNamePrefix.length)}` : n2 += ` ${r2.substr(e2.attributeNamePrefix.length)}="${i2}"`;
  }
  return n2;
}
function pr(t2) {
  const e2 = Object.keys(t2);
  for (let n2 = 0; n2 < e2.length; n2++) {
    const r2 = e2[n2];
    if (Object.prototype.hasOwnProperty.call(t2, r2) && ":@" !== r2) return r2;
  }
}
function fr(t2, e2, n2) {
  let r2 = "";
  if (t2 && !e2.ignoreAttributes) for (let i2 in t2) {
    if (!Object.prototype.hasOwnProperty.call(t2, i2)) continue;
    let s2;
    n2 ? s2 = t2[i2] : (s2 = e2.attributeValueProcessor(i2, t2[i2]), s2 = gr(s2, e2)), true === s2 && e2.suppressBooleanAttributes ? r2 += ` ${i2.substr(e2.attributeNamePrefix.length)}` : r2 += ` ${i2.substr(e2.attributeNamePrefix.length)}="${s2}"`;
  }
  return r2;
}
function dr(t2, e2) {
  if (!e2 || 0 === e2.length) return false;
  for (let n2 = 0; n2 < e2.length; n2++) if (t2.matches(e2[n2])) return true;
  return false;
}
function gr(t2, e2) {
  if (t2 && t2.length > 0 && e2.processEntities) for (let n2 = 0; n2 < e2.entities.length; n2++) {
    const r2 = e2.entities[n2];
    t2 = t2.replace(r2.regex, r2.val);
  }
  return t2;
}
var mr = { attributeNamePrefix: "@_", attributesGroupName: false, textNodeName: "#text", ignoreAttributes: true, cdataPropName: false, format: false, indentBy: "  ", suppressEmptyNode: false, suppressUnpairedNode: true, suppressBooleanAttributes: true, tagValueProcessor: function(t2, e2) {
  return e2;
}, attributeValueProcessor: function(t2, e2) {
  return e2;
}, preserveOrder: false, commentPropName: false, unpairedTags: [], entities: [{ regex: new RegExp("&", "g"), val: "&amp;" }, { regex: new RegExp(">", "g"), val: "&gt;" }, { regex: new RegExp("<", "g"), val: "&lt;" }, { regex: new RegExp("'", "g"), val: "&apos;" }, { regex: new RegExp('"', "g"), val: "&quot;" }], processEntities: true, stopNodes: [], oneListGroup: false, maxNestedTags: 100, jPath: true };
function yr(t2) {
  if (this.options = Object.assign({}, mr, t2), this.options.stopNodes && Array.isArray(this.options.stopNodes) && (this.options.stopNodes = this.options.stopNodes.map(((t3) => "string" == typeof t3 && t3.startsWith("*.") ? ".." + t3.substring(2) : t3))), this.stopNodeExpressions = [], this.options.stopNodes && Array.isArray(this.options.stopNodes)) for (let t3 = 0; t3 < this.options.stopNodes.length; t3++) {
    const e3 = this.options.stopNodes[t3];
    "string" == typeof e3 ? this.stopNodeExpressions.push(new Ae(e3)) : e3 instanceof Ae && this.stopNodeExpressions.push(e3);
  }
  var e2;
  true === this.options.ignoreAttributes || this.options.attributesGroupName ? this.isAttribute = function() {
    return false;
  } : (this.ignoreAttributesFn = "function" == typeof (e2 = this.options.ignoreAttributes) ? e2 : Array.isArray(e2) ? (t3) => {
    for (const n2 of e2) {
      if ("string" == typeof n2 && t3 === n2) return true;
      if (n2 instanceof RegExp && n2.test(t3)) return true;
    }
  } : () => false, this.attrPrefixLen = this.options.attributeNamePrefix.length, this.isAttribute = wr), this.processTextOrObjNode = br, this.options.format ? (this.indentate = vr, this.tagEndChar = ">\n", this.newLine = "\n") : (this.indentate = function() {
    return "";
  }, this.tagEndChar = ">", this.newLine = "");
}
function br(t2, e2, n2, r2) {
  const i2 = this.extractAttributes(t2);
  if (r2.push(e2, i2), this.checkStopNode(r2)) {
    const i3 = this.buildRawContent(t2), s3 = this.buildAttributesForStopNode(t2);
    return r2.pop(), this.buildObjectNode(i3, e2, s3, n2);
  }
  const s2 = this.j2x(t2, n2 + 1, r2);
  return r2.pop(), void 0 !== t2[this.options.textNodeName] && 1 === Object.keys(t2).length ? this.buildTextValNode(t2[this.options.textNodeName], e2, s2.attrStr, n2, r2) : this.buildObjectNode(s2.val, e2, s2.attrStr, n2);
}
function vr(t2) {
  return this.options.indentBy.repeat(t2);
}
function wr(t2) {
  return !(!t2.startsWith(this.options.attributeNamePrefix) || t2 === this.options.textNodeName) && t2.substr(this.attrPrefixLen);
}
yr.prototype.build = function(t2) {
  if (this.options.preserveOrder) return ar(t2, this.options);
  {
    Array.isArray(t2) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1 && (t2 = { [this.options.arrayNodeName]: t2 });
    const e2 = new Ee();
    return this.j2x(t2, 0, e2).val;
  }
}, yr.prototype.j2x = function(t2, e2, n2) {
  let r2 = "", i2 = "";
  if (this.options.maxNestedTags && n2.getDepth() >= this.options.maxNestedTags) throw new Error("Maximum nested tags exceeded");
  const s2 = this.options.jPath ? n2.toString() : n2, o2 = this.checkStopNode(n2);
  for (let a2 in t2) if (Object.prototype.hasOwnProperty.call(t2, a2)) if (void 0 === t2[a2]) this.isAttribute(a2) && (i2 += "");
  else if (null === t2[a2]) this.isAttribute(a2) || a2 === this.options.cdataPropName ? i2 += "" : "?" === a2[0] ? i2 += this.indentate(e2) + "<" + a2 + "?" + this.tagEndChar : i2 += this.indentate(e2) + "<" + a2 + "/" + this.tagEndChar;
  else if (t2[a2] instanceof Date) i2 += this.buildTextValNode(t2[a2], a2, "", e2, n2);
  else if ("object" != typeof t2[a2]) {
    const h2 = this.isAttribute(a2);
    if (h2 && !this.ignoreAttributesFn(h2, s2)) r2 += this.buildAttrPairStr(h2, "" + t2[a2], o2);
    else if (!h2) if (a2 === this.options.textNodeName) {
      let e3 = this.options.tagValueProcessor(a2, "" + t2[a2]);
      i2 += this.replaceEntitiesValue(e3);
    } else {
      n2.push(a2);
      const r3 = this.checkStopNode(n2);
      if (n2.pop(), r3) {
        const n3 = "" + t2[a2];
        i2 += "" === n3 ? this.indentate(e2) + "<" + a2 + this.closeTag(a2) + this.tagEndChar : this.indentate(e2) + "<" + a2 + ">" + n3 + "</" + a2 + this.tagEndChar;
      } else i2 += this.buildTextValNode(t2[a2], a2, "", e2, n2);
    }
  } else if (Array.isArray(t2[a2])) {
    const r3 = t2[a2].length;
    let s3 = "", o3 = "";
    for (let h2 = 0; h2 < r3; h2++) {
      const r4 = t2[a2][h2];
      if (void 0 === r4) ;
      else if (null === r4) "?" === a2[0] ? i2 += this.indentate(e2) + "<" + a2 + "?" + this.tagEndChar : i2 += this.indentate(e2) + "<" + a2 + "/" + this.tagEndChar;
      else if ("object" == typeof r4) if (this.options.oneListGroup) {
        n2.push(a2);
        const t3 = this.j2x(r4, e2 + 1, n2);
        n2.pop(), s3 += t3.val, this.options.attributesGroupName && r4.hasOwnProperty(this.options.attributesGroupName) && (o3 += t3.attrStr);
      } else s3 += this.processTextOrObjNode(r4, a2, e2, n2);
      else if (this.options.oneListGroup) {
        let t3 = this.options.tagValueProcessor(a2, r4);
        t3 = this.replaceEntitiesValue(t3), s3 += t3;
      } else {
        n2.push(a2);
        const t3 = this.checkStopNode(n2);
        if (n2.pop(), t3) {
          const t4 = "" + r4;
          s3 += "" === t4 ? this.indentate(e2) + "<" + a2 + this.closeTag(a2) + this.tagEndChar : this.indentate(e2) + "<" + a2 + ">" + t4 + "</" + a2 + this.tagEndChar;
        } else s3 += this.buildTextValNode(r4, a2, "", e2, n2);
      }
    }
    this.options.oneListGroup && (s3 = this.buildObjectNode(s3, a2, o3, e2)), i2 += s3;
  } else if (this.options.attributesGroupName && a2 === this.options.attributesGroupName) {
    const e3 = Object.keys(t2[a2]), n3 = e3.length;
    for (let i3 = 0; i3 < n3; i3++) r2 += this.buildAttrPairStr(e3[i3], "" + t2[a2][e3[i3]], o2);
  } else i2 += this.processTextOrObjNode(t2[a2], a2, e2, n2);
  return { attrStr: r2, val: i2 };
}, yr.prototype.buildAttrPairStr = function(t2, e2, n2) {
  return n2 || (e2 = this.options.attributeValueProcessor(t2, "" + e2), e2 = this.replaceEntitiesValue(e2)), this.options.suppressBooleanAttributes && "true" === e2 ? " " + t2 : " " + t2 + '="' + e2 + '"';
}, yr.prototype.extractAttributes = function(t2) {
  if (!t2 || "object" != typeof t2) return null;
  const e2 = {};
  let n2 = false;
  if (this.options.attributesGroupName && t2[this.options.attributesGroupName]) {
    const r2 = t2[this.options.attributesGroupName];
    for (let t3 in r2) Object.prototype.hasOwnProperty.call(r2, t3) && (e2[t3.startsWith(this.options.attributeNamePrefix) ? t3.substring(this.options.attributeNamePrefix.length) : t3] = r2[t3], n2 = true);
  } else for (let r2 in t2) {
    if (!Object.prototype.hasOwnProperty.call(t2, r2)) continue;
    const i2 = this.isAttribute(r2);
    i2 && (e2[i2] = t2[r2], n2 = true);
  }
  return n2 ? e2 : null;
}, yr.prototype.buildRawContent = function(t2) {
  if ("string" == typeof t2) return t2;
  if ("object" != typeof t2 || null === t2) return String(t2);
  if (void 0 !== t2[this.options.textNodeName]) return t2[this.options.textNodeName];
  let e2 = "";
  for (let n2 in t2) {
    if (!Object.prototype.hasOwnProperty.call(t2, n2)) continue;
    if (this.isAttribute(n2)) continue;
    if (this.options.attributesGroupName && n2 === this.options.attributesGroupName) continue;
    const r2 = t2[n2];
    if (n2 === this.options.textNodeName) e2 += r2;
    else if (Array.isArray(r2)) {
      for (let t3 of r2) if ("string" == typeof t3 || "number" == typeof t3) e2 += `<${n2}>${t3}</${n2}>`;
      else if ("object" == typeof t3 && null !== t3) {
        const r3 = this.buildRawContent(t3), i2 = this.buildAttributesForStopNode(t3);
        e2 += "" === r3 ? `<${n2}${i2}/>` : `<${n2}${i2}>${r3}</${n2}>`;
      }
    } else if ("object" == typeof r2 && null !== r2) {
      const t3 = this.buildRawContent(r2), i2 = this.buildAttributesForStopNode(r2);
      e2 += "" === t3 ? `<${n2}${i2}/>` : `<${n2}${i2}>${t3}</${n2}>`;
    } else e2 += `<${n2}>${r2}</${n2}>`;
  }
  return e2;
}, yr.prototype.buildAttributesForStopNode = function(t2) {
  if (!t2 || "object" != typeof t2) return "";
  let e2 = "";
  if (this.options.attributesGroupName && t2[this.options.attributesGroupName]) {
    const n2 = t2[this.options.attributesGroupName];
    for (let t3 in n2) {
      if (!Object.prototype.hasOwnProperty.call(n2, t3)) continue;
      const r2 = t3.startsWith(this.options.attributeNamePrefix) ? t3.substring(this.options.attributeNamePrefix.length) : t3, i2 = n2[t3];
      true === i2 && this.options.suppressBooleanAttributes ? e2 += " " + r2 : e2 += " " + r2 + '="' + i2 + '"';
    }
  } else for (let n2 in t2) {
    if (!Object.prototype.hasOwnProperty.call(t2, n2)) continue;
    const r2 = this.isAttribute(n2);
    if (r2) {
      const i2 = t2[n2];
      true === i2 && this.options.suppressBooleanAttributes ? e2 += " " + r2 : e2 += " " + r2 + '="' + i2 + '"';
    }
  }
  return e2;
}, yr.prototype.buildObjectNode = function(t2, e2, n2, r2) {
  if ("" === t2) return "?" === e2[0] ? this.indentate(r2) + "<" + e2 + n2 + "?" + this.tagEndChar : this.indentate(r2) + "<" + e2 + n2 + this.closeTag(e2) + this.tagEndChar;
  {
    let i2 = "</" + e2 + this.tagEndChar, s2 = "";
    return "?" === e2[0] && (s2 = "?", i2 = ""), !n2 && "" !== n2 || -1 !== t2.indexOf("<") ? false !== this.options.commentPropName && e2 === this.options.commentPropName && 0 === s2.length ? this.indentate(r2) + `<!--${t2}-->` + this.newLine : this.indentate(r2) + "<" + e2 + n2 + s2 + this.tagEndChar + t2 + this.indentate(r2) + i2 : this.indentate(r2) + "<" + e2 + n2 + s2 + ">" + t2 + i2;
  }
}, yr.prototype.closeTag = function(t2) {
  let e2 = "";
  return -1 !== this.options.unpairedTags.indexOf(t2) ? this.options.suppressUnpairedNode || (e2 = "/") : e2 = this.options.suppressEmptyNode ? "/" : `></${t2}`, e2;
}, yr.prototype.checkStopNode = function(t2) {
  if (!this.stopNodeExpressions || 0 === this.stopNodeExpressions.length) return false;
  for (let e2 = 0; e2 < this.stopNodeExpressions.length; e2++) if (t2.matches(this.stopNodeExpressions[e2])) return true;
  return false;
}, yr.prototype.buildTextValNode = function(t2, e2, n2, r2, i2) {
  if (false !== this.options.cdataPropName && e2 === this.options.cdataPropName) {
    const e3 = String(t2).replace(/\]\]>/g, "]]]]><![CDATA[>");
    return this.indentate(r2) + `<![CDATA[${e3}]]>` + this.newLine;
  }
  if (false !== this.options.commentPropName && e2 === this.options.commentPropName) {
    const e3 = String(t2).replace(/--/g, "- -").replace(/-$/, "- ");
    return this.indentate(r2) + `<!--${e3}-->` + this.newLine;
  }
  if ("?" === e2[0]) return this.indentate(r2) + "<" + e2 + n2 + "?" + this.tagEndChar;
  {
    let i3 = this.options.tagValueProcessor(e2, t2);
    return i3 = this.replaceEntitiesValue(i3), "" === i3 ? this.indentate(r2) + "<" + e2 + n2 + this.closeTag(e2) + this.tagEndChar : this.indentate(r2) + "<" + e2 + n2 + ">" + i3 + "</" + e2 + this.tagEndChar;
  }
}, yr.prototype.replaceEntitiesValue = function(t2) {
  if (t2 && t2.length > 0 && this.options.processEntities) for (let e2 = 0; e2 < this.options.entities.length; e2++) {
    const n2 = this.options.entities[e2];
    t2 = t2.replace(n2.regex, n2.val);
  }
  return t2;
};
var xr = yr;
function Nr(t2) {
  return new xr({ attributeNamePrefix: "@_", format: true, ignoreAttributes: false, suppressEmptyNode: true }).build(Er({ lockinfo: { "@_xmlns:d": "DAV:", lockscope: { exclusive: {} }, locktype: { write: {} }, owner: { href: t2 } } }, "d"));
}
function Er(t2, e2) {
  const n2 = { ...t2 };
  for (const t3 in n2) n2.hasOwnProperty(t3) && (n2[t3] && "object" == typeof n2[t3] && -1 === t3.indexOf(":") ? (n2[`${e2}:${t3}`] = Er(n2[t3], e2), delete n2[t3]) : false === /^@_/.test(t3) && (n2[`${e2}:${t3}`] = n2[t3], delete n2[t3]));
  return n2;
}
function Ar(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
function Sr(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
}
var Pr = Sr((function(t2, e2, n2) {
  let r2 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
  const i2 = K({ url: m(t2.remoteURL, p(e2)), method: "UNLOCK", headers: { "Lock-Token": n2 } }, t2, r2);
  return Ar(J(i2, t2), (function(e3) {
    if (Jt(t2, e3), 204 !== e3.status && 200 !== e3.status) throw Zt(e3);
  }));
}));
var Tr = Sr((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const { refreshToken: r2, timeout: i2 = Or } = n2, s2 = { Accept: "text/plain,application/xml", Timeout: i2 };
  r2 && (s2.If = r2);
  const o2 = K({ url: m(t2.remoteURL, p(e2)), method: "LOCK", headers: s2, data: Nr(t2.contactHref) }, t2, n2);
  return Ar(J(o2, t2), (function(e3) {
    return Jt(t2, e3), Ar(e3.text(), (function(t3) {
      const n3 = (s3 = t3, new En({ removeNSPrefix: true, parseAttributeValue: true, parseTagValue: true }).parse(s3)), r3 = Sn().get(n3, "prop.lockdiscovery.activelock.locktoken.href"), i3 = Sn().get(n3, "prop.lockdiscovery.activelock.timeout");
      var s3;
      if (!r3) throw Zt(e3, "No lock token received: ");
      return { token: r3, serverTimeout: i3 };
    }));
  }));
}));
var Or = "Infinite, Second-4100000000";
function Cr(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var _r = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2) {
  let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  const n2 = e2.path || "/", r2 = K({ url: m(t2.remoteURL, n2), method: "PROPFIND", headers: { Accept: "text/plain,application/xml", Depth: "0" } }, t2, e2);
  return Cr(J(r2, t2), (function(n3) {
    return Jt(t2, n3), Cr(n3.text(), (function(r3) {
      return Cr(_n(r3, t2.parsing), (function(t3) {
        const r4 = (function(t4) {
          try {
            const [e3] = t4.multistatus.response, { propstat: { prop: { "quota-used-bytes": n4, "quota-available-bytes": r5 } } } = e3;
            return void 0 !== n4 && void 0 !== r5 ? { used: parseInt(String(n4), 10), available: In(r5) } : null;
          } catch (t5) {
          }
          return null;
        })(t3);
        return Kt(n3, r4, e2.details);
      }));
    }));
  }));
}));
function $r(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var jr = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const { details: r2 = false } = n2, i2 = K({ url: m(t2.remoteURL, p(e2)), method: "SEARCH", headers: { Accept: "text/plain,application/xml", "Content-Type": t2.headers["Content-Type"] || "application/xml; charset=utf-8" } }, t2, n2);
  return $r(J(i2, t2), (function(n3) {
    return Jt(t2, n3), $r(n3.text(), (function(i3) {
      return $r(_n(i3, t2.parsing), (function(t3) {
        const i4 = (function(t4, e3, n4) {
          const r3 = { truncated: false, results: [] };
          return r3.truncated = t4.multistatus.response.some(((t5) => "507" === (t5.status || t5.propstat?.status).split(" ", 3)?.[1] && t5.href.replace(/\/$/, "").endsWith(p(e3).replace(/\/$/, "")))), t4.multistatus.response.forEach(((t5) => {
            if (void 0 === t5.propstat) return;
            const e4 = t5.href.split("/").map(decodeURIComponent).join("/");
            r3.results.push($n(t5.propstat.prop, e4, n4));
          })), r3;
        })(t3, e2, r2);
        return Kt(n3, i4, r2);
      }));
    }));
  }));
}));
var Ir = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2, n2) {
  let r2 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
  const i2 = K({ url: m(t2.remoteURL, p(e2)), method: "MOVE", headers: { Destination: m(t2.remoteURL, p(n2)), Overwrite: false === r2.overwrite ? "F" : "T" } }, t2, r2);
  return o2 = function(e3) {
    Jt(t2, e3);
  }, (s2 = J(i2, t2)) && s2.then || (s2 = Promise.resolve(s2)), o2 ? s2.then(o2) : s2;
  var s2, o2;
}));
var Mr = n(172);
function Rr(t2) {
  if (z(t2)) return t2.byteLength;
  if (q(t2)) return t2.length;
  if ("string" == typeof t2) return (0, Mr.d)(t2);
  throw new a({ info: { code: _.DataTypeNoLength } }, "Cannot calculate data length: Invalid type");
}
var kr = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2, n2) {
  let r2 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
  const { contentLength: i2 = true, overwrite: s2 = true } = r2, o2 = { "Content-Type": "application/octet-stream" };
  false === i2 || (o2["Content-Length"] = "number" == typeof i2 ? `${i2}` : `${Rr(n2)}`), s2 || (o2["If-None-Match"] = "*");
  const a2 = K({ url: m(t2.remoteURL, p(e2)), method: "PUT", headers: o2, data: n2 }, t2, r2);
  return l2 = function(e3) {
    try {
      Jt(t2, e3);
    } catch (t3) {
      const e4 = t3;
      if (412 !== e4.status || s2) throw e4;
      return false;
    }
    return true;
  }, (h2 = J(a2, t2)) && h2.then || (h2 = Promise.resolve(h2)), l2 ? h2.then(l2) : h2;
  var h2, l2;
}));
var Lr = /* @__PURE__ */ (function(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
})((function(t2, e2) {
  let n2 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
  const r2 = K({ url: m(t2.remoteURL, p(e2)), method: "OPTIONS" }, t2, n2);
  return s2 = function(e3) {
    try {
      Jt(t2, e3);
    } catch (t3) {
      throw t3;
    }
    return { compliance: (e3.headers.get("DAV") ?? "").split(",").map(((t3) => t3.trim())), server: e3.headers.get("Server") ?? "" };
  }, (i2 = J(r2, t2)) && i2.then || (i2 = Promise.resolve(i2)), s2 ? i2.then(s2) : i2;
  var i2, s2;
}));
function Dr(t2, e2, n2) {
  return n2 ? e2 ? e2(t2) : t2 : (t2 && t2.then || (t2 = Promise.resolve(t2)), e2 ? t2.then(e2) : t2);
}
var Ur = Wr((function(t2, e2, n2, r2, i2) {
  let s2 = arguments.length > 5 && void 0 !== arguments[5] ? arguments[5] : {};
  if (n2 > r2 || n2 < 0) throw new a({ info: { code: _.InvalidUpdateRange } }, `Invalid update range ${n2} for partial update`);
  const o2 = { "Content-Type": "application/octet-stream", "Content-Length": "" + (r2 - n2 + 1), "Content-Range": `bytes ${n2}-${r2}/*` }, h2 = K({ url: m(t2.remoteURL, p(e2)), method: "PUT", headers: o2, data: i2 }, t2, s2);
  return Dr(J(h2, t2), (function(e3) {
    Jt(t2, e3);
  }));
}));
function Fr(t2, e2) {
  var n2 = t2();
  return n2 && n2.then ? n2.then(e2) : e2(n2);
}
var Vr = Wr((function(t2, e2, n2, r2, i2) {
  let s2 = arguments.length > 5 && void 0 !== arguments[5] ? arguments[5] : {};
  if (n2 > r2 || n2 < 0) throw new a({ info: { code: _.InvalidUpdateRange } }, `Invalid update range ${n2} for partial update`);
  const o2 = { "Content-Type": "application/x-sabredav-partialupdate", "Content-Length": "" + (r2 - n2 + 1), "X-Update-Range": `bytes=${n2}-${r2}` }, h2 = K({ url: m(t2.remoteURL, p(e2)), method: "PATCH", headers: o2, data: i2 }, t2, s2);
  return Dr(J(h2, t2), (function(e3) {
    Jt(t2, e3);
  }));
}));
function Wr(t2) {
  return function() {
    for (var e2 = [], n2 = 0; n2 < arguments.length; n2++) e2[n2] = arguments[n2];
    try {
      return Promise.resolve(t2.apply(this, e2));
    } catch (t3) {
      return Promise.reject(t3);
    }
  };
}
var Br = Wr((function(t2, e2, n2, r2, i2) {
  let s2 = arguments.length > 5 && void 0 !== arguments[5] ? arguments[5] : {};
  return Dr(Lr(t2, e2, s2), (function(o2) {
    let h2 = false;
    return Fr((function() {
      if (o2.compliance.includes("sabredav-partialupdate")) return Dr(Vr(t2, e2, n2, r2, i2, s2), (function(t3) {
        return h2 = true, t3;
      }));
    }), (function(l2) {
      let u2 = false;
      return h2 ? l2 : Fr((function() {
        if (o2.server.includes("Apache") && o2.compliance.includes("<http://apache.org/dav/propset/fs/1>")) return Dr(Ur(t2, e2, n2, r2, i2, s2), (function(t3) {
          return u2 = true, t3;
        }));
      }), (function(t3) {
        if (u2) return t3;
        throw new a({ info: { code: _.NotSupported } }, "Not supported");
      }));
    }));
  }));
}));
var Gr = "https://github.com/perry-mitchell/webdav-client/blob/master/LOCK_CONTACT.md";
function zr(t2) {
  let e2 = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
  const { authType: n2 = null, remoteBasePath: r2, contactHref: i2 = Gr, entityDecoder: s2, ha1: o2, headers: h2 = {}, httpAgent: l2, httpsAgent: u2, password: c2, token: f2, username: d2, withCredentials: y2 } = e2;
  let b2 = n2;
  b2 || (b2 = d2 || c2 ? C.Password : C.None);
  const v2 = { authType: b2, remoteBasePath: r2, contactHref: i2, ha1: o2, headers: Object.assign({}, h2), httpAgent: l2, httpsAgent: u2, password: c2, parsing: { attributeNamePrefix: e2.attributeNamePrefix ?? "@", attributeParsers: [], entityDecoder: s2, tagParsers: [On] }, remotePath: g(t2), remoteURL: t2, token: f2, username: d2, withCredentials: y2 };
  return $(v2, d2, c2, f2, o2), { copyFile: (t3, e3, n3) => Qt(v2, t3, e3, n3), createDirectory: (t3, e3) => zn(v2, t3, e3), createReadStream: (t3, e3) => (function(t4, e4) {
    let n3 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
    const r3 = new (0, Hn().PassThrough)();
    return Yn(t4, e4, n3).then(((t5) => {
      t5.pipe(r3);
    })).catch(((t5) => {
      r3.emit("error", t5);
    })), r3;
  })(v2, t3, e3), createWriteStream: (t3, e3, n3) => (function(t4, e4) {
    let n4 = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {}, r3 = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : Xn;
    const i3 = new (0, Hn().PassThrough)(), s3 = {};
    false === n4.overwrite && (s3["If-None-Match"] = "*");
    const o3 = K({ url: m(t4.remoteURL, p(e4)), method: "PUT", headers: s3, data: i3, maxRedirects: 0 }, t4, n4);
    return J(o3, t4).then(((e5) => Jt(t4, e5))).then(((t5) => {
      setTimeout((() => {
        r3(t5);
      }), 0);
    })).catch(((t5) => {
      i3.emit("error", t5);
    })), i3;
  })(v2, t3, e3, n3), customRequest: (t3, e3) => Zn(v2, t3, e3), deleteFile: (t3, e3) => Jn(v2, t3, e3), exists: (t3, e3) => Kn(v2, t3, e3), getDirectoryContents: (t3, e3) => tr(v2, t3, e3), getFileContents: (t3, e3) => sr(v2, t3, e3), getFileDownloadLink: (t3) => (function(t4, e3) {
    let n3 = m(t4.remoteURL, p(e3));
    const r3 = /^https:/i.test(n3) ? "https" : "http";
    switch (t4.authType) {
      case C.None:
        break;
      case C.Password: {
        const e4 = E(t4.headers.Authorization.replace(/^Basic /i, "").trim());
        n3 = n3.replace(/^https?:\/\//, `${r3}://${e4}@`);
        break;
      }
      default:
        throw new a({ info: { code: _.LinkUnsupportedAuthType } }, `Unsupported auth type for file link: ${t4.authType}`);
    }
    return n3;
  })(v2, t3), getFileUploadLink: (t3) => (function(t4, e3) {
    let n3 = `${m(t4.remoteURL, p(e3))}?Content-Type=application/octet-stream`;
    const r3 = /^https:/i.test(n3) ? "https" : "http";
    switch (t4.authType) {
      case C.None:
        break;
      case C.Password: {
        const e4 = E(t4.headers.Authorization.replace(/^Basic /i, "").trim());
        n3 = n3.replace(/^https?:\/\//, `${r3}://${e4}@`);
        break;
      }
      default:
        throw new a({ info: { code: _.LinkUnsupportedAuthType } }, `Unsupported auth type for file link: ${t4.authType}`);
    }
    return n3;
  })(v2, t3), getHeaders: () => Object.assign({}, v2.headers), getQuota: (t3) => _r(v2, t3), lock: (t3, e3) => Tr(v2, t3, e3), moveFile: (t3, e3, n3) => Ir(v2, t3, e3, n3), putFileContents: (t3, e3, n3) => kr(v2, t3, e3, n3), partialUpdateFileContents: (t3, e3, n3, r3, i3) => Br(v2, t3, e3, n3, r3, i3), getDAVCompliance: (t3) => Lr(v2, t3), search: (t3, e3) => jr(v2, t3, e3), setHeaders: (t3) => {
    v2.headers = Object.assign({}, t3);
  }, stat: (t3, e3) => Rn(v2, t3, e3), unlock: (t3, e3, n3) => Pr(v2, t3, e3, n3), registerAttributeParser: (t3) => {
    v2.parsing.attributeParsers.push(t3);
  }, registerTagParser: (t3) => {
    v2.parsing.tagParsers.push(t3);
  } };
}

// src/sync.ts
function bindWebDavTransport(fetch) {
  const patcher = L();
  let activeFetch = fetch;
  patcher.patch("fetch", (input, init) => {
    if (!activeFetch) throw new Error("WebDAV\u63D2\u4EF6\u5DF2\u505C\u7528");
    return activeFetch(input, init);
  });
  return {
    dispose: () => {
      activeFetch = void 0;
    }
  };
}
function parse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("WebDAV\u914D\u7F6E\u65E0\u6548");
  const text = (key) => {
    const field = value[key];
    if (typeof field !== "string" || !field)
      throw new Error("\u8BF7\u586B\u5199WebDAV\u5730\u5740\u3001\u7528\u6237\u540D\u548C\u5BC6\u7801");
    return field;
  };
  return {
    url: text("url"),
    username: text("username"),
    password: text("password"),
    pathPrefix: typeof value.pathPrefix === "string" ? value.pathPrefix : ""
  };
}
var WebDavSyncProvider = class {
  client;
  prefix;
  constructor(config) {
    this.client = zr(config.url, {
      username: config.username,
      password: config.password
    });
    this.prefix = config.pathPrefix.replace(/^\/+|\/+$/g, "");
  }
  path(name) {
    return "/" + [this.prefix, name.replace(/^\/+/, "")].filter(Boolean).join("/").replace(/\/+/g, "/");
  }
  async put(name, content, createOnly) {
    const remotePath = this.path(name);
    const directory = remotePath.split("/").slice(0, -1).join("/") || "/";
    if (directory !== "/") {
      try {
        await this.client.createDirectory(directory, { recursive: true });
      } catch {
      }
    }
    return this.client.putFileContents(
      remotePath,
      new Uint8Array(content).buffer,
      {
        contentLength: content.byteLength,
        overwrite: !createOnly,
        ...createOnly ? { headers: { "If-None-Match": "*" } } : {}
      }
    );
  }
  async uploadFile(name, content) {
    try {
      return await this.put(name, content, false);
    } catch {
      return false;
    }
  }
  async createFileIfAbsent(name, content) {
    try {
      return await this.put(name, content, true);
    } catch {
      return false;
    }
  }
  async downloadFile(name) {
    const content = await this.client.getFileContents(this.path(name));
    if (content instanceof ArrayBuffer) return new Uint8Array(content);
    if (ArrayBuffer.isView(content))
      return new Uint8Array(
        content.buffer,
        content.byteOffset,
        content.byteLength
      );
    if (typeof content === "string") return new TextEncoder().encode(content);
    throw new Error("WebDAV\u8FD4\u56DE\u4E86\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u5185\u5BB9");
  }
  fileExists(name) {
    return this.client.exists(this.path(name));
  }
  async listFiles(prefix = "") {
    const queue = [this.path(prefix)];
    const visited = /* @__PURE__ */ new Set();
    const files = [];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      try {
        const contents = await this.client.getDirectoryContents(current);
        for (const item of contents) {
          if (item.type === "directory") {
            queue.push(item.filename);
          } else if (item.type === "file") {
            const fullPath = item.filename.replace(/^\/+/, "");
            const relativePath = this.prefix && fullPath.startsWith(this.prefix + "/") ? fullPath.slice(this.prefix.length + 1) : fullPath;
            files.push({
              name: relativePath.split("/").pop() || item.basename,
              path: relativePath,
              size: Number(item.size || 0),
              lastModified: item.lastmod ? new Date(item.lastmod).getTime() : void 0
            });
          }
        }
      } catch (error) {
        if (typeof error === "object" && error !== null && "status" in error && error.status === 404)
          continue;
        throw error;
      }
    }
    return files;
  }
};
function createWebDavSyncProvider(config) {
  return new WebDavSyncProvider(parse(config));
}

// src/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function WebDavSettings({ syncConfig }) {
  const value = syncConfig?.value;
  const fields = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const [config, setConfig] = (0, import_react.useState)(() => ({
    url: String(fields.url ?? ""),
    username: String(fields.username ?? ""),
    password: String(fields.password ?? ""),
    pathPrefix: String(fields.pathPrefix ?? "")
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
          ["url", "\u670D\u52A1\u5668\u5730\u5740", "https://example.com/dav"],
          ["username", "\u7528\u6237\u540D", ""],
          ["password", "\u5BC6\u7801", ""],
          ["pathPrefix", "\u8DEF\u5F84\u524D\u7F00", "/sync"]
        ].map(([key, label, placeholder]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex flex-col gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_ui.Input,
            {
              "aria-label": label,
              type: key === "password" ? "password" : "text",
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
      context.register(bindWebDavTransport(context.fetch));
      context.sync.register({
        id: context.pluginId,
        name: "WebDAV",
        create: (config) => createWebDavSyncProvider(config)
      });
      context.settings.register({
        id: "sync",
        title: "WebDAV \u540C\u6B65\u5B58\u50A8",
        target: "sync",
        component: WebDavSettings
      });
    }
  })
});
/*! Bundled license information:

webdav/dist/web/index.js:
  (*! For license information please see index.js.LICENSE.txt *)
*/
