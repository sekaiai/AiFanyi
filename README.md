# AiFanyi

AiFanyi 是一个基于 WXT、TypeScript 和 Vue 3 的浏览器划词翻译扩展。扩展面向 Chrome、Edge 和 Firefox MV3；设置页与线上演示使用 Vue，网页内气泡由内容脚本通过 Shadow DOM 渲染。

**在线演示**：<https://sekaiai.github.io/AiFanyi/>

## 开发

项目使用 pnpm 和 Node.js 22+，建议使用 Node.js 24。

```bash
pnpm install
pnpm dev
```

Firefox 调试：

```bash
pnpm dev:firefox
```

常用校验：

```bash
pnpm typecheck
pnpm test
pnpm build:chrome
pnpm test:e2e
```

## 构建

一次构建所有目标：

```bash
pnpm build
```

单独构建：

```bash
pnpm build:chrome
pnpm build:edge
pnpm build:firefox
pnpm build:demo
```

WXT 构建产物位于 `.output/`，GitHub Pages 在线演示构建产物位于 `dist-demo/`。Chrome 打包可运行：

```bash
pnpm zip
```

## 本地加载

Chrome 或 Edge：

1. 先运行 `pnpm build:chrome` 或 `pnpm build:edge`。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”，加载 `.output/chrome-mv3` 或 `.output/edge-mv3`。

Firefox：

1. 运行 `pnpm build:firefox`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 选择“临时载入附加组件”，载入 `.output/firefox-mv3/manifest.json`。

首次安装会打开设置页。词典查询无需配置；翻译方案可按优先级添加 DeepL、Google 翻译（免密钥）、Google Cloud、百度翻译、火山引擎或兼容 OpenAI 的 AI 接口。

百度翻译方案需要在[百度翻译开放平台](https://api.fanyi.baidu.com/product/11)创建应用，并填写 `AppID` 和“密钥”。请求使用[通用文本翻译接口](https://api.fanyi.baidu.com/doc/23)，源语言固定为自动检测，目标语言跟随设置页选择；接口签名由扩展在请求前计算。官方建议单次请求不超过 2,000 字符（认证用户上限为 6,000 字符），扩展仍统一限制输入为 5,000 字符。

火山引擎方案需要在[火山引擎机器翻译](https://www.volcengine.com/docs/4640/65065?lang=zh)开通服务，并填写 `Access Key ID`、`Secret Access Key` 和地域（默认 `cn-north-1`）。扩展调用火山引擎文本翻译接口，源语言自动检测，目标语言跟随设置页选择；请求由后台脚本按火山引擎 V4 规范签名。

## 权限与隐私

扩展使用 `storage` 权限保存设置（全部配置通过 `chrome.storage.sync` 在登录同一浏览器的多台设备间自动同步），并申请 `<all_urls>` 以便在普通 HTTP/HTTPS 页面注入内容脚本。浏览器内部页面、扩展商店页面和部分受限 PDF 页面可能无法注入。

所有翻译网络请求由后台脚本发出，内容脚本只提交待翻译文本和请求编号，不能指定任意请求地址。全部设置（含各方案的 API 密钥）写入扩展专属的存储键，并通过 `browser.storage.sync` 借助浏览器账号在多台设备间自动同步，同时写入 `browser.storage.local` 作为本地镜像兜底；密钥不会写入日志或 GitHub Pages 在线演示的持久存储。后台会将存储限制为受信任扩展上下文，网页内容脚本只能收到不含密钥的设置快照；其他网页、应用或扩展无法通过 AiFanyi 的消息接口读取密钥。在线演示页面使用内存设置适配器，页面刷新或关闭后会丢失 API 密钥。

AiFanyi 不持久保存用户翻译文本。同一标签页可保留有限内存缓存，用于避免短时间内重复请求。

## 测试与 CI

测试分层如下：

- `tests/components/`：Vue 设置页组件测试。
- `tests/background/`：background 消息、请求、取消和错误归一化测试。
- `e2e/`：Chromium 扩展端到端测试。

GitHub Actions 会执行 typecheck、Vitest、Chrome/Edge/Firefox MV3 构建、demo 构建、Chromium E2E，并在 `main` 分支更新后部署 `dist-demo/` 到 GitHub Pages。
