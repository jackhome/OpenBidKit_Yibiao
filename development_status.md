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

| 模块 | 状态 |
|------|------|
| 技术方案（technical-plan） | ✅ 完整可用 |
| 知识库（knowledge-base） | ✅ 完整可用 |
| 设置（settings） | ✅ 完整可用 |
| 标书查重（duplicate-check） | ❌ 骨架（UI 显示"开发中"，prompt 抛错） |
| **废标项检查（rejection-check）** | **⏳ 即将开发** |
| 开发者测试（developer） | ✅ 简单页面可用 |

## 废标项检查开发计划

### 架构

不走后台任务模式。废标检查是一次性 AI 调用，复用现有 `window.yibiao.ai.requestJson()` 桥接。无需新增 Electron IPC。

用户输入方式：粘贴文本 + 从当前技术方案导入。

### 需要修改的文件

1. **`client/src/shared/prompts/rejectionPrompts.ts`** — 编写 AI 提示词，指导模型检查废标风险
2. **`client/src/features/rejection-check/pages/RejectionCheckPage.tsx`** — 完整重写为带交互的页面

### 不需要修改的文件

路由、导航、菜单、侧边栏、IPC、preload、main.cjs — 均由现有代码覆盖。

### UI 交互流程

```
用户输入标书正文（粘贴/导入） → 点击"开始检查"
  → AI 调用（requestJson） → 显示结构化风险报告
    → 风险项按严重程度分组展示（高/中/低）
    → 每项可展开查看来源和建议
```

### 详细实现参考

见 `.claude/plans/` 中的计划文件。
