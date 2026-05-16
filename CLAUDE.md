# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**易标投标工具箱** — 开源 AI 标书编写桌面客户端（Electron + React + TypeScript）。核心流程：上传招标文件 → AI 解析标书 → 生成目录大纲 → AI 逐章撰写正文 → 导出 Word 标书。

## Commands

```bash
# 开发（client 目录下）
cd client && npm run dev             # Vite + Electron 并行启动
cd client && npm run build           # tsc --noEmit + vite build
cd client && npm run dist            # 构建 + electron-builder 打包
cd client && npm run dist:win        # Windows 打包
cd client && npm run dist:mac        # macOS 打包

# 分析服务（analytics 目录下）
cd analytics/dashboard && npm run dev    # wrangler dev
cd analytics/worker && npm run dev       # wrangler dev
cd analytics/dashboard && npm run deploy # 部署 dashboard
cd analytics/worker && npm run deploy    # 部署 worker

# 工具
cd tools/doc2markdown-node && npm run convert -- -f <file>  # 文档转 Markdown
cd tools/mineru-accurate-demo && npm run parse              # MinerU 精确解析
cd tools/mineru-agent-demo && npm run parse                 # MinerU Agent 解析

# Doc2Markdown Python 服务
cd tools/Doc2MarkdownService && pip install -r requirements.txt && uvicorn app.main:app
```

## Architecture

### 桌面客户端三层架构

```
client/
├── electron/              # 主进程 (CommonJS)
│   ├── main.cjs           # 窗口创建、协议注册、IPC 挂载
│   ├── preload.cjs        # contextBridge → window.yibiao API
│   ├── ipc/               # IPC handler 注册（每个领域一个文件）
│   └── services/          # 业务逻辑（AI、任务、配置、导出等）
├── src/                   # 渲染进程 (React + TypeScript)
│   ├── App.tsx            # 根组件：根据 activeSection 路由
│   ├── app/               # 路由配置、菜单/工具栏、Provider
│   ├── components/        # AppShell 布局 + Sidebar
│   ├── features/          # 业务模块（功能独立）
│   │   ├── technical-plan/  # 核心工作流（文档解析→投标分析→大纲→正文→导出）
│   │   ├── knowledge-base/  # 知识库管理
│   │   ├── duplicate-check/ # 标书查重
│   │   ├── rejection-check/ # 废标项检查
│   │   ├── settings/        # 配置页（AI 模型、开发者模式等）
│   │   └── developer/       # 开发者测试页面
│   └── shared/            # 跨模块共享（类型、AI 客户端、Prompt、UI 组件、工具函数）
└── package.json
```

### IPC 通信模式

- **渲染进程 → 主进程**: `window.yibiao.<domain>.<method>()` 通过 `ipcRenderer.invoke` → `ipcMain.handle`
- **主进程 → 渲染进程**: `webContents.send` → `ipcRenderer.on`，用于流式事件（AI 流式响应、任务进度、导出进度、更新进度）
- `preload.cjs` 中通过 `contextBridge.exposeInMainWorld('yibiao', bridge)` 暴露完整类型化 API，类型定义在 `src/shared/types/ipc.ts`（`YibiaoBridge` 接口）

### 核心工作流（Technical Plan）

1. **Document Analysis**: 导入 Word/PDF → 转为 Markdown（本地 doc2markdown 或 MinerU 服务）
2. **Bid Analysis**: AI 提取项目概述、技术评分要求、关键信息等（key 模式=仅必选项，full 模式=全部）
3. **Outline Generation**: AI 根据投标分析结果生成章节大纲
4. **Content Generation**: 后台任务逐章生成正文，支持 Mermaid 图表 + AI 配图（火山方舟/Google AI Studio）
5. **Word Export**: 将正文内容导出为 .docx 文件（使用 docx 库）

### 后台任务系统

长时间运行的 AI 任务（投标分析、大纲生成、正文生成）通过主进程的 `taskService.cjs` 管理。任务状态持久化到 `workspaceStore`，通过 `tasks:event` IPC 事件实时推送进度给渲染进程。每个类型同时只能有一个运行中的任务。

### AI 服务

- `aiService.cjs` 使用 OpenAI-compatible HTTP API（兼容任意 provider）
- 支持流式和非流式调用，自动降级（当 provider 不支持 `response_format` 时重试不带该参数）
- JSON 响应带校验+自动修复+重试机制（最多 2 次重试 + 1 次修复）
- 开发者模式下请求/响应/日志落盘到 `userData/ai-logs/`
- 生图支持火山方舟和 Google AI Studio，图片保存到 `userData/generated-images/`，通过 `yibiao-asset://generated-images/` 协议加载
- Prompt 模板集中在 `src/shared/prompts/` 中

### 配置存储

`configStore.cjs` 管理 `userData/config.json`；`workspaceStore.cjs` 管理 `userData/workspace/technical-plan.json`。配置在设置页编辑，工作区状态在每个操作步骤后自动持久化。

### 文档解析工具

- **本地**: `client/electron/services/doc2markdown/convert.mjs` — 内置基于 mammoth/cheerio/turndown 的转换
- **远程**: `tools/Doc2MarkdownService/` — Python FastAPI 服务（备用方案）
- **MinerU**: `tools/mineru-*-demo/` — 独立 CLI 工具

### 项目结构补充

```
analytics/         # Cloudflare Workers + Pages 埋点
  ├── worker/      # 事件收集 API
  └── dashboard/   # 数据看板 UI
tools/             # 独立工具（文档解析、MinerU 验证等）
文章/              # 技术博客系列文章（讲解 AI 标书实现细节）
archive/           # 废弃的旧版 Python backend + React frontend
```

## Release

- GitHub Actions: `.github/workflows/release.yml`
- 触发方式：推送 `v*` tag 或 workflow_dispatch
- 构建：Windows（NSIS + MSI + ZIP）+ macOS（DMG）
- Node.js 22, electron-builder 打包

## Analytics

独立于客户端的埋点系统，基于 Cloudflare Workers + Pages，通过 `deploy-if-changed.mjs` 脚本部署。
