/*
 * Tau PPT 公共运行时：翻页导航、进度与页码、计数/条形图动画、全屏、O 键全览。
 * 由 utils/ppt-runtime.ts 在预览与下载时内联进 PPT，页面只声明结构与样式，通过 data-deck-* 钩子接入；
 * 钩子约定以 constants/prompts/ppt-generation.ts「公共运行时」一节为准。
 */
(() => {
  "use strict";

  const CJK_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const ROMAN_TABLE = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  function toRoman(n) {
    let rest = n;
    let out = "";
    for (const [value, symbol] of ROMAN_TABLE) {
      while (rest >= value) {
        out += symbol;
        rest -= value;
      }
    }
    return out;
  }

  // 只覆盖 1–99，演示文稿页数不会超出
  function toCjk(n) {
    if (n < 10) return CJK_DIGITS[n];
    const tens = Math.floor(n / 10);
    return (tens === 1 ? "" : CJK_DIGITS[tens]) + "十" + CJK_DIGITS[n % 10];
  }

  function formatNumber(n, format) {
    switch (format) {
      case "pad2":
        return String(n).padStart(2, "0");
      case "roman":
        return toRoman(n);
      case "cjk":
        return toCjk(n);
      default:
        return String(n);
    }
  }

  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  class Deck {
    constructor() {
      this.slides = Array.from(document.querySelectorAll(".slide"));
      this.total = this.slides.length;
      const initial = this.slides.findIndex(s => s.classList.contains("active"));
      this.current = initial === -1 ? 0 : initial;
      this.lockDuration = Number(document.body.dataset.deckLock) || 600;
      this.locked = false;
      this.overview = null;
      this.touchStart = null;

      this.slides.forEach((s, i) => s.classList.toggle("active", i === this.current));
      document.querySelectorAll("[data-deck-total]").forEach(el => {
        el.textContent = formatNumber(this.total, el.dataset.deckTotal);
      });
      this.dots = this.buildDots();

      this.bindKeyboard();
      this.bindWheel();
      this.bindTouch();
      this.render(-1);
    }

    buildDots() {
      const container = document.querySelector("[data-deck-dots]");
      if (!container) return [];
      const className = container.dataset.deckDots || "deck-dot";
      return this.slides.map((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = className;
        dot.setAttribute("aria-label", `第 ${i + 1} 页`);
        dot.addEventListener("click", () => this.goTo(i));
        container.appendChild(dot);
        return dot;
      });
    }

    next() {
      this.goTo(this.current + 1);
    }
    prev() {
      this.goTo(this.current - 1);
    }

    goTo(index) {
      if (this.locked) return;
      const target = Math.max(0, Math.min(this.total - 1, index));
      if (target === this.current) return;

      const previous = this.current;
      const outgoing = this.slides[previous];
      const incoming = this.slides[target];
      document.documentElement.dataset.deckDirection = target > previous ? "forward" : "backward";

      this.locked = true;
      this.current = target;
      outgoing.classList.remove("active");
      outgoing.classList.add("is-leaving");
      incoming.classList.add("is-entering");
      // 先让 is-entering 的起始位置生效一帧，再切到 active 才有过渡
      requestAnimationFrame(() => {
        incoming.classList.add("active");
        incoming.classList.remove("is-entering");
      });
      setTimeout(() => {
        outgoing.classList.remove("is-leaving");
        this.locked = false;
      }, this.lockDuration);

      this.render(previous);
    }

    render(previous) {
      const index = this.current;
      const ratio = this.total > 1 ? index / (this.total - 1) : 1;

      this.slides.forEach((s, i) => {
        if (i === index) s.setAttribute("aria-current", "page");
        else s.removeAttribute("aria-current");
      });
      document.querySelectorAll("[data-deck-progress]").forEach(el => {
        el.style.width = ratio * 100 + "%";
        if (el.getAttribute("role") === "progressbar") {
          el.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
        }
      });
      document.querySelectorAll("[data-deck-current]").forEach(el => {
        el.textContent = formatNumber(index + 1, el.dataset.deckCurrent);
      });
      this.dots.forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });

      this.playEffects(this.slides[index]);
      document.dispatchEvent(
        new CustomEvent("deck:change", {
          detail: { index, previous, total: this.total, slide: this.slides[index] },
        })
      );
    }

    playEffects(slide) {
      const reduced = prefersReducedMotion();
      slide.querySelectorAll("[data-percent]").forEach(el => {
        if (el.dataset.deckPlayed) return;
        el.dataset.deckPlayed = "true";
        const apply = () => {
          el.style.width = el.dataset.percent + "%";
        };
        if (reduced) apply();
        else setTimeout(apply, 300);
      });
      slide.querySelectorAll("[data-count]").forEach(el => {
        if (el.dataset.deckPlayed) return;
        el.dataset.deckPlayed = "true";
        this.animateCount(el, reduced);
      });
    }

    // 小数位取自 data-count 字面值，如 "1.1" 保留 1 位
    animateCount(el, reduced) {
      const raw = el.dataset.count;
      const target = parseFloat(raw);
      if (!Number.isFinite(target)) return;
      const decimals = (raw.split(".")[1] || "").length;
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";
      const show = value => {
        el.textContent = prefix + value.toFixed(decimals) + suffix;
      };

      if (reduced) {
        show(target);
        return;
      }
      show(0);
      const duration = 1600;
      setTimeout(() => {
        const start = performance.now();
        const tick = now => {
          const p = Math.min((now - start) / duration, 1);
          show(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 300);
    }

    bindKeyboard() {
      document.addEventListener("keydown", e => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
        if (this.overview) {
          if (e.key === "Escape" || e.key === "o" || e.key === "O") {
            e.preventDefault();
            this.closeOverview();
          }
          return;
        }
        switch (e.key) {
          case "ArrowRight":
          case "ArrowDown":
          case " ":
          case "PageDown":
            e.preventDefault();
            this.next();
            break;
          case "ArrowLeft":
          case "ArrowUp":
          case "PageUp":
            e.preventDefault();
            this.prev();
            break;
          case "Home":
            e.preventDefault();
            this.goTo(0);
            break;
          case "End":
            e.preventDefault();
            this.goTo(this.total - 1);
            break;
          case "f":
          case "F":
            e.preventDefault();
            this.toggleFullscreen();
            break;
          case "o":
          case "O":
            e.preventDefault();
            this.openOverview();
            break;
        }
      });
    }

    bindWheel() {
      document.addEventListener(
        "wheel",
        e => {
          // 全览打开时放行滚轮，让缩略图网格可以滚动
          if (this.overview) return;
          e.preventDefault();
          if (this.locked || Math.abs(e.deltaY) < 15) return;
          if (e.deltaY > 0) this.next();
          else this.prev();
        },
        { passive: false }
      );
    }

    bindTouch() {
      document.addEventListener(
        "touchstart",
        e => {
          if (e.touches.length !== 1) return;
          this.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        },
        { passive: true }
      );
      document.addEventListener(
        "touchend",
        e => {
          if (!this.touchStart || this.overview || e.changedTouches.length !== 1) return;
          const dx = this.touchStart.x - e.changedTouches[0].clientX;
          const dy = this.touchStart.y - e.changedTouches[0].clientY;
          this.touchStart = null;
          const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
          if (Math.abs(delta) < 50) return;
          if (delta > 0) this.next();
          else this.prev();
        },
        { passive: true }
      );
    }

    toggleFullscreen() {
      if (!document.fullscreenElement)
        document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    }

    openOverview() {
      const grid = document.createElement("div");
      grid.className = "ov-grid";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "ov-close";
      close.setAttribute("aria-label", "关闭全览");
      close.textContent = "×";
      close.addEventListener("click", () => this.closeOverview());
      grid.appendChild(close);

      const aspectRatio = (window.innerWidth / window.innerHeight).toFixed(4);
      this.slides.forEach((slide, i) => {
        const card = document.createElement("div");
        card.className = "ov-card" + (i === this.current ? " ov-current" : "");
        card.style.aspectRatio = aspectRatio;
        const inner = document.createElement("div");
        inner.className = "ov-inner";
        const clone = slide.cloneNode(true);
        clone.removeAttribute("id");
        clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        clone.classList.add("active");
        clone.classList.remove("is-leaving", "is-entering");
        inner.appendChild(clone);
        const num = document.createElement("span");
        num.className = "ov-num";
        num.textContent = String(i + 1);
        card.append(inner, num);
        card.addEventListener("click", () => {
          this.closeOverview();
          this.goTo(i);
        });
        grid.appendChild(card);
      });

      document.body.appendChild(grid);
      this.overview = grid;
      requestAnimationFrame(() => {
        grid.querySelectorAll(".ov-inner").forEach(inner => {
          const card = inner.parentElement;
          const scale = Math.min(
            card.offsetWidth / window.innerWidth,
            card.offsetHeight / window.innerHeight
          );
          inner.style.transform = `scale(${scale})`;
        });
        grid.classList.add("ov-visible");
      });
    }

    closeOverview() {
      if (!this.overview) return;
      this.overview.remove();
      this.overview = null;
    }
  }

  const start = () => {
    window.deck = new Deck();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
