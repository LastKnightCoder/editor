// mockup 用的极简 YAML 读写：只覆盖 front-matter 常见形态，嵌套对象原样保留
const SAMPLE = `title: 间隔重复的遗忘曲线
aliases: [遗忘曲线, Forgetting curve]
tags:
  - 学习
  - 记忆
created: 2026-03-14T17:20
reviewed: false
rating: 4
url: https://zh.wikipedia.org/wiki/遗忘曲线
description: 每次复习都把遗忘点往后推，间隔越拉越长
source:
  book: 认知天性
  page: 112`;

const ICON = {
  text: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  longtext: '<path d="M4 6h16M4 10h16M4 14h16M4 18h9"/>',
  list: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  date: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bool: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  number: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  url: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  object:
    '<path d="M8 4c-2 0-2 2-2 4s-2 4-2 4 2 0 2 4 0 4 2 4M16 4c2 0 2 2 2 4s2 4 2 4-2 0-2 4 0 4-2 4"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  doc: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
};
const svg = (name, s = 14) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
const TYPE_NAME = {
  text: "文本",
  longtext: "多行文本",
  list: "列表",
  date: "日期",
  bool: "勾选",
  number: "数字",
  url: "链接",
  object: "嵌套对象",
};
const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const unq = v => (/^".*"$|^'.*'$/.test(v) ? v.slice(1, -1) : v);
function typeOf(v) {
  if (v === "true" || v === "false") return "bool";
  if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
  if (/^https?:\/\//.test(v)) return "url";
  return v.length > 24 ? "longtext" : "text";
}
function parse(src) {
  const lines = src.split("\n"),
    rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = line.match(/^([^\s:#][^:]*):(?:\s+(.*))?$/);
    if (!m) throw new Error(`第 ${i + 1} 行：缺少「键: 值」里的冒号`);
    const key = m[1].trim(),
      raw = (m[2] ?? "").trim();
    if (rows.some(r => r.key === key)) throw new Error(`第 ${i + 1} 行：属性「${key}」重复`);
    if (raw.startsWith("[")) {
      if (!raw.endsWith("]")) throw new Error(`第 ${i + 1} 行：列表缺少右方括号`);
      rows.push({
        key,
        type: "list",
        value: raw
          .slice(1, -1)
          .split(",")
          .map(s => unq(s.trim()))
          .filter(Boolean),
      });
    } else if (raw === "" || raw === "|") {
      const block = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i]);
      if (raw === "|")
        rows.push({ key, type: "longtext", value: block.map(l => l.trim()).join("\n") });
      else if (block.length && block.every(l => /^\s+-\s/.test(l)))
        rows.push({
          key,
          type: "list",
          value: block.map(l => unq(l.replace(/^\s+-\s+/, "").trim())),
        });
      else if (block.length)
        rows.push({
          key,
          type: "object",
          value: block.map(l => l.replace(/^ {2}/, "")).join("\n"),
        });
      else rows.push({ key, type: "text", value: "" });
    } else {
      const v = unq(raw);
      rows.push({ key, type: typeOf(v), value: v === "true" ? true : v === "false" ? false : v });
    }
  }
  return rows;
}
function stringify(rows) {
  return rows
    .map(r => {
      if (r.type === "list")
        return r.value.length
          ? `${r.key}:\n${r.value.map(v => `  - ${v}`).join("\n")}`
          : `${r.key}: []`;
      if (r.type === "object")
        return `${r.key}:\n${r.value
          .split("\n")
          .map(l => "  " + l)
          .join("\n")}`;
      if (r.type === "longtext" && String(r.value).includes("\n"))
        return `${r.key}: |\n${r.value
          .split("\n")
          .map(l => "  " + l)
          .join("\n")}`;
      return `${r.key}: ${r.value}`;
    })
    .join("\n");
}
const fmtDate = v => {
  const d = new Date(v);
  if (isNaN(d)) return v;
  const hasTime = /T\d/.test(v);
  return (
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` +
    (hasTime
      ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      : "")
  );
};
function convert(row, type) {
  const flat = Array.isArray(row.value) ? row.value.join(", ") : String(row.value);
  if (type === "list") return flat ? flat.split(/,\s*/) : [];
  if (type === "bool") return flat === "true";
  if (type === "date")
    return /^\d{4}-\d{2}-\d{2}/.test(flat) ? flat : new Date().toISOString().slice(0, 10);
  if (type === "number") return isNaN(Number(flat)) ? "0" : flat;
  return flat;
}

class FrontMatter {
  constructor(
    el,
    { src = SAMPLE, readonly = false, folded = false, variant = "table", onEmpty } = {}
  ) {
    Object.assign(this, {
      el,
      readonly,
      folded,
      variant,
      onEmpty,
      src,
      mode: "props",
      editing: null,
      error: null,
    });
    this.rows = parse(src);
    el.addEventListener("click", e => this.onClick(e));
    document.addEventListener("mousedown", e => {
      if (!this.el.contains(e.target)) {
        this.closeMenu();
        this.commit();
        this.setActive(false);
      }
    });
    this.render();
  }
  setActive(on) {
    this.el.querySelector(".fm")?.classList.toggle("active", on && !this.readonly);
  }
  save() {
    this.src = stringify(this.rows);
  }

  render() {
    const summary = this.rows.find(r => r.key === "title")?.value || this.rows[0]?.key || "";
    if (this.variant === "line" && this.folded) {
      const items = this.rows
        .filter(r => r.type !== "object")
        .slice(0, 4)
        .map(r => `<span><b>${esc(r.key)}</b>${esc(this.plain(r))}</span>`)
        .join("");
      this.el.innerHTML = `<div class="line" data-act="expand" style="cursor:pointer">${items}<span class="more">+${Math.max(0, this.rows.length - 4)} 项</span></div>`;
      return;
    }
    const active = this.el.querySelector(".fm.active") ? " active" : "";
    this.el.innerHTML = `<div class="fm${this.folded ? " folded" : ""}${this.readonly ? "" : " editable"}${active}">
      <div class="fm-head">
        <button class="fold" data-act="fold">${svg("chev", 13)}文档属性</button>
        ${this.folded ? `<span class="summary">· ${this.rows.length} 项 · ${esc(summary)}</span>` : ""}
        ${this.readonly ? "" : `<div class="mode"><button data-act="mode-props" class="${this.mode === "props" ? "on" : ""}">属性</button><button data-act="mode-src" class="${this.mode === "src" ? "on" : ""}">YAML</button></div>`}
      </div>
      ${this.mode === "src" ? this.renderSrc() : `<div class="rows">${this.rows.map((r, i) => this.renderRow(r, i)).join("")}</div>`}
      ${this.readonly || this.mode === "src" ? "" : `<button class="add" data-act="add">${svg("plus", 13)}添加属性</button>`}
    </div>`;
    if (this.mode === "src") {
      const ta = this.el.querySelector(".src textarea");
      ta.addEventListener("input", () => {
        this.src = ta.value;
        try {
          this.rows = parse(ta.value);
          this.error = null;
        } catch (err) {
          this.error = err.message;
        }
        const box = this.el.querySelector(".err");
        if (box) box.outerHTML = this.errHtml();
        else ta.insertAdjacentHTML("afterend", this.errHtml());
        if (!this.error) this.el.querySelector(".err")?.remove();
        if (!this.rows.length && !this.error) this.onEmpty?.();
      });
    }
    if (this.editing != null) this.mountEditor();
  }
  errHtml() {
    return this.error
      ? `<div class="err"><b>YAML 有误</b>${esc(this.error)}。切回「属性」会显示最后一次能读出的内容。</div>`
      : "";
  }
  renderSrc() {
    return `<div class="src"><textarea spellcheck="false">${esc(this.src)}</textarea>${this.errHtml()}</div>`;
  }
  plain(r) {
    if (r.type === "list") return r.value.join("、");
    if (r.type === "date") return fmtDate(r.value);
    if (r.type === "bool") return r.value ? "是" : "否";
    return String(r.value);
  }
  renderRow(r, i) {
    const editing = this.editing === i;
    let v;
    if (editing) v = "";
    else if (r.type === "list")
      v = r.value.length
        ? `<div class="chips">${r.value.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>`
        : "";
    else if (r.type === "bool")
      v = `<span class="check${r.value ? " on" : ""}" data-act="toggle" data-i="${i}">${r.value ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><path d="m5 12 4.5 4.5L19 7"/></svg>' : ""}</span>`;
    else if (r.type === "date") v = esc(fmtDate(r.value));
    else if (r.type === "url")
      v = `<a href="${esc(r.value)}" target="_blank">${esc(decodeURI(r.value).replace(/^https?:\/\//, ""))}</a>`;
    else if (r.type === "object")
      v = `${esc(r.value).replace(/\n/g, "<br>")}<em>${this.readonly ? "" : "嵌套内容在 YAML 里改"}</em>`;
    else v = esc(r.value);
    const empty = !editing && (r.value === "" || (Array.isArray(r.value) && !r.value.length));
    return `<div class="row" data-i="${i}">
      <div class="key" data-act="key" data-i="${i}">${svg(r.type)}<span>${esc(r.key)}</span></div>
      <div class="val${empty ? " empty" : ""}${r.type === "object" ? " complex" : ""}${editing ? " editing" : ""}" data-act="val" data-i="${i}">${empty ? "空" : v}</div>
    </div>`;
  }

  onClick(e) {
    const t = e.target.closest("[data-act]");
    if (!this.readonly) this.setActive(true);
    if (!t) return;
    const i = Number(t.dataset.i),
      act = t.dataset.act;
    if (act === "expand") {
      this.folded = false;
      this.variant = "line-open";
      return this.render();
    }
    if (act === "fold") {
      this.commit();
      this.folded = !this.folded;
      return this.render();
    }
    if (act === "mode-props" || act === "mode-src") {
      this.commit();
      this.mode = act === "mode-src" ? "src" : "props";
      if (this.mode === "src") this.src = this.error ? this.src : stringify(this.rows);
      return this.render();
    }
    if (this.readonly) return;
    if (act === "toggle") {
      e.stopPropagation();
      this.rows[i].value = !this.rows[i].value;
      this.save();
      return this.render();
    }
    if (act === "val") {
      const r = this.rows[i];
      if (r.type === "object") return this.keyMenu(i, t.parentElement.querySelector(".key"));
      if (r.type === "bool") {
        r.value = !r.value;
        this.save();
        return this.render();
      }
      if (this.editing !== i) {
        this.commit();
        this.editing = i;
        this.render();
      }
      return;
    }
    if (act === "key") {
      this.commit();
      return this.keyMenu(i, t);
    }
    if (act === "add") return this.addMenu(t);
  }

  mountEditor() {
    const i = this.editing,
      r = this.rows[i],
      box = this.el.querySelector(`.val[data-i="${i}"]`);
    const next = () => {
      const idx = this.rows.findIndex((x, j) => j > i && !["object", "bool"].includes(x.type));
      this.commit();
      if (idx >= 0) {
        this.editing = idx;
        this.render();
      }
    };
    if (r.type === "list") {
      this.draft = [...r.value];
      const draw = () => {
        box.innerHTML = `<div class="chips">${this.draft.map((t, k) => `<span class="chip">${esc(t)}<span class="x" data-k="${k}">×</span></span>`).join("")}<input placeholder="${this.draft.length ? "" : "输入后回车"}"></div>`;
        const inp = box.querySelector("input");
        inp.focus();
        box.querySelectorAll(".x").forEach(x =>
          x.addEventListener("click", ev => {
            ev.stopPropagation();
            this.draft.splice(+x.dataset.k, 1);
            draw();
          })
        );
        inp.addEventListener("keydown", ev => {
          if (ev.isComposing) return;
          if ((ev.key === "Enter" || ev.key === ",") && inp.value.trim()) {
            ev.preventDefault();
            this.draft.push(inp.value.trim());
            draw();
          } else if (ev.key === "Enter") {
            ev.preventDefault();
            this.commit();
          } else if (ev.key === "Backspace" && !inp.value && this.draft.length) {
            this.draft.pop();
            draw();
          } else if (ev.key === "Escape") {
            this.editing = null;
            this.render();
          } else if (ev.key === "Tab") {
            ev.preventDefault();
            if (inp.value.trim()) this.draft.push(inp.value.trim());
            next();
          }
        });
      };
      return draw();
    }
    const multi = r.type === "longtext";
    const tag = multi
      ? `<textarea rows="1"></textarea>`
      : `<input type="${r.type === "date" ? (String(r.value).includes("T") ? "datetime-local" : "date") : r.type === "number" ? "number" : "text"}">`;
    box.innerHTML = tag;
    const inp = box.firstElementChild;
    inp.value = r.value;
    inp.focus();
    if (
      inp.setSelectionRange &&
      inp.type !== "number" &&
      inp.type !== "date" &&
      inp.type !== "datetime-local"
    )
      inp.setSelectionRange(inp.value.length, inp.value.length);
    this.draft = null;
    inp.addEventListener("keydown", ev => {
      if (ev.isComposing) return;
      if (ev.key === "Enter" && !(multi && ev.shiftKey)) {
        ev.preventDefault();
        this.commit();
      } else if (ev.key === "Escape") {
        this.editing = null;
        this.render();
      } else if (ev.key === "Tab") {
        ev.preventDefault();
        next();
      }
    });
  }
  commit() {
    if (this.editing == null) return;
    const i = this.editing,
      r = this.rows[i],
      box = this.el.querySelector(`.val[data-i="${i}"]`);
    if (r.type === "list") {
      const pending = box?.querySelector("input")?.value.trim();
      r.value = pending ? [...this.draft, pending] : this.draft;
    } else if (box?.firstElementChild) {
      r.value = box.firstElementChild.value;
      if (r.type === "text" && r.value.length > 24) r.type = "longtext";
    }
    this.editing = null;
    this.save();
    this.render();
  }

  closeMenu() {
    document.querySelectorAll(".menu").forEach(m => m.remove());
  }
  openMenu(anchor, html) {
    this.closeMenu();
    const host = this.el.querySelector(".fm");
    host.insertAdjacentHTML("beforeend", `<div class="menu">${html}</div>`);
    const menu = host.querySelector(".menu"),
      a = anchor.getBoundingClientRect(),
      h = host.getBoundingClientRect();
    menu.style.left = `${a.left - h.left}px`;
    menu.style.top = `${a.bottom - h.top + 4}px`;
    menu.addEventListener("click", e => e.stopPropagation());
    return menu;
  }
  keyMenu(i, anchor) {
    const r = this.rows[i];
    const types = ["text", "longtext", "list", "date", "bool", "number", "url"];
    const menu = this.openMenu(
      anchor,
      `<input value="${esc(r.key)}" data-rename>
      <hr><div class="grp">显示为</div>
      ${
        r.type === "object"
          ? `<button disabled style="color:var(--ink-3)">${svg("object")}嵌套对象 · 在 YAML 里改</button>`
          : types
              .map(
                t =>
                  `<button data-type="${t}">${svg(t)}${TYPE_NAME[t]}${r.type === t ? '<span class="tick">✓</span>' : ""}</button>`
              )
              .join("")
      }
      <hr>
      <button data-move="-1" ${i === 0 ? "disabled" : ""}>上移</button>
      <button data-move="1" ${i === this.rows.length - 1 ? "disabled" : ""}>下移</button>
      <hr>
      <button class="danger" data-del>删除属性</button>
      <button class="danger" data-delall>删除全部属性</button>`
    );
    const rn = menu.querySelector("[data-rename]");
    const applyName = () => {
      const name = rn.value.trim();
      if (name && name !== r.key && !this.rows.some(x => x.key === name)) {
        r.key = name;
        this.save();
      }
    };
    rn.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing) {
        applyName();
        this.closeMenu();
        this.render();
      }
      if (e.key === "Escape") this.closeMenu();
    });
    rn.addEventListener("blur", () => {
      applyName();
    });
    menu.querySelectorAll("[data-type]").forEach(b =>
      b.addEventListener("click", () => {
        r.value = convert(r, b.dataset.type);
        r.type = b.dataset.type;
        this.save();
        this.closeMenu();
        this.render();
      })
    );
    menu.querySelectorAll("[data-move]").forEach(b =>
      b.addEventListener("click", () => {
        const j = i + Number(b.dataset.move);
        [this.rows[i], this.rows[j]] = [this.rows[j], this.rows[i]];
        this.save();
        this.closeMenu();
        this.render();
      })
    );
    menu.querySelector("[data-del]").addEventListener("click", () => {
      this.rows.splice(i, 1);
      this.save();
      this.closeMenu();
      this.render();
      if (!this.rows.length) this.onEmpty?.();
    });
    menu.querySelector("[data-delall]").addEventListener("click", () => {
      this.rows = [];
      this.save();
      this.closeMenu();
      this.onEmpty ? this.onEmpty() : this.render();
    });
  }
  addMenu(anchor) {
    const common = [
      ["title", "text"],
      ["tags", "list"],
      ["aliases", "list"],
      ["created", "date"],
      ["description", "longtext"],
      ["draft", "bool"],
    ].filter(([k]) => !this.rows.some(r => r.key === k));
    const menu = this.openMenu(
      anchor,
      `<input placeholder="属性名" data-name>
      ${common.length ? `<hr><div class="grp">常用</div>${common.map(([k, t]) => `<button data-k="${k}" data-t="${t}">${svg(t)}${k}</button>`).join("")}` : ""}`
    );
    const inp = menu.querySelector("[data-name]");
    inp.focus();
    const add = (key, type) => {
      if (!key || this.rows.some(r => r.key === key)) return;
      const value =
        type === "list"
          ? []
          : type === "bool"
            ? false
            : type === "date"
              ? new Date().toISOString().slice(0, 10)
              : "";
      this.rows.push({ key, type, value });
      this.save();
      this.closeMenu();
      this.editing = type === "bool" ? null : this.rows.length - 1;
      this.render();
    };
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing) add(inp.value.trim(), "text");
      if (e.key === "Escape") this.closeMenu();
    });
    menu
      .querySelectorAll("[data-k]")
      .forEach(b => b.addEventListener("click", () => add(b.dataset.k, b.dataset.t)));
  }
}

new FrontMatter(document.getElementById("fmA"));
new FrontMatter(document.getElementById("fmRead"), { readonly: true });
new FrontMatter(document.getElementById("fmFold"), { readonly: true, folded: true });
new FrontMatter(document.getElementById("fmB"), { readonly: false, folded: true, variant: "line" });

const fmC = document.getElementById("fmC"),
  docC = document.getElementById("docC");
const resetC = () => {
  fmC.innerHTML = "";
  docC.style.display = "";
  document.getElementById("btnC").style.display = "";
};
document.getElementById("btnC").addEventListener("click", e => {
  e.stopPropagation();
  docC.style.display = "none";
  e.target.style.display = "none";
  const fm = new FrontMatter(fmC, { src: "", onEmpty: resetC });
  fm.setActive(true);
  fm.addMenu(fmC.querySelector(".add"));
});

document.getElementById("modeSwitch").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  document.documentElement.dataset.mode = b.dataset.mode;
  document.querySelectorAll("#modeSwitch button").forEach(x => x.classList.toggle("on", x === b));
});
