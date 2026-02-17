# Flashcard Workspace

一个用于构建移动端优先记忆卡应用的工作区。

## 项目概览

- 目标：实现类似 Anki 的核心学习体验，支持间隔重复（FSRS）与离线优先使用。
- 形态：PWA（前端主应用）+ 本地数据存储（IndexedDB / Dexie）。
- 当前主分支：`master`

## 目录结构

- `flashcard-app/`：前端应用（React + TypeScript + Vite + Tailwind）
- `docs/plans/`：设计与规划文档
- `card_src/`：示例卡组源文件（如 `.apk.1g`）

## 快速开始

在 `flashcard-app` 目录执行：

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run lint
npm run preview
```

## 已实现的核心能力（当前代码）

- 牌组创建、重命名、删除
- 卡片创建、删除
- 基于 FSRS 的复习调度
- 统计面板（牌组数、卡片数、到期与今日复习）
- `.apkg` 导入基础流程（解析与入库）

## 设计文档

- 详细方案见：`docs/plans/2026-02-17-flashcard-design.md`

## 备注

- `flashcard-app/README.md` 仍为 Vite 模板默认说明，后续可按本项目实际功能补充。