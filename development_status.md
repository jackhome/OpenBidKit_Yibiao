# 开发状态与计划

## 已完成修复

### 1. DOMMatrix is not defined 错误修复

**问题：** 上传 Word/PDF 文档到知识库时，`convert.mjs` 在顶层 import `pdfjs-dist`，该库依赖 Web API `DOMMatrix`，而 Electron 主进程（Node.js 环境）中不存在此全局对象，导致崩溃。

**修复方式：**
- `client/electron/services/doc2markdown/convert.mjs` — 将 `pdf-parse` 和 `pdfjs-dist` 从顶层静态 import 改为按需动态 import（只在处理 PDF 文件时加载）
- `client/electron/main.cjs` — 添加 `DOMMatrix` 全局 polyfill（`SimpleDOMMatrix` 类），覆盖 pdfjs-dist 用到的 `translate`、`scale`、`multiply`、`rotate`、`inverse`、`transformPoint` 等方法

### 2. Word 导出 unified 包缺失

**问题：** 导出 Word 时提示 `Cannot find package 'unified'`，因 npm install 时依赖安装不完整。

**修复方式：** 重新安装了 `unified`、`remark-parse`、`remark-gfm` 三个包。

## 当前模块状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 技术方案（technical-plan） | ✅ 完整可用 | 上传招标文件 → AI 解析 → 生成大纲 → 生成正文 → 导出 Word |
| 知识库（knowledge-base） | ✅ 完整可用 | 上传文档 → 提取知识条目 → 段落匹配 |
| 设置（settings） | ✅ 完整可用 | 文本模型、生图模型、文件解析配置 |
| 废标项检查（rejection-check） | ✅ 已完成 | 上传标书/导入技术方案 → AI 分析废标风险 → 结构化报告 |
| 标书查重（duplicate-check） | ❌ 骨架 | UI 显示"开发中"，prompt 抛错 |
| 开发者测试（developer） | ✅ 简单页面可用 | |

## 架构决策

### 本地单机版，暂不做服务端改造

当前产品定位为**本地桌面客户端**（Electron），数据存储在用户本地磁盘，不支持多人协作、浏览器访问和知识库共享。

**维持此决策的理由：**
- 改成 Web 多人版需要重写后端、数据库、鉴权、文件存储、AI 转发等全套基础设施，相当于重做一个产品
- 当前单机模式对"一次做一个标书"的典型场景够用
- 知识库承担了本地资产长期沉淀的角色

**如果未来有服务端规划：**
- 建议当作独立项目来做，客户端保持单机版
- 两者数据格式尽量兼容，便于过渡

## 已知限制

- **技术方案仅支持单项目** — 所有状态存储在单个 `technical_plan.json` 文件，无多项目切换、无历史记录。上传新标书会清空之前的分析结果。
- **无测试覆盖** — 项目没有单元测试/集成测试框架。
- **无多用户支持** — 桌面客户端，数据存储在本地 `userData` 目录，无法多人协作。
