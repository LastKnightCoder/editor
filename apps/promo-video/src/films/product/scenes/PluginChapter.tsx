/**
 * 插件 + 本地（曲内第 74–82 小节）：今日窗口上叠宣言「装一个插件，多一种能力。」，虚化期间换成插件中心 →
 * 安装微信读书（确认框 → 下载校验中 → 1.0.4 重启后生效 → 立即重启）→ 重启后侧栏「学习」组多出「微信读书」→
 * 粘贴 API Key → 校验 → 同步书架 128 本 → 打开设置 › 导入与导出 → 导出全部为 Markdown（[[文件名]] 互链）→
 * 访达里显示导出的压缩包。
 * 世界坐标：Tau 窗口居中于原点、原尺寸（今日窗口在 DailyChapter 里的机位换算过来正好对上）。
 */
import { BookOpen } from "lucide-react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { ModuleTag } from "../../../kit/ModuleTag";
import { cameraAt, Place, World, type Shot } from "../../../kit/Camera";
import { AppWindow, WINDOW } from "../../../app-kit/AppWindow";
import { PluginsPage, type InstallState } from "../../../app-kit/pages/PluginsPage";
import { WeReadPage, type WeReadState } from "../../../app-kit/pages/WeReadPage";
import { LocalDatabaseSection, SettingsScreen, TransferSection } from "../../../app-kit/pages/SettingsPage";
import { clickAt, Cursor, type CursorStop } from "../../../kit/Cursor";
import { FinderWindow } from "../../../app-kit/pages/FinderWindow";
import { ConfirmCard } from "../../../app-kit/parts/Dialog";
import { MarkdownExportDialog } from "../../../app-kit/parts/MarkdownExportDialog";
import { Toast } from "../../../app-kit/parts/Toast";
import { WindowLayer } from "../../../app-kit/parts/WindowLayer";
import { FINDER_ROWS, PLUGINS } from "../../../mock/deepwork";
import { MANIFESTOS, PLUGIN_TAGS } from "../copy";
import { at, beatFrames, P } from "../timeline";
import { DailyChapter } from "./DailyChapter";

const WEREAD_NAV = { key: "plugin:weread", label: "微信读书", icon: BookOpen };
const API_KEY = "wr_sk_7f3a9c2e81d4b6a05e";
/**
 * 光标点按的位置（窗口坐标，左上角为原点；实测自 Gallery 静帧，换算见交接文档坑 19）。
 * 安装段的固定机位要把「安装」、确认框、页顶「立即重启」、侧栏「微信读书」与连接面板都框进来。
 */
const TARGET = {
  install: { x: 465, y: 337 },
  confirm: { x: 884, y: 520 },
  restart: { x: 1340, y: 186 },
  wereadNav: { x: 80, y: 645 },
  apiKey: { x: 782, y: 445 },
  save: { x: 994, y: 445 },
  settingsNav: { x: 60, y: 872 },
  transferNav: { x: 90, y: 300 },
  choose: { x: 1158, y: 455 },
  scopeAll: { x: 512, y: 213 },
  wikiLink: { x: 899, y: 490 },
  exportButton: { x: 1063, y: 730 },
};
const INSTALL_VIEW = { x: -10, y: -30, zoom: 1.3 };
/** 导出弹窗（860×620 居中）整个框进画面，底栏留在底部模块标签上方 */
const DIALOG_VIEW = { x: 0, y: 40, zoom: 1.36 };
/** 访达窗口落在 Tau 窗口右下方 */
const FINDER = { x: 260, y: 150 };

const press = (frame: number, n: number) => frame >= at(n) - 6 && frame < at(n) + 4;

