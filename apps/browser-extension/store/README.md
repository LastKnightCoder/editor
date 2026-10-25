# 商店素材

上架 Chrome 应用商店与 Edge 加载项商店用的截图、宣传图和后台填写内容。

- `screenshots/`：每张图一个 HTML，共用 `shared.css`（颜色取 `@tau/themes` 的暖纸主题变量）、`scene.js`（浏览器外框、示例文章、浮层定位）和 `icons.js`（lucide 图标）。文章与网站都是虚构的。
- `render.mjs`：把每个 HTML 按 1 倍像素渲染成 PNG，输出到 `output/`（不入库）。尺寸取页面里的 `<meta name="shot-size">`，缺省 1280×800。渲染时会检查浮层是否越出画布、是否压住标题区，以及有没有缺失的图标，有问题时打印警告。
- `submission.md`：后台各栏的填写内容，包括商品说明、单一用途、权限理由、数据使用声明和给审核员的测试说明。

## 生成图片

在仓库根目录执行：

```sh
pnpm --filter browser-extension store:shots
```

首次运行前如果没有 Chromium，先执行 `pnpm --filter browser-extension exec playwright install chromium`。

## 修改素材

- 扩展界面改版后，按 `src/content/ui` 与 `src/library` 的新样子同步对应 HTML 和 `shared.css`。
- 新增图标：在 `icons.js` 的 `ICONS` 里补上同名条目，路径取自 `lucide-react/dist/esm/icons/<名>.js` 的 `__iconNode`。
- 扩展的权限或数据流向变化时，同时更新 `submission.md` 与官网隐私政策 `apps/website/content/docs/browser-companion-privacy.md`。
