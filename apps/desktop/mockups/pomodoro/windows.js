/*
  小窗 / 沉浸窗二轮（配方案 C）—— 渲染件 + 实时挂载。【视觉参考，非导出源】依赖 shared.js 的 window.P。
  形态语言对齐方案 C 控制条：底边进度线、accent 圆形主控、状态文字而非状态色块。
  四个状态：run 专注中 / paused 已暂停 / confirm 不足 5 分钟确认 / done 完成；
  另有 hov 类用于在设计稿里静态展示悬停态（真实窗口靠 :hover）。
*/
(function () {
  "use strict";
  const { icon, fmtClock, fmtDur, fmtDurCN, hm, colorOf } = P;

  const css = document.createElement("style");
  css.textContent = `
  .ww{background:var(--bg-surface);color:var(--ink-1);position:relative;overflow:hidden;user-select:none;
    box-shadow:0 0 0 1px color-mix(in srgb,var(--ink-1) 8%,transparent),var(--shadow-float)}
  .wib{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--ink-2);flex:none;transition:background 160ms,color 160ms}
  .wib:hover{background:var(--bg-hover);color:var(--ink-1)} .wib .icon{width:14px;height:14px}
  .wib.main{border-radius:50%;background:var(--accent);color:var(--ink-inverse)} .wib.main:hover{background:var(--accent-hover);color:var(--ink-inverse)}
  .paused .wib.main{background:var(--warn)} .wib.main .icon{width:12px;height:12px}
  .wbtn{height:26px;padding:0 10px;border-radius:8px;font-size:12px;font-weight:500;background:var(--bg-hover);color:var(--ink-1);white-space:nowrap;flex:none}
  .wbtn:hover{background:var(--bg-press)} .wbtn.soft{background:var(--accent-soft);color:var(--accent-text)}
  .wbtn.primary{background:var(--accent);color:var(--ink-inverse)} .wbtn.primary:hover{background:var(--accent-hover)}
  .wbtn.danger{background:var(--danger-soft);color:var(--danger)}
  .wprog{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--bg-track)}
  .wprog i{display:block;height:100%;background:var(--accent);transition:width 1s linear}
  .paused .wprog i{background:var(--warn)} .done .wprog i{background:var(--ok);width:100%!important}
  .confirm .wprog i{background:var(--warn)}
  .okc{color:var(--ok);display:inline-grid;place-items:center} .okc .icon{width:13px;height:13px;stroke-width:2.4}
  .wwarn{color:var(--warn)}

  /* ---- 小窗 A · 控制条缩影 288×68（推荐） ---- */
  .wmA{width:288px;height:68px;border-radius:14px;display:flex;align-items:center;gap:10px;padding:0 12px 2px 16px}
  .wmA .l{flex:1;min-width:0}
  .wmA .n{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);white-space:nowrap}
  .wmA .n .nm{overflow:hidden;text-overflow:ellipsis}
  .wmA .n .s{color:var(--ink-3)} .wmA.paused .n .s{color:var(--warn);font-weight:500}
  .wmA .t{font-size:26px;font-weight:500;letter-spacing:-.02em;line-height:1.12;margin-top:1px;font-variant-numeric:tabular-nums;transition:color 300ms}
  .wmA.paused .t{color:var(--ink-2)}
  .wmA .t.sm{font-size:12.5px;font-weight:400;color:var(--ink-2);letter-spacing:0;margin-top:4px}
  .wmA .r{position:relative;height:32px;display:flex;align-items:center;justify-content:flex-end;gap:2px;flex:none}
  .wmA .idle{font-size:11.5px;color:var(--ink-3);white-space:nowrap;transition:opacity 160ms;font-variant-numeric:tabular-nums}
  .wmA .ctrl{position:absolute;right:0;top:0;display:flex;align-items:center;gap:2px;opacity:0;pointer-events:none;transition:opacity 160ms}
  .wmA .ctrl .main{width:32px;height:32px}
  .wmA:hover .idle,.wmA.hov .idle,.wmA.paused .idle{opacity:0}
  .wmA:hover .ctrl,.wmA.hov .ctrl,.wmA.paused .ctrl{opacity:1;pointer-events:auto}

  /* ---- 小窗 B · 药丸 212×40 ---- */
  .wmB{width:212px;height:40px;border-radius:20px;display:flex;align-items:center;gap:8px;padding:0 12px 0 7px}
  .wmB .rw{position:relative;width:26px;height:26px;flex:none}
  .wmB .rw .ring{position:absolute;inset:0}
  .wmB .rw button{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;color:var(--ink-1)}
  .wmB .rw button .icon{width:10px;height:10px;opacity:0;transition:opacity 160ms}
  .wmB:hover .rw button .icon,.wmB.hov .rw button .icon,.wmB.paused .rw button .icon{opacity:1}
  .wmB .t{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;flex:none}
  .wmB.paused .t{color:var(--ink-2)}
  .wmB .n{font-size:12px;color:var(--ink-2);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity 160ms}
  .wmB .ctrl{position:absolute;right:6px;top:6px;display:flex;gap:0;opacity:0;pointer-events:none;transition:opacity 160ms;background:var(--bg-surface)}
  .wmB .ctrl .wib{width:28px;height:28px;border-radius:14px}
  .wmB:hover .ctrl,.wmB.hov .ctrl{opacity:1;pointer-events:auto}
  .wmB:hover .n,.wmB.hov .n{opacity:0}
  .wmB .wprog{display:none}
  .wmB.done,.wmB.confirm{padding-right:6px}
  .wmB .msg .icon{width:13px;height:13px}
  .wmB > .wib{width:26px;height:26px;border-radius:13px}
  .wmB .msg{flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:5px}

  /* ---- 小窗 C · 卡片 224×128（legacy 尺寸的重做） ---- */
  .wmC{width:224px;height:128px;border-radius:18px;padding:13px 14px 0 16px;display:flex;flex-direction:column}
  .wmC .n{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);height:22px;white-space:nowrap}
  .wmC .n .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .wmC .n .wib{width:22px;height:22px;opacity:0;transition:opacity 160ms} .wmC .n .wib .icon{width:12px;height:12px}
  .wmC:hover .n .wib,.wmC.hov .n .wib{opacity:1}
  .wmC .t{font-size:38px;font-weight:500;letter-spacing:-.03em;line-height:1.05;margin-top:2px;font-variant-numeric:tabular-nums}
  .wmC.paused .t{color:var(--ink-2)}
  .wmC .t.sm{font-size:15px;font-weight:600;letter-spacing:0;margin-top:8px;line-height:1.3}
  .wmC .b{margin-top:auto;height:40px;position:relative}
  .wmC .info{position:absolute;inset:0 0 auto 0;display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-3);padding-top:9px;transition:opacity 160ms;font-variant-numeric:tabular-nums}
  .wmC.paused .info .s{color:var(--warn);font-weight:500}
  .wmC .ctrl{position:absolute;inset:0 0 auto 0;display:flex;align-items:center;gap:4px;padding-top:3px;opacity:0;pointer-events:none;transition:opacity 160ms}
  .wmC:hover .info,.wmC.hov .info,.wmC.paused .info{opacity:0}
  .wmC:hover .ctrl,.wmC.hov .ctrl,.wmC.paused .ctrl{opacity:1;pointer-events:auto}
  .wmC.done .ctrl,.wmC.confirm .ctrl{opacity:1;pointer-events:auto}
  .wmC .wprog{height:4px}

  /* ---- 沉浸 A · 时间带（推荐）：容器查询单位，窗口多大都成比例 ---- */
  .wiA,.wiB{container-type:size;background:var(--bg-page);color:var(--ink-1);position:relative;overflow:hidden;user-select:none;width:100%;height:100%}
  /* 容器单位只能作用于后代：padding 放在内层 .in，不能写在容器自身 */
  .wiA .in{display:flex;flex-direction:column;height:100%;padding:6cqh 7cqw 5cqh}
  .wiA .top{display:flex;align-items:center;gap:1.4cqh;font-size:max(12px,2.3cqh);color:var(--ink-2)}
  .wiA .top .pdot{width:max(8px,1.4cqh);height:max(8px,1.4cqh)}
  .wiA .top .st{color:var(--ink-3)} .wiA.paused .top .st{color:var(--warn);font-weight:500}
  .wiA .top .esc{margin-left:auto;font-size:max(11px,1.7cqh);color:var(--ink-3);transition:opacity 400ms}
  .wiA .t{margin-top:auto;font-size:27cqh;font-weight:400;letter-spacing:-.045em;line-height:.95;font-variant-numeric:tabular-nums;transition:color 400ms;margin-left:-.6cqw}
  .wiA.paused .t{color:var(--ink-3)}
  .wiA .t.word{font-size:15cqh;display:flex;align-items:center;gap:3cqh;letter-spacing:-.02em}
  .wiA .t.word .okc .icon{width:9cqh;height:9cqh;stroke-width:1.6}
  .wiA .mid{display:flex;align-items:center;gap:2cqh;margin-top:3.2cqh;min-height:max(34px,6cqh)}
  .wiA .sub{font-size:max(12px,2.2cqh);color:var(--ink-2);font-variant-numeric:tabular-nums;flex:1}
  .wiA .ctrl{display:flex;align-items:center;gap:1.2cqh;opacity:0;transform:translateY(4px);transition:opacity 400ms,transform 400ms var(--ease-out)}
  .wiA.awake .ctrl,.wiA.hov .ctrl,.wiA.paused .ctrl,.wiA.done .ctrl,.wiA.confirm .ctrl{opacity:1;transform:none}
  .wiA:not(.awake):not(.hov) .top .esc{opacity:0}
  .wiA .ctrl .wib{width:max(34px,6cqh);height:max(34px,6cqh);border-radius:50%;background:var(--bg-hover)}
  .wiA .ctrl .wib .icon{width:max(14px,2.4cqh);height:max(14px,2.4cqh)}
  .wiA .ctrl .wib.main{width:max(42px,7.6cqh);height:max(42px,7.6cqh);background:var(--accent)}
  .wiA.paused .ctrl .wib.main{background:var(--warn)}
  .wiA .ctrl .wbtn{height:max(30px,5.2cqh);padding:0 max(12px,2.2cqh);font-size:max(12px,2cqh);border-radius:max(9px,1.6cqh)}
  .wiA .rib{margin-top:auto;padding-top:4.4cqh}
  .wiA .rib .ribbon{height:max(14px,3cqh)}
  .wiA .rib .ribbon-axis{font-size:max(10px,1.6cqh)}
  .wiA .conf{display:flex;align-items:center;gap:1.4cqh;font-size:max(12px,2.2cqh);color:var(--ink-1);flex:1}
  .wiA .conf .icon{color:var(--warn);width:max(14px,2.4cqh);height:max(14px,2.4cqh)}

  /* ---- 沉浸 B · 居中大字 ---- */
  .wiB{display:flex;flex-direction:column;align-items:center;justify-content:center}
  .wiB .n{font-size:max(12px,2.6cqh);color:var(--ink-2);display:flex;align-items:center;gap:1.2cqh}
  .wiB .t{font-size:30cqh;font-weight:400;letter-spacing:-.045em;line-height:1;font-variant-numeric:tabular-nums;margin-top:1cqh;transition:color 400ms}
  .wiB.paused .t{color:var(--ink-3)}
  .wiB .t.word{font-size:18cqh;display:flex;align-items:center;gap:3cqh}
  .wiB .t.word .okc .icon{width:10cqh;height:10cqh;stroke-width:1.6}
  .wiB .ln{width:40cqw;height:max(2px,.5cqh);border-radius:2px;background:var(--bg-track);margin-top:4cqh;overflow:hidden}
  .wiB .ln i{display:block;height:100%;background:var(--accent);transition:width 1s linear}
  .wiB.paused .ln i{background:var(--warn)} .wiB.done .ln i{background:var(--ok)}
  .wiB .sub{font-size:max(12px,2.1cqh);color:var(--ink-3);margin-top:2cqh;font-variant-numeric:tabular-nums}
  .wiB.paused .sub{color:var(--warn)}
  .wiB .ctrl{position:absolute;left:0;right:0;bottom:7cqh;display:flex;justify-content:center;align-items:center;gap:1.4cqh;opacity:0;transform:translateY(4px);transition:opacity 400ms,transform 400ms var(--ease-out)}
  .wiB.awake .ctrl,.wiB.hov .ctrl,.wiB.paused .ctrl,.wiB.done .ctrl,.wiB.confirm .ctrl{opacity:1;transform:none}
  .wiB .ctrl .wib{width:max(34px,6cqh);height:max(34px,6cqh);border-radius:50%;background:var(--bg-hover)}
  .wiB .ctrl .wib .icon{width:max(14px,2.4cqh);height:max(14px,2.4cqh)}
  .wiB .ctrl .wib.main{width:max(42px,7.6cqh);height:max(42px,7.6cqh);background:var(--accent)}
  .wiB.paused .ctrl .wib.main{background:var(--warn)}
  .wiB .ctrl .wbtn{height:max(30px,5.2cqh);padding:0 max(12px,2.2cqh);font-size:max(12px,2cqh);border-radius:max(9px,1.6cqh)}
  .wiB .esc{position:absolute;top:4cqh;right:4cqw;font-size:max(11px,1.7cqh);color:var(--ink-3);opacity:0;transition:opacity 400ms}
  .wiB.awake .esc,.wiB.hov .esc{opacity:1}

  /* ---- 沉浸 C · 纯黑翻牌（推荐）：不跟主题走，纯黑底 + 暖白牌面；尺寸全部按容器缩放 ---- */
  .wiF{container-type:size;background:#000;color:#e9e2d6;position:relative;overflow:hidden;user-select:none;width:100%;height:100%;
    --fd-card:#1b1916;--fd-card2:#141210;--fd-ink:#ece4d6;--fd-dim:#6e675d;--fd-mute:#4a453f;--fd-accent:hsl(22 62% 62%);--fd-warn:#c4a458;--fd-ok:#8cab87;--fd-danger:#d97e66}
  .wiF .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .wiF .clock{--ch:min(50cqh,21cqw);display:flex;align-items:center;gap:calc(var(--ch)*.07)}
  .wiF .grp{display:flex;gap:calc(var(--ch)*.045)}
  .wiF .colon{display:flex;flex-direction:column;gap:calc(var(--ch)*.2);padding:0 calc(var(--ch)*.03)}
  .wiF .colon i{width:calc(var(--ch)*.055);height:calc(var(--ch)*.055);border-radius:22%;background:#2a2622}
  .wiF .fd{position:relative;width:calc(var(--ch)*.7);height:var(--ch);perspective:calc(var(--ch)*3.2);
    font-size:calc(var(--ch)*.8);font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--fd-ink);transition:color 500ms}
  .wiF .fd .h,.wiF .fd .flap{position:absolute;left:0;right:0;height:50%;overflow:hidden;backface-visibility:hidden}
  .wiF .fd .h.up,.wiF .fd .flap.ft{top:0;border-radius:calc(var(--ch)*.07) calc(var(--ch)*.07) 0 0;background:linear-gradient(180deg,#1f1c19,var(--fd-card))}
  .wiF .fd .h.dn,.wiF .fd .flap.fb{bottom:0;border-radius:0 0 calc(var(--ch)*.07) calc(var(--ch)*.07);background:linear-gradient(180deg,var(--fd-card2),#181614)}
  .wiF .fd span{position:absolute;left:0;right:0;height:var(--ch);line-height:var(--ch);text-align:center}
  .wiF .fd .dn span,.wiF .fd .fb span{top:calc(var(--ch)*-.5)}
  /* 牌缝：纯黑细缝 + 两侧铰链缺口 */
  .wiF .fd::after{content:"";position:absolute;left:0;right:0;top:50%;height:max(2px,calc(var(--ch)*.012));margin-top:max(-1px,calc(var(--ch)*-.006));background:#000;z-index:5}
  .wiF .fd::before{content:"";position:absolute;left:calc(var(--ch)*-.012);right:calc(var(--ch)*-.012);top:50%;height:calc(var(--ch)*.05);margin-top:calc(var(--ch)*-.025);z-index:6;
    background:linear-gradient(90deg,#000 0 calc(var(--ch)*.03),transparent calc(var(--ch)*.03) calc(100% - var(--ch)*.03),#000 calc(100% - var(--ch)*.03))}
  .wiF .fd .flap.ft{transform-origin:50% 100%;animation:fdTop 280ms cubic-bezier(.4,0,.9,.6) forwards;z-index:3}
  .wiF .fd .flap.fb{transform-origin:50% 0;transform:rotateX(90deg);animation:fdBot 320ms cubic-bezier(.1,.5,.3,1) 270ms forwards;z-index:4}
  .wiF .fd .flap.ft::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.55),transparent);opacity:0;animation:fdShade 280ms forwards}
  .wiF .fd .flap.fb::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.6),transparent);animation:fdLight 320ms 270ms forwards}
  @keyframes fdTop{to{transform:rotateX(-90deg)}}
  @keyframes fdBot{to{transform:rotateX(0)}}
  @keyframes fdShade{to{opacity:1}}
  @keyframes fdLight{to{opacity:0}}
  .wiF.paused .fd{color:#5d574f}
  .wiF .meta{display:flex;align-items:center;gap:max(8px,1.2cqh);font-size:max(12px,2.1cqh);color:var(--fd-dim);margin-bottom:max(16px,4.4cqh);white-space:nowrap;padding-left:calc(var(--ch,40cqh)*.02)}
  .wiF .meta .pdot{width:max(7px,1.1cqh);height:max(7px,1.1cqh)}
  .wiF .meta .st{color:var(--fd-mute)}
  .wiF.paused .meta .st{color:var(--fd-warn);font-weight:500}
  .wiF.done .meta{color:var(--fd-ok)} .wiF.done .meta .okc{color:var(--fd-ok)} .wiF.done .meta .okc .icon{width:max(13px,2.2cqh);height:max(13px,2.2cqh)}
  /* meta / 牌 / 进度线同宽左对齐：进度线与牌组两端对齐 */
  .wiF .stack{display:flex;flex-direction:column;align-items:stretch}
  .wiF .line{margin-top:max(18px,5.2cqh)}
  .wiF .bar{height:max(2px,.35cqh);border-radius:2px;background:#1d1a17;overflow:hidden}
  .wiF .bar i{display:block;height:100%;background:var(--fd-accent);transition:width 1s linear}
  .wiF.paused .bar i{background:var(--fd-warn)} .wiF.done .bar i{background:var(--fd-ok)}
  .wiF .sub{display:flex;justify-content:space-between;margin-top:max(8px,1.4cqh);font-size:max(11px,1.8cqh);color:var(--fd-mute);font-variant-numeric:tabular-nums}
  .wiF .ctrl{position:absolute;left:0;right:0;bottom:6cqh;display:flex;justify-content:center;align-items:center;gap:max(10px,1.6cqh);opacity:0;transform:translateY(6px);transition:opacity 500ms,transform 500ms var(--ease-out)}
  .wiF.awake .ctrl,.wiF.hov .ctrl,.wiF.paused .ctrl,.wiF.done .ctrl,.wiF.confirm .ctrl{opacity:1;transform:none}
  .wiF .ctrl .wib{width:max(36px,6.4cqh);height:max(36px,6.4cqh);border-radius:50%;background:#171513;color:#a39b8f}
  .wiF .ctrl .wib:hover{background:#24211d;color:var(--fd-ink)}
  .wiF .ctrl .wib .icon{width:max(14px,2.4cqh);height:max(14px,2.4cqh)}
  .wiF .ctrl .wib.main{width:max(44px,8cqh);height:max(44px,8cqh);background:var(--fd-accent);color:#1a120b}
  .wiF.paused .ctrl .wib.main{background:var(--fd-warn)}
  .wiF .ctrl .wbtn{height:max(30px,5.4cqh);padding:0 max(14px,2.4cqh);font-size:max(12px,2cqh);border-radius:max(9px,1.6cqh);background:#171513;color:#cfc6b8}
  .wiF .ctrl .wbtn:hover{background:#24211d}
  .wiF .ctrl .wbtn.primary{background:var(--fd-accent);color:#1a120b}
  .wiF .ctrl .wbtn.danger{background:#2a1813;color:var(--fd-danger)}
  .wiF .ctrl .cf{font-size:max(12px,2cqh);color:var(--fd-warn);margin-right:max(4px,.8cqh)}
  .wiF .esc{position:absolute;top:4cqh;right:4cqw;font-size:max(11px,1.7cqh);color:var(--fd-mute);opacity:0;transition:opacity 500ms}
  .wiF .esc kbd{background:#171513;color:#8a8378}
  .wiF.awake .esc,.wiF.hov .esc{opacity:1}

  /* ---- 实时挂载外壳 ---- */
  .wfloat{position:fixed;right:22px;bottom:22px;z-index:250;border-radius:20px;animation:wIn 260ms var(--ease-out);cursor:grab}
  .wfloat:active{cursor:grabbing}
  .wfloat .cap{position:absolute;left:0;right:0;top:-20px;text-align:center;font-size:10.5px;color:var(--ink-3);pointer-events:none}
  @keyframes wIn{from{opacity:0;transform:translateY(10px) scale(.97)}}
  .wfull{position:fixed;inset:0;z-index:500;opacity:0;pointer-events:none;transition:opacity 420ms var(--ease-out)}
  .wfull.open{opacity:1;pointer-events:auto}
  `;
  document.head.appendChild(css);

  /* ---------- 状态 ---------- */
  function liveState() {
    const t = P.timing();
    if (!t) return null;
    const s = P.timer.session,
      cd = t.remain !== undefined;
    return {
      mode: t.paused ? "paused" : "run",
      pid: t.preset.id,
      name: t.preset.name,
      time: fmtClock(t.display),
      progress: t.progress,
      status: t.paused ? "已暂停" : cd ? "剩余" : "已专注",
      ends: cd && !t.paused ? `${hm(t.endsAt)} 结束` : cd ? "结束时间顺延" : "正计时",
      sub: t.paused
        ? `已专注 ${fmtClock(t.elapsed)} · 空格继续`
        : cd
          ? `已专注 ${fmtClock(t.elapsed)} · 预计 ${hm(t.endsAt)} 结束`
          : `${hm(s.startTime)} 开始 · 正计时`,
      willDiscard: t.willDiscard,
      elapsedText: `已专注 ${fmtClock(t.elapsed)}${s.pauseCount ? ` · 暂停 ${s.pauseCount} 次` : ""}`,
      endsText: t.paused
        ? "已暂停 · 空格继续"
        : cd
          ? `预计 ${hm(t.endsAt)} 结束`
          : `${hm(s.startTime)} 开始 · 正计时`,
    };
  }
  const doneState = saved => {
    const p = P.presetById(saved.presetId),
      td = P.todaySummary();
    return {
      mode: "done",
      pid: saved.presetId,
      name: p ? p.name : "已删除的预设",
      early: P.isEarly(saved),
      mins: `${Math.round(saved.focusMs / P.MIN)} 分钟`,
      sub: `${P.isEarly(saved) ? "提前结束 · " : ""}专注 ${fmtDurCN(saved.focusMs)} · 今天第 ${td.count} 个，共 ${fmtDur(td.focusMs)}`,
      progress: 1,
      final: saved.expectedMs && !P.isEarly(saved) ? "00:00" : fmtClock(saved.focusMs),
    };
  };
  const btn = (w, ic, title, cls = "wib") =>
    `<button class="${cls}" data-w="${w}" title="${title}">${icon(ic, ic === "play" || ic === "pause" ? "fill" : "")}</button>`;
  const tgl = st =>
    btn("toggle", st.mode === "paused" ? "play" : "pause", "暂停 / 继续（空格）", "wib main");
  const dot = st => `<span class="pdot" style="--c:${colorOf(st.pid)}"></span>`;
  const ok = `<span class="okc">${icon("check")}</span>`;

  /* ---------- 翻牌：两段式（上片翻下 → 下片翻上），只翻变化的那一位 ---------- */
  const digitHTML = d =>
    `<div class="fd" data-v="${d}"><div class="h up"><span>${d}</span></div><div class="h dn"><span>${d}</span></div></div>`;
  function flipHTML(str) {
    return str
      .split(":")
      .map(g => `<div class="grp">${[...g].map(digitHTML).join("")}</div>`)
      .join('<div class="colon"><i></i><i></i></div>');
  }
  function setFlip(el, str) {
    const groups = str.split(":");
    const cur = el.querySelectorAll(".grp");
    if (
      cur.length !== groups.length ||
      [...cur].some((g, i) => g.children.length !== groups[i].length)
    ) {
      el.innerHTML = flipHTML(str);
      return;
    }
    const digits = groups.join("");
    el.querySelectorAll(".fd").forEach((fd, i) => {
      const nv = digits[i],
        ov = fd.dataset.v;
      if (nv === ov) return;
      fd.dataset.v = nv;
      fd.querySelectorAll(".flap").forEach(f => f.remove());
      fd.querySelector(".up span").textContent = nv;
      fd.querySelector(".dn span").textContent = ov;
      fd.insertAdjacentHTML(
        "beforeend",
        `<div class="flap ft"><span>${ov}</span></div><div class="flap fb"><span>${nv}</span></div>`
      );
      const fb = fd.querySelector(".fb");
      fb.addEventListener(
        "animationend",
        () => {
          fd.querySelector(".dn span").textContent = fd.dataset.v;
          fd.querySelectorAll(".flap").forEach(f => f.remove());
        },
        { once: true }
      );
    });
  }

  /* ---------- 渲染件：返回外层 class 与 innerHTML（data-k 挂可变字段） ---------- */
  const R = {
    mA(st) {
      let l, r;
      if (st.mode === "done") {
        l = `<div class="n">${ok}<span class="nm">完成「${st.name}」</span></div><div class="t sm">${st.early ? "提前结束 · " : ""}${st.mins}</div>`;
        r = `<button class="wbtn soft" data-w="again">再来一个</button>${btn("close", "x", "关闭小窗")}`;
      } else if (st.mode === "confirm") {
        l = `<div class="n wwarn">${icon("alert")}<span class="nm">不足 5 分钟</span></div><div class="t sm">结束后不会留下记录</div>`;
        r = `<button class="wbtn" data-w="keep">继续</button><button class="wbtn danger" data-w="discard">结束</button>`;
      } else {
        l = `<div class="n">${dot(st)}<span class="nm">${st.name}</span><span class="s" data-k="status">${st.status}</span></div><div class="t" data-k="time">${st.time}</div>`;
        r = `<span class="idle" data-k="ends">${st.ends}</span><div class="ctrl">${tgl(st)}${btn("stop", "stop", "结束")}${btn("back", "expand", "回到主窗口")}</div>`;
      }
      return {
        cls: "ww wmA",
        html: `<div class="l">${l}</div><div class="r">${r}</div><div class="wprog"><i data-k="bar" style="width:${st.progress * 100}%"></i></div>`,
      };
    },
    mB(st) {
      let h;
      if (st.mode === "done")
        h = `<span class="msg">${ok}${st.name} · ${st.mins}</span><button class="wbtn soft" data-w="again">再来</button>${btn("close", "x", "关闭小窗")}`;
      else if (st.mode === "confirm")
        h = `<span class="msg wwarn" title="不足 5 分钟，结束后不会留下记录">${icon("alert")}不足 5 分钟</span><button class="wbtn danger" data-w="discard">结束</button>${btn("keep", "x", "继续专注")}`;
      else
        h = `<span class="rw">${P.ringSVG(26, 3, st.progress, st.mode === "paused")}<button data-w="toggle" title="暂停 / 继续">${icon(st.mode === "paused" ? "play" : "pause", "fill")}</button></span>
          <span class="t" data-k="time">${st.time}</span><span class="n">${st.mode === "paused" ? "已暂停" : st.name}</span>
          <span class="ctrl">${btn("stop", "stop", "结束")}${btn("back", "expand", "回到主窗口")}</span>`;
      return { cls: "ww wmB", html: h };
    },
    mC(st) {
      let top, mid, b;
      if (st.mode === "done") {
        top = `${ok}<span class="nm">完成</span>`;
        mid = `<div class="t sm">「${st.name}」${st.early ? "提前结束" : ""}<br><span style="font-weight:400;color:var(--ink-2)">${st.mins}</span></div>`;
        b = `<div class="ctrl"><button class="wbtn soft" data-w="again">再来一个</button><span class="spacer"></span>${btn("close", "x", "关闭小窗")}</div>`;
      } else if (st.mode === "confirm") {
        top = `<span class="wwarn" style="display:flex;align-items:center;gap:6px">${icon("alert")}不足 5 分钟</span>`;
        mid = `<div class="t sm" style="font-weight:400;font-size:12.5px;color:var(--ink-2)">结束后不会留下记录</div>`;
        b = `<div class="ctrl"><button class="wbtn" data-w="keep">继续专注</button><button class="wbtn danger" data-w="discard">结束</button></div>`;
      } else {
        top = `${dot(st)}<span class="nm">${st.name}</span>${btn("back", "expand", "回到主窗口")}`;
        mid = `<div class="t" data-k="time">${st.time}</div>`;
        b = `<div class="info"><span class="s" data-k="status">${st.status}</span><span data-k="ends">${st.ends}</span></div>
          <div class="ctrl">${tgl(st)}${btn("stop", "stop", "结束")}${btn("sound", "music", "背景音")}</div>`;
      }
      return {
        cls: "ww wmC",
        html: `<div class="n">${top}</div>${mid}<div class="b">${b}</div><div class="wprog"><i data-k="bar" style="width:${st.progress * 100}%"></i></div>`,
      };
    },
    iA(st) {
      let t, mid;
      if (st.mode === "done") {
        t = `<div class="t word">${ok}完成</div>`;
        mid = `<span class="sub">${st.sub}</span><div class="ctrl"><button class="wbtn primary" data-w="again">再来一个</button><button class="wbtn" data-w="exit">退出沉浸</button></div>`;
      } else if (st.mode === "confirm") {
        t = `<div class="t" data-k="time">${st.time}</div>`;
        mid = `<span class="conf">${icon("alert")}专注不足 5 分钟，结束后不会留下记录</span><div class="ctrl"><button class="wbtn" data-w="keep">继续专注</button><button class="wbtn danger" data-w="discard">仍然结束</button></div>`;
      } else {
        t = `<div class="t" data-k="time">${st.time}</div>`;
        mid = `<span class="sub" data-k="sub">${st.sub}</span><div class="ctrl">${btn("sound", "music", "背景音")}${btn("stop", "stop", "结束")}${tgl(st)}</div>`;
      }
      return {
        cls: "wiA",
        html: `<div class="in"><div class="top">${dot(st)}<span>${st.name}</span><span class="st" data-k="status">${st.mode === "done" ? "" : `· ${st.status}`}</span><span class="esc"><kbd>Esc</kbd> 退出沉浸</span></div>
          ${t}<div class="mid">${mid}</div>
          <div class="rib"><div class="ribbon" data-k="rib">${P.ribbonHTML(P.sessions)}</div>${P.ribbonAxis()}</div></div>`,
      };
    },
    iF(st) {
      let meta, ctrl;
      if (st.mode === "done") {
        meta = `${ok}完成「${st.name}」<span class="st" style="color:inherit">· ${st.sub}</span>`;
        ctrl = `<button class="wbtn primary" data-w="again">再来一个</button><button class="wbtn" data-w="exit">退出沉浸</button>`;
      } else {
        meta = `${dot(st)}<span>${st.name}</span><span class="st" data-k="status">· ${st.status}</span>`;
        ctrl =
          st.mode === "confirm"
            ? `<span class="cf">不足 5 分钟，结束后不会留下记录</span><button class="wbtn" data-w="keep">继续专注</button><button class="wbtn danger" data-w="discard">仍然结束</button>`
            : `${btn("sound", "music", "背景音")}${tgl(st)}${btn("stop", "stop", "结束")}${btn("exit", "x", "退出沉浸 (Esc)")}`;
      }
      const left = st.mode === "done" ? "" : st.elapsedText || "";
      const right = st.mode === "done" ? "" : st.endsText || "";
      return {
        cls: "wiF",
        html: `<span class="esc"><kbd>Esc</kbd> 退出</span><div class="in"><div class="stack"><div class="meta">${meta}</div>
          <div class="clock" data-k="flip">${flipHTML(st.mode === "done" ? st.final || "00:00" : st.time)}</div>
          <div class="line"><div class="bar"><i data-k="bar" style="width:${st.progress * 100}%"></i></div>
            <div class="sub"><span data-k="elapsedText">${left}</span><span data-k="endsText">${right}</span></div></div></div></div>
          <div class="ctrl">${ctrl}</div>`,
      };
    },
    iB(st) {
      let t, ctrl;
      if (st.mode === "done") {
        t = `<div class="t word">${ok}完成</div>`;
        ctrl = `<button class="wbtn primary" data-w="again">再来一个</button><button class="wbtn" data-w="exit">退出沉浸</button>`;
      } else if (st.mode === "confirm") {
        t = `<div class="t" data-k="time">${st.time}</div>`;
        ctrl = `<span class="wwarn" style="font-size:max(12px,2.1cqh)">不足 5 分钟，结束不留记录</span><button class="wbtn" data-w="keep">继续</button><button class="wbtn danger" data-w="discard">仍然结束</button>`;
      } else {
        t = `<div class="t" data-k="time">${st.time}</div>`;
        ctrl = `${btn("sound", "music", "背景音")}${tgl(st)}${btn("stop", "stop", "结束")}`;
      }
      return {
        cls: "wiB",
        html: `<span class="esc"><kbd>Esc</kbd> 退出沉浸</span><div class="n">${dot(st)}${st.name}</div>${t}
          <div class="ln"><i data-k="bar" style="width:${st.progress * 100}%"></i></div>
          <div class="sub" data-k="sub">${st.mode === "done" ? st.sub : st.mode === "paused" ? "已暂停 · 空格继续" : st.sub}</div><div class="ctrl">${ctrl}</div>`,
      };
    },
  };

  /** 静态渲染（设计稿状态矩阵用） */
  function paint(el, kind, st, extra = "") {
    const r = R[kind](st);
    el.className = `${r.cls} ${st.mode} ${extra}`.trim();
    el.innerHTML = r.html;
  }

  /**
   * 实时挂载：模式变化才整块重绘（避免点击期间节点被替换），逐秒只改 data-k 字段。
   * confirm / done 是窗口本地态：结束不足 5 分钟 → confirm；结束或到点 → done。
   */
  function mountLive(el, kind, opts = {}) {
    let local = null,
      lastMode = null;
    function render() {
      const live = liveState();
      if (live && local && local.mode === "done") local = null;
      if (!live && local && local.mode === "confirm") local = null;
      const st = local
        ? local.mode === "confirm" && live
          ? { ...live, mode: "confirm" }
          : local
        : live;
      if (!st) return opts.onEmpty && opts.onEmpty();
      const extra = el.classList.contains("awake") ? "awake" : "";
      if (st.mode !== lastMode) {
        paint(el, kind, st, extra);
        lastMode = st.mode;
        return;
      }
      el.querySelectorAll("[data-k]").forEach(n => {
        const k = n.dataset.k;
        if (k === "bar") n.style.width = st.progress * 100 + "%";
        else if (k === "rib") n.innerHTML = P.ribbonHTML(P.sessions);
        else if (k === "flip") setFlip(n, st.time);
        else if (k === "status") {
          if (st.status)
            n.textContent = kind === "iA" || kind === "iF" ? `· ${st.status}` : st.status;
        } else if (st[k] !== undefined) n.textContent = st[k];
      });
      el.querySelectorAll(".ring").forEach(r => P.setRing(r, st.progress, st.mode === "paused"));
    }
    el.addEventListener("click", e => {
      const w = e.target.closest("[data-w]")?.dataset.w;
      if (!w) return;
      e.stopPropagation();
      if (w === "toggle") P.toggle();
      if (w === "sound") P.openSound(e.target.closest("[data-w]"), { placement: "top" });
      if (w === "stop") {
        const l = liveState();
        if (l && l.willDiscard) local = { mode: "confirm" };
        else finish(P.stopByUser());
      }
      if (w === "keep") local = null;
      if (w === "discard") finish(P.stopByUser());
      if (w === "again") {
        const pid = local && local.pid;
        local = null;
        if (pid) P.start(pid);
      }
      if (w === "close" || w === "exit" || w === "back") (opts.onClose || (() => {}))(w);
      render();
    });
    function finish(r) {
      if (!r) return;
      if (r.discarded) {
        local = null;
        P.toast("不足 5 分钟，本次未记录");
        opts.onClose && opts.onClose("discarded");
      } else local = doneState(r.saved);
      render();
    }
    const off = P.on((type, payload) => {
      if (type === "completed") local = doneState(payload);
      render();
    });
    render();
    return { destroy: off, render };
  }

  /* ---------- 页面里的示意：小窗（可拖动浮窗）/ 沉浸（全屏盖在最上层） ---------- */
  let miniEl = null,
    miniCtl = null;
  function openMini(kind = "mA") {
    if (miniEl || !P.timer.session) return;
    miniEl = document.createElement("div");
    miniEl.className = "wfloat";
    const inner = document.createElement("div");
    miniEl.innerHTML = `<span class="cap">小窗 · 独立置顶窗口示意 · 可拖动</span>`;
    miniEl.appendChild(inner);
    document.body.appendChild(miniEl);
    miniCtl = mountLive(inner, kind, { onClose: closeMini, onEmpty: () => {} });
    let drag = null;
    miniEl.addEventListener("mousedown", e => {
      if (e.target.closest("button")) return;
      const r = miniEl.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    });
    addEventListener("mousemove", e => {
      if (!drag || !miniEl) return;
      Object.assign(miniEl.style, {
        left: e.clientX - drag.dx + "px",
        top: e.clientY - drag.dy + "px",
        right: "auto",
        bottom: "auto",
      });
    });
    addEventListener("mouseup", () => (drag = null));
  }
  function closeMini() {
    if (!miniEl) return;
    miniCtl.destroy();
    miniEl.remove();
    miniEl = null;
  }

  let fullEl = null,
    fullCtl = null,
    idleT = null;
  function openImmersive(kind = "iF") {
    if (fullEl || !P.timer.session) return;
    fullEl = document.createElement("div");
    fullEl.className = "wfull";
    const inner = document.createElement("div");
    fullEl.appendChild(inner);
    document.body.appendChild(fullEl);
    fullCtl = mountLive(inner, kind, { onClose: closeImmersive, onEmpty: () => {} });
    const wake = () => {
      inner.classList.add("awake");
      clearTimeout(idleT);
      idleT = setTimeout(() => inner.classList.remove("awake"), 2200);
    };
    fullEl.addEventListener("mousemove", wake);
    wake();
    requestAnimationFrame(() => fullEl.classList.add("open"));
  }
  function closeImmersive() {
    if (!fullEl) return;
    const el = fullEl;
    fullEl = null;
    fullCtl.destroy();
    el.classList.remove("open");
    setTimeout(() => el.remove(), 420);
  }
  document.addEventListener(
    "keydown",
    e => {
      if (!fullEl || document.querySelector(".pop,.menu")) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeImmersive();
      }
      if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        P.toggle();
      }
    },
    true
  );

  window.W = {
    R,
    setFlip,
    paint,
    mountLive,
    liveState,
    doneState,
    openMini,
    closeMini,
    openImmersive,
    closeImmersive,
    immersiveOpen: () => !!fullEl,
  };
  // 方案页里的「小窗 / 沉浸」入口与快捷键 I 统一走二轮设计
  P.openMini = () => openMini();
  P.openImmersive = () => openImmersive();
})();
