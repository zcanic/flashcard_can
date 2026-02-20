# Flashcard Workspace

一个面向长期高频使用（移动端优先）的间隔重复学习应用工作区。

## 项目定位

- 目标：提供接近原生 App 的记忆卡学习体验，支持离线优先、FSRS 调度与长期使用稳定性。
- 场景：iPhone 主力使用 + PWA 安装到主屏幕 + 每日复习。
- 当前主分支：`master`

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind
- 数据层：IndexedDB（Dexie）
- 调度算法：`ts-fsrs`
- PWA：`vite-plugin-pwa`
- 交互与体验：`cmdk`、`@radix-ui/react-dialog`、`goey-toast`
- 内容渲染与可视化：`react-markdown` + `remark-gfm`、`recharts`

## 当前能力（已落地）

- 学习流：卡片翻面、评分、FSRS 更新、复习日志写入
- 牌组流：创建、重命名、隐藏/显示、删除（含级联清理）
- 卡片流：创建、编辑、删除、Markdown 预览与渲染
- 数据流：JSON 备份导出/导入（合并/覆盖模式）
- 导入流：`.apkg/.apk.1g/.1g` 导入；解析已迁移为 Web Worker（避免主线程卡顿）
- 统计流：今日与近 7 天复习可视化
- 移动体验：安全区适配、PWA 安装引导、在线/离线状态提示
- 交互效率：命令面板（`Cmd/Ctrl + K`）快速导航与常用操作

## 目录结构

- `flashcard-app/`：主应用源码
- `docs/plans/`：设计与规划文档
- `card_src/`：示例卡组源文件（如 `.apk.1g`）

## 本地开发

在 `flashcard-app` 目录执行：

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run lint
npm run build
npm run preview
```

## 设计文档

- `docs/plans/2026-02-17-flashcard-design.md`

## 说明

- `flashcard-app/README.md` 仍是 Vite 模板说明，后续会按本项目功能同步更新。
