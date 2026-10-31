// 宿主能力页 + 页签与主题切换
(function () {
  const pre = s => `<pre class="code">${s}</pre>`;
  document.getElementById("host-doc").innerHTML = `<div class="cap-doc">
  <h2>结论：不加专用能力，给编辑器注入一个通用 fetch</h2>
  <p>你说得对，跨域请求已经有现成实现，不需要在主进程 / Rust 再写一个「读取网页信息」模块：</p>
  <ul>
    <li>桌面：<code>commands/fetch.ts</code> 的 <code>desktopFetch</code>，经 <code>fetch:open/read</code> IPC 由主进程发请求，插件的 <code>ctx.fetch</code>、MCP 工具、AI 图片都在用。</li>
    <li>移动：<code>app/plugins/transport.ts</code> 的 <code>createPluginFetch</code>，走 <code>plugin_fetch_*</code> 命令（reqwest）。</li>
  </ul>
  <p>缺的只是<b>编辑器扩展拿不到它</b>：<code>ctx.fetch</code> 挂在插件的 <code>activate(context)</code> 上，而书签是内置编辑器扩展，能用的宿主能力只有 <code>@tau/shared/host-services</code> 里注册的服务（现在是资源、文件、打开链接三个）。所以只需要把已有的 fetch 注册成一个服务，网页解析放在渲染进程用 <code>DOMParser</code> 做，两端共用同一份解析代码和测试。</p>

  <table class="cap-table">
    <thead><tr><th style="width:150px">能力</th><th style="width:70px">现状</th><th>桌面 / 移动端实现</th><th style="width:320px">书签里怎么用</th></tr></thead>
    <tbody>
      <tr><td>打开网页</td><td><span class="st have">已有</span></td><td><code>IOpenerService.open</code> → 桌面 <code>openExternal</code> / 移动 <code>tauriOpenUrl</code></td><td>单击卡片、操作条「打开」都调用 <code>useOpenLink()</code></td></tr>
      <tr><td><b>跨域请求</b></td><td><span class="st new">新增注册</span></td><td>新增服务 id <code>IFetchService</code>，只是把现成实现注册进编辑器：桌面 <code>desktopFetch</code>；移动复用 <code>plugin_fetch_*</code> 传输（需要一个不绑定插件的宿主 token）</td><td>插入时、「重新读取」时请求网页和封面图；没注册（官网文档站）时直接生成网址卡</td></tr>
      <tr><td>封面/图标存储</td><td><span class="st have">已有</span></td><td><code>IResourceService.upload</code>，跟随「资源存储」设置</td><td>用 fetch 下载 og:image 和图标 → 包成 <code>File</code> → <code>upload</code>。设置为本地就存进 <code>~/.editor/resources</code>，选了上传插件就传到图床</td></tr>
      <tr><td>上传自定义封面</td><td><span class="st have">已有</span></td><td><code>IResourceService.upload</code></td><td>编辑面板「上传图片」</td></tr>
      <tr><td>复制链接</td><td><span class="st have">已有</span></td><td><code>navigator.clipboard</code></td><td>操作条「复制链接」</td></tr>
    </tbody>
  </table>

  <h2>新增的服务接口</h2>
  ${pre(`<span class="c">// packages/shared/host-services.ts：只是暴露宿主已有的跨域 fetch</span>
export interface FetchService {
  fetch: typeof globalThis.fetch;
}
export const IFetchService = createServiceId&lt;FetchService&gt;("fetchService");

<span class="c">// packages/editor/src/extensions/bookmark/src/preview.ts：渲染进程解析，两端共用</span>
export async function readLinkPreview(fetch: typeof globalThis.fetch, url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, redirect: "follow" });
  <span class="c">// 只读前 512KB；按 Content-Type / meta charset 解码（GBK 页面很多）</span>
  const doc = new DOMParser().parseFromString(html, "text/html");
  <span class="c">// og:title → twitter:title → &lt;title&gt;；og:image 转绝对地址；icon → /favicon.ico</span>
}`)}
  <ul>
    <li>请求带普通浏览器的 User-Agent，不带 Cookie；识别出「安全验证」「登录」这类拦截页时当作失败。</li>
    <li>8 秒超时，失败落到「抓取失败」状态，不阻塞编辑。</li>
  </ul>

  <h2>发布到博客：本地封面需要单独处理</h2>
  <p>你担心的情况是存在的。我查了发布流程：<code>packages/blog</code> 的 <code>blogMediaRuntime</code> 原样使用节点里的地址，<code>publish-site-generator</code> / <code>publish-data-output</code> 里也没有收集本地资源的步骤。所以资源存储选「本地」时，节点里是 <code>~/.editor/resources/xxx.webp</code>，博客上加载不到这张图。按代码看，普通图片块用本地图片发布也是同样的结果（我没有实际发布验证）。</p>
  <p>书签可以绕开这个问题，因为封面本来就有一个公开的原地址：</p>
  <div class="flow"><span class="n">image 是 http(s)（上传插件）</span><i>→</i><span class="n hl">博客直接用</span></div>
  <div class="flow"><span class="n">image 是本地路径</span><i>→</i><span class="n hl">博客改用 sourceImage（网站原图地址）</span><i>→</i><span class="n">原图也加载失败</span><i>→</i><span class="n">隐藏封面，按无封面卡显示</span></div>
  <ul>
    <li>节点同时保存 <code>image</code>（存储后的地址）和 <code>sourceImage</code>（网站原始 og:image），网站图标同理。</li>
    <li>应用里优先用 <code>image</code>，离线能看，防盗链的图也不会裂。</li>
    <li>博客里本地路径不可用，退回原图地址，加 <code>referrerpolicy="no-referrer"</code> 减少防盗链拦截。</li>
    <li>用户自己上传的封面没有原地址：本地存储时博客不显示这张封面。要彻底解决，需要发布流程收集本地资源一起上传，这件事同样影响图片块，建议另外处理。</li>
  </ul>

  <h2>节点数据</h2>
  ${pre(`interface BookmarkElement {
  type: "bookmark";
  url: string;
  <span class="c">// 插入时的抓取快照；渲染只读这里，不联网</span>
  meta?: {
    title?: string; description?: string; siteName?: string;
    image?: string; sourceImage?: string;   <span class="c">// 存储后的地址 / 网站原地址</span>
    icon?: string; sourceIcon?: string;
    fetchedAt: number;
  };
  <span class="c">// 用户在编辑面板里改过的字段；image: null 表示「不显示封面」</span>
  overrides?: { title?: string; description?: string; image?: string | null };
  appearance?: "row" | "cover" | "compact";   <span class="c">// 缺省 row，三种随时切换</span>
  children: [{ text: "" }];                    <span class="c">// void 块</span>
}`)}
  <ul>
    <li><b>资源登记</b>：<code>resources</code> 声明 <code>meta.image</code>、<code>meta.icon</code>、<code>overrides.image</code> 为 <code>image</code>，导出、同步、协作上传就能像图片块一样处理。</li>
    <li><b>Markdown</b>：导出成独占一段的 <code>[标题](网址)</code>；导入时不反向识别成书签。</li>
    <li><b>协作</b>：抓取在插入方本机完成后才写入节点，协作者收到完整快照。</li>
  </ul>

  <h2>为什么做成内置扩展</h2>
  <ul>
    <li>空段落粘贴的「粘贴为」菜单要改链接扩展的粘贴逻辑；插件开放的编辑器字段里没有 <code>ingest</code>，接不到粘贴。</li>
    <li>链接浮层的「转为书签」也在链接扩展内部。</li>
    <li>做成内置以后，<code>IFetchService</code> 以后别的内置块（比如网页嵌入取标题）也能复用。</li>
  </ul>

  <h2>已确定</h2>
  <ul>
    <li>三种外观都做，节点上 <code>appearance</code> 切换，默认横向卡。</li>
    <li>桌面单击卡片直接打开（编辑态也是）；移动端编辑态单击只选中。</li>
    <li>「粘贴为」菜单只在空段落出现；行内粘贴网址仍直接成链接，不弹菜单。</li>
    <li>封面和图标走 <code>IResourceService.upload</code>，跟随资源存储设置。</li>
  </ul>
  </div>`;

  /* 页签 */
  const tabs = document.querySelectorAll(".tab");
  const scenes = document.querySelectorAll(".scene");
  const show = key => {
    tabs.forEach(t => t.classList.toggle("on", t.dataset.tab === key));
    scenes.forEach(s => s.classList.toggle("on", s.dataset.scene === key));
    location.hash = key;
  };
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));
  show(location.hash.slice(1) || "style");

  /* 主题 */
  const root = document.documentElement;
  const family = document.getElementById("theme-family");
  const mode = document.getElementById("theme-mode");
  const saved = JSON.parse(localStorage.getItem("mock-theme") || "{}");
  const apply = (theme, dark) => {
    root.dataset.theme = theme;
    root.dataset.mode = dark ? "dark" : "light";
    family.value = theme;
    mode.textContent = dark ? "深色" : "浅色";
    localStorage.setItem("mock-theme", JSON.stringify({ theme, dark }));
  };
  apply(saved.theme || "paper", Boolean(saved.dark));
  family.addEventListener("change", () => apply(family.value, root.dataset.mode === "dark"));
  mode.addEventListener("click", () => apply(root.dataset.theme, root.dataset.mode !== "dark"));
})();
