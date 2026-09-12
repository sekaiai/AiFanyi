# AiFanyi

AiFanyi 是一个基于 WXT、TypeScript 和 Vue 3 的浏览器划词翻译扩展。扩展面向 Chrome、Edge 和 Firefox MV3；设置页与线上演示使用 Vue，网页内气泡由内容脚本通过 Shadow DOM 渲染。

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

首次安装会打开设置页。词典查询无需配置；AI 翻译需要填写兼容 OpenAI 的接口地址、API 密钥、模型和提示词。

## 权限与隐私

扩展使用 `storage` 权限保存本地设置，并申请 `<all_urls>` 以便在普通 HTTP/HTTPS 页面注入内容脚本。浏览器内部页面、扩展商店页面和部分受限 PDF 页面可能无法注入。

所有 AI 网络请求由后台脚本发出，内容脚本只提交待翻译文本和请求编号，不能指定任意请求地址。API 密钥仅保存在 `browser.storage.local`，不会写入同步存储、日志或 GitHub Pages 在线演示的持久存储。在线演示页面使用内存设置适配器，页面刷新或关闭后会丢失 API 密钥。

AiFanyi 不持久保存用户翻译文本。同一标签页可保留有限内存缓存，用于避免短时间内重复请求。

## 测试与 CI

测试分层如下：

- `tests/components/`：Vue 设置页组件测试。
- `tests/background/`：background 消息、请求、取消和错误归一化测试。
- `e2e/`：Chromium 扩展端到端测试。

GitHub Actions 会执行 typecheck、Vitest、Chrome/Edge/Firefox MV3 构建、demo 构建、Chromium E2E，并在 `main` 分支更新后部署 `dist-demo/` 到 GitHub Pages。