export function PluginChapter() {
  const frame = useCurrentFrame();
  const C = P.plugins;
  const I = C.install;
  const R = C.weread;
  const S = C.settings;
  const X = C.exporter;

  // —— 镜头
  // 每次运镜至少 2 拍、停住至少 1 拍；安装、重启、连接在同一个机位里完成
  const beatLen = beatFrames(C.start);
  const shots: Shot[] = [
    { at: at(C.start), x: 0, y: 0, zoom: 1.16 },
    { at: at(C.manifesto[1]) - beatLen / 2, x: 0, y: 0, zoom: 1.12, ease: ease.soft },
    { at: at(I.press) - beatLen / 2, ...INSTALL_VIEW, ease: ease.inOut },
    { at: at(R.shelf), ...INSTALL_VIEW, zoom: INSTALL_VIEW.zoom * 1.03, ease: ease.soft },
    { at: at(R.shelf) + 2 * beatLen, x: 0, y: 0, zoom: 1.14, ease: ease.inOut },
    { at: at(X.open) + 4, x: 0, y: 0, zoom: 1.16, ease: ease.soft },
    { at: at(X.open) + 4 + 2 * beatLen, ...DIALOG_VIEW, ease: ease.inOut },
    { at: at(X.finder), ...DIALOG_VIEW, zoom: DIALOG_VIEW.zoom * 1.02, ease: ease.soft },
    { at: at(X.finder) + 2.5 * beatLen, x: FINDER.x - 60, y: FINDER.y - 40, zoom: 1.15, ease: ease.inOut },
    { at: at(C.end), x: FINDER.x - 50, y: FINDER.y - 40, zoom: 1.18, ease: ease.soft },
  ];

  // 光标：每次点按前约 0.9 拍到位、停一下再按
  const moveTo = (to: { x: number; y: number }, n: number, lead = 0.9) => clickAt(to, at(n), lead * beatLen);
  const cursorPath: CursorStop[] = [
    { at: at(C.manifesto[1]), x: 900, y: 620 },
    ...moveTo(TARGET.install, I.press),
    ...moveTo(TARGET.confirm, I.ok),
    ...moveTo(TARGET.restart, I.restart),
    ...moveTo(TARGET.wereadNav, R.nav),
    ...moveTo(TARGET.apiKey, R.paste),
    ...moveTo(TARGET.save, R.save, 0.5),
    ...moveTo(TARGET.settingsNav, S.press),
    ...moveTo(TARGET.transferNav, S.nav),
    ...moveTo(TARGET.choose, S.choose),
    ...moveTo(TARGET.scopeAll, X.scope),
    ...moveTo(TARGET.wikiLink, X.link),
    ...moveTo(TARGET.exportButton, X.press),
  ];
  const camera = cameraAt(frame, shots);

  // —— 插件中心：安装 → 下载校验中 → 重启后生效 → 立即重启 → 重启（窗口内容淡空再回来）
  const install: InstallState = frame < at(I.ok) ? "available" : frame < at(I.staged) ? "installing" : frame < at(I.back) ? "staged" : "installed";
  const confirm = progress(frame, at(I.confirm), 12) * (1 - progress(frame, at(I.ok), 10));
  const restartBar = progress(frame, at(I.staged), 14, ease.inOut) * (frame < at(I.restart) + 6 ? 1 : 0);
  const blank = progress(frame, at(I.restart) + 6, 10) * (1 - progress(frame, at(I.back) - 6, 14));
  const restarted = frame >= at(I.back) - 6;

  // —— 微信读书
  const nav = restarted ? { item: WEREAD_NAV, appear: progress(frame, at(I.back), 16) } : undefined;
  const onWeread = frame >= at(R.open);
  const done = Math.round(PLUGINS.weread.total * progress(frame, at(R.sync), at(R.shelf) - at(R.sync) - 6, t => t));
  const wereadState: WeReadState =
    frame < at(R.paste)
      ? { kind: "connect", key: "" }
      : frame < at(R.save) + 4
        ? { kind: "connect", key: API_KEY, pressSave: press(frame, R.save) }
        : frame < at(R.sync)
          ? { kind: "checking", key: API_KEY }
          : frame < at(R.shelf)
            ? { kind: "syncing", done }
            : { kind: "shelf", appear: progress(frame, at(R.shelf), 50, t => t) };
  const syncToast = progress(frame, at(R.shelf) + 4, 12) * (1 - progress(frame, at(S.press) - 10, 12));

  // —— 设置 › 导入与导出 → 导出弹窗（真实是先关设置、再开弹窗）
  const settings = progress(frame, at(S.open), 10) * (1 - progress(frame, at(X.open) - 4, 8));
  const onTransfer = frame >= at(S.nav);
  const dialog = progress(frame, at(X.open), 12) * (1 - progress(frame, at(X.done), 10));
  const scope = frame >= at(X.scope) ? "全部" : "项目";
  const link = frame >= at(X.link) ? "wiki" : "relative";
  const exportProgress = frame >= at(X.press) + 4 ? 100 * progress(frame, at(X.press) + 4, at(X.done) - at(X.press) - 8, t => t) : undefined;
  const pressedField = press(frame, X.scope) ? "scope" : press(frame, X.link) ? "link" : press(frame, X.press) ? "export" : undefined;
  const exportToast = progress(frame, at(X.done) + 2, 12);
  const finder = progress(frame, at(X.finder), 20, ease.out);

  const veil = manifestoVeil(frame, at(C.manifesto[0]), at(C.manifesto[1]));
  const swapped = frame >= at(C.swap);

  const page = onWeread ? <WeReadPage state={wereadState} /> : <PluginsPage install={install} pressInstall={press(frame, I.press)} restartBar={restartBar} pressRestart={press(frame, I.restart)} />;

  return (
    <>
      <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined }}>
        {!swapped && <DailyChapter />}
        {swapped && (
          <World shots={[{ at: 0, ...camera }]}>
            <>
              <Place x={0} y={0}>
                <div className="relative" style={{ width: WINDOW.width, height: WINDOW.height }}>
                  <AppWindow active={onWeread ? "plugin:weread" : "plugins"} pluginNav={nav} pressedNav={press(frame, R.nav) ? WEREAD_NAV.key : press(frame, S.press) ? "settings" : undefined}>
                    <div style={{ opacity: 1 - blank, height: "100%" }}>{page}</div>
                  </AppWindow>
                  <WindowLayer>
                    {confirm > 0 && (
                      <ConfirmCard
                        title={`安装「微信读书」${PLUGINS.list[0].version}？`}
                        description="插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。下载后将在下次重启时安装并自动启用。"
                        confirmText="安装"
                        appear={confirm}
                        pressed={press(frame, I.ok)}
                      />
                    )}
                    {settings > 0 && (
                      <SettingsScreen active={onTransfer ? "导入与导出" : "同步"} pressedNav={press(frame, S.nav) ? "导入与导出" : undefined} appear={settings}>
                        {onTransfer ? <TransferSection pressExport={press(frame, S.choose)} /> : <LocalDatabaseSection path="/Users/tau/.editor/data.db" />}
                      </SettingsScreen>
                    )}
                    {dialog > 0 && <MarkdownExportDialog appear={dialog} scope={scope} link={link} pressed={pressedField} progress={exportProgress} />}
                    <Toast message={`同步完成，共 ${PLUGINS.weread.total} 本书，更新 ${PLUGINS.weread.total} 本`} appear={syncToast} />
                    <Cursor path={cursorPath} visibleFrom={at(C.manifesto[1])} visibleTo={at(X.done)} />
                    <Toast message={`已导出 ${PLUGINS.export.total} 篇 · ${PLUGINS.export.assets.toLocaleString("en-US")} 个资源`} appear={exportToast} />
                  </WindowLayer>
                </div>
              </Place>
              {finder > 0 && (
                <Place x={FINDER.x} y={FINDER.y} style={{ opacity: finder, transform: `translate(-50%, -50%) scale(${0.94 + 0.06 * finder})` }}>
                  <FinderWindow rows={FINDER_ROWS} selected={progress(frame, at(X.finder) + 12, 10)} />
                </Place>
              )}
            </>
          </World>
        )}
      </AbsoluteFill>
      <ModuleTag module={PLUGIN_TAGS[0].module} feature={PLUGIN_TAGS[0].feature} at={at(C.manifesto[1])} out={at(I.back)} />
      <ModuleTag module={PLUGIN_TAGS[1].module} feature={PLUGIN_TAGS[1].feature} at={at(I.back) + 6} out={at(S.open)} />
      {/* 收尾段接着画这枚标签，拉远时再退场 */}
      <ModuleTag module={PLUGIN_TAGS[2].module} feature={PLUGIN_TAGS[2].feature} at={at(S.open) + 6} out={at(C.end) + 600} />
      <ManifestoOverlay text={MANIFESTOS.plugins.text} sub={MANIFESTOS.plugins.sub} accent={MANIFESTOS.plugins.accent} at={at(C.manifesto[0])} out={at(C.manifesto[1])} size={112} />
    </>
  );
}
