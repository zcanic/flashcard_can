# Flash Card 学习应用设计文档

**日期**: 2026-02-17  
**目标**: 复刻 Anki 核心功能，主打移动端 PWA，未来可扩展至桌面端

---

## 1. 核心架构与技术栈

### 1.1 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | React 18 + TypeScript + Vite | 现代 React 生态，快速开发 |
| PWA | Service Worker + Workbox | 离线缓存，添加到主屏幕 |
| 存储 | IndexedDB (Dexie.js) + OPFS | 结构化数据 + 媒体文件存储 |
| 状态管理 | Zustand | 轻量，适合离线优先架构 |
| 样式 | Tailwind CSS + shadcn/ui | 原子化 CSS + 现代化组件 |
| 复习算法 | FSRS | 基于 ts-fsrs 或自研实现 |
| 动画 | Framer Motion | 流畅的卡片切换动画 |

### 1.2 离线优先架构

```
┌─────────────────────────────────────────┐
│              User Layer                 │
│  (React Components + Zustand Stores)    │
├─────────────────────────────────────────┤
│           Business Logic                │
│  (FSRS Algorithm + Card Management)     │
├─────────────────────────────────────────┤
│           Data Access Layer             │
│         (Dexie.js + OPFS)               │
├─────────────────────────────────────────┤
│      Sync Layer (Optional Network)      │
│     (Cloudflare KV / Supabase)          │
└─────────────────────────────────────────┘
```

**原则**: 
- 所有操作先在本地完成，IndexedDB 是唯一数据源
- 应用启动时直接读取本地数据库，0 等待
- 网络层只负责"同步"——推送本地数据到 KV 服务端或从服务端拉取

---

## 2. 数据模型

### 2.1 实体定义

#### Deck（牌组）
```typescript
interface Deck {
  id: string;                    // UUID
  name: string;                  // 牌组名称
  hash: string;                  // 同步标识哈希
  description?: string;          // 描述
  config: FSRSSettings;          // FSRS 参数配置
  createdAt: DateTime;
  updatedAt: DateTime;
  lastSyncAt?: DateTime;         // 上次同步时间
}

interface FSRSSettings {
  requestRetention: number;      // 目标记忆保留率 (默认 0.9)
  maximumInterval: number;       // 最大间隔天数 (默认 36500)
  w: number[];                   // FSRS 权重参数 [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]
}
```

#### Card（卡片）
```typescript
interface Card {
  id: string;                    // UUID
  deckId: string;                // 所属牌组
  front: string;                 // 正面 Markdown
  back: string;                  // 背面 Markdown
  tags: string[];                // 标签
  mediaIds: string[];            // 关联媒体文件
  noteId?: string;               // Anki 兼容：笔记 ID
  cardType?: 'new' | 'learning' | 'review' | 'relearning';
  createdAt: DateTime;
}
```

#### ReviewState（复习状态 - FSRS 核心）
```typescript
interface ReviewState {
  cardId: string;
  
  // FSRS 状态
  state: 'new' | 'learning' | 'review' | 'relearning';
  due: DateTime;                 // 下次复习时间
  stability: number;             // 记忆稳定性
  difficulty: number;            // 卡片难度 (1-10)
  elapsedDays: number;           // 自上次复习经过的天数
  scheduledDays: number;         // 计划间隔天数
  reps: number;                  // 总复习次数
  lapses: number;                // 遗忘次数（再次进入学习状态）
  lastReview?: DateTime;         // 上次复习时间
}
```

#### ReviewLog（复习记录 - 用于统计）
```typescript
interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: 1 | 2 | 3 | 4;         // Again=1, Hard=2, Good=3, Easy=4
  state: 'new' | 'learning' | 'review' | 'relearning';
  due: DateTime;                 // 复习前到期时间
  review: DateTime;              // 实际复习时间
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
}
```

#### Media（媒体文件）
```typescript
interface Media {
  id: string;                    // UUID
  type: 'image' | 'audio';
  originalFilename: string;
  mimeType: string;
  size: number;
  // 实际文件存储在 OPFS，此处只存元数据
  opfsPath: string;
}
```

### 2.2 Anki 兼容性

**导入 .apkg:**
1. 解压 .apkg 文件（SQLite + media 目录）
2. 解析 `collection.anki2` 数据库
3. 映射 notes → Card 实体
4. 映射 cards → ReviewState 实体
5. 复制媒体文件到 OPFS
6. 保持 noteId 用于未来导出

**导出 .apkg:**
1. 反向生成 Anki 格式的 SQLite 数据库
2. 打包媒体文件
3. 生成 .apkg 文件供下载

---

## 3. 学习流程（打开即学习）

### 3.1 启动行为

```
打开 App
    ↓
检查今日到期卡片
    ↓
┌──────────────────────┐
│ 有到期卡片?           │
├──────────┬───────────┤
│    是     │    否     │
↓           ↓
进入学习界面    显示"已完成"庆祝页
                可手动浏览所有卡片
```

### 3.2 学习界面

**布局结构:**
```
┌─────────────────────┐  ← safe-area-inset-top
│  [←] Deck名称  [⋮]  │  ← 顶部导航
├─────────────────────┤
│  ████████░░░░ 12/45 │  ← 进度条（新/学习中/复习）
├─────────────────────┤
│                     │
│                     │
│                     │
│    卡片正面内容      │  ← 中央区域 (70%)
│   (Markdown 渲染)    │     支持图片/代码块
│                     │
│                     │
│                     │
├─────────────────────┤
│    [  显示答案  ]    │  ← 底部主按钮
└─────────────────────┘  ← safe-area-inset-bottom
```

**显示答案后:**
```
┌─────────────────────┐
│      卡片背面        │  ← 滑动或淡入显示
├─────────────────────┤
│ [Again]  [Hard]     │  ← 评级按钮行
│   1m       10m      │     显示预计下次时间
│                     │
│ [ Good ]  [Easy]    │
│   1d       4d       │
└─────────────────────┘
```

### 3.3 交互细节

**卡片切换动画:**
- 评级按钮点击后，当前卡片向评级方向滑出（Again向左，Easy向右）
- 下一张卡片从底部滑入
- 使用 Framer Motion 的 `AnimatePresence`
- 动画时长: 300ms, easing: [0.4, 0, 0.2, 1]

**键盘/手势支持:**
- 空格键: 显示答案 / 默认 Good
- 1/2/3/4: Again/Hard/Good/Easy
- 左滑: Again, 右滑: Easy（移动端手势）

---

## 4. 同步机制（去用户化 KV 存储）

### 4.1 核心设计

**同步哈希生成:**
```typescript
function generateSyncHash(deckId: string, createdAt: string, secret?: string): string {
  const input = `${deckId}:${createdAt}:${secret || ''}`;
  return sha256(input).slice(0, 16); // 16位短哈希，便于分享
}
```

**数据包结构:**
```typescript
interface SyncPackage {
  version: 1;
  deck: Deck;
  cards: Card[];
  reviewStates: ReviewState[];
  reviewLogs: ReviewLog[];      // 可选：仅保留最近 N 条
  mediaManifest: MediaManifest; // 媒体文件索引
  timestamp: DateTime;
  deviceId: string;
}

interface MediaManifest {
  [mediaId: string]: {
    hash: string;               // 文件内容哈希
    size: number;
    uploaded: boolean;          // 是否已上传
  };
}
```

### 4.2 同步流程

**首次创建（设备 A）:**
```
创建 Deck → 生成 syncHash → 完整数据包 → 压缩 → 上传 KV
                                              ↓
                                       存储: key=syncHash, value=gzip(data)
```

**新设备加入（设备 B）:**
```
输入 syncHash → 从 KV 拉取 → 解压 → 写入 IndexedDB → 开始学习
                                    ↓
                              媒体文件按需下载/缓存
```

**增量同步:**
```
本地产生变更（复习完成）
    ↓
生成增量包（仅变更的 ReviewState + ReviewLog）
    ↓
上传到 KV（如果设备在线）
    ↓
其他设备下次同步时拉取增量
```

### 4.3 冲突解决

**策略**: 时间戳优先（Last Write Wins）

```typescript
function mergeReviewStates(local: ReviewState, remote: ReviewState): ReviewState {
  // 比较 lastReview 时间戳
  return local.lastReview > remote.lastReview ? local : remote;
}
```

**限制**: 
- 禁止多设备同时编辑卡片内容
- 只允许一个"主设备"进行卡片增删改
- 其他设备为"从设备"，仅进行复习操作

### 4.4 KV 服务选择

**推荐: Cloudflare Workers + KV**
- 免费额度：10万次读取/天，1000次写入/天
- 全球边缘节点，访问速度快
- 无需维护服务器

**备选: Supabase**
- 更完整的数据库功能
- 如果未来需要复杂查询

---

## 5. 卡片管理

### 5.1 牌组列表页

**布局:**
```
┌─────────────────────┐
│ 我的牌组      [+导入]│
├─────────────────────┤
│ ┌───────────────┐   │
│ │ 🎴 TOEIC 词汇  │   │
│ │ ████████░░ 156 │   │  ← 进度条：
│ │ 今日: 12       │   │     绿色=新卡片
│ │ 设置 │ 学习 →   │   │     黄色=学习中
│ └───────────────┘   │     蓝色=待复习
│                     │
│ ┌───────────────┐   │
│ │ 🎴 N1 文法     │   │
│ │ ██████░░░░ 89 │   │
│ │ 今日: 0 ✓      │   │
│ │ 设置 │ 学习 →   │   │
│ └───────────────┘   │
│                     │
│ [+ 新建牌组]        │
└─────────────────────┘
```

### 5.2 牌组详情（设置弹窗）

**选项:**
- 重命名牌组
- 调整 FSRS 参数（高级，可折叠）
- 导出为 .apkg
- 同步设置：
  - 查看 syncHash（可复制分享）
  - 手动触发同步
  - 显示上次同步时间
- 删除牌组（二次确认）

### 5.3 导入流程

```
点击"+导入"
    ↓
选择文件 (.apkg / .csv)
    ↓
解析预览（显示牌组名、卡片数量、媒体文件数）
    ↓
选择目标：【新建牌组】或 【合并到现有牌组】
    ↓
导入执行 + 进度条
    ↓
完成提示
```

**CSV 格式支持:**
```csv
front,back,tags
"Hello","你好","greeting"
"Apple","苹果","noun,food"
```

### 5.4 创建卡片

**简洁编辑器:**
```
┌─────────────────────┐
│ 新建卡片            │
├─────────────────────┤
│ 正面                │
│ ┌─────────────────┐ │
│ │                 │ │  ← Markdown 编辑器
│ │                 │ │     支持工具栏快捷按钮
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ 背面                │
│ ┌─────────────────┐ │
│ │                 │ │
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ 标签: [________]    │
│                     │
│ [+ 添加图片]        │
│                     │
│ [保存并添加下一张]  │
└─────────────────────┘
```

**编辑器功能:**
- Markdown 实时预览（上下分栏或切换）
- 工具栏：加粗、斜体、代码块、列表、链接、图片
- 拖拽/粘贴图片自动上传
- 批量模式：保存后不清空正面，只清空背面（快速添加同类型卡片）

---

## 6. 统计面板（详细版）

### 6.1 首页 Dashboard

下滑显示，默认收起：

```
┌─────────────────────────────────────┐
│  📊 今日学习                         │
│  ├── 已复习: 45 张                   │
│  ├── 新学: 10 张                     │
│  ├── 正确率: 82%                     │
│  └── 学习时长: 12 分钟               │
│                                     │
│  📈 记忆状态分布                      │
│  [████████░░] 新卡片 156             │
│  [████░░░░░░] 学习中 45              │
│  [██████░░░░] 待复习 89              │
│  [██░░░░░░░░] 已掌握 234             │
│                                     │
│  📅 未来 7 天                        │
│  预计每日复习: 45, 38, 52, 41...     │
└─────────────────────────────────────┘
```

### 6.2 详细统计页

**记忆曲线可视化:**
```
记忆强度曲线（艾宾浩斯遗忘曲线）

100% ┤         ╭─╮
 80% ┤        ╱   ╲    ╭─╮
 60% ┤       ╱      ╲  ╱   ╲
 40% ┤──────╱        ╲╱      ╲────
 20% ┤
  0% ┼────┬────┬────┬────┬────┬────┬
     1天   3天   7天   14天  30天  90天

图例:
- 每个波峰 = 一次复习
- 波峰高度 = 记忆强度（由 FSRS 计算）
- 曲线下降 = 遗忘过程
- 点击波峰可查看该次复习详情
```

**遗忘率热力图:**
```
遗忘率热力图（近90天）

    周一 周二 周三 周四 周五 周六 周日
1周 □    □    □    □    □    □    □
2周 ▨    ▩    ▪    ▫    ▨    ▩    ▪
3周 ▪    ▫    ▨    ▩    ▪    ▫    ▨
...

图例: ▪ 0-5%  ▫ 5-15%  ▨ 15-25%  ▩ 25%+
```

**最佳学习时段分析:**
```
最佳学习时段

06:00  ████ 12%
08:00  ████████ 28% ★
10:00  ██████████████ 45% ★★  ← 最佳
12:00  ██████ 18%
14:00  ██████████ 32% ★
20:00  ████████ 26%

基于你的历史数据，上午 10 点记忆效率最高
建议将难记的卡片安排在这个时段学习
```

**预测性统计:**
```
📊 学习预测

基于当前学习速度:
• 预计 23 天后完成当前牌组
• 未来 7 天需复习: 311 张卡片
• 日均学习负担: 44 张
• 记忆保留率趋势: ↑ 上升

💡 建议:
每天学习 20 张新卡片可维持最佳效率
超过此数量可能增加遗忘率
```

### 6.3 数据可视化库

推荐使用 **Recharts** 或 **Visx**：
- 响应式设计，适配移动端
- 支持触摸交互
- 可导出为图片分享

---

## 7. 视觉设计系统

### 7.1 设计理念

**「静谧专注」**

学习需要平静的心智空间。我们用莫兰迪的灰调色彩营造专注氛围，去除视觉噪音，让注意力完全集中在知识本身。

### 7.2 色彩系统

```css
:root {
  /* 主背景 - 暖白灰，不刺眼 */
  --bg-primary: #F7F5F3;       /* 米白 - 页面背景 */
  --bg-secondary: #EFEBE6;     /* 浅灰褐 - 次级背景 */
  --bg-card: #FFFFFF;          /* 纯白 - 卡片背景 */
  --bg-hover: #F0EEEA;         /* 悬停背景 */
  
  /* 莫兰迪主色 - 低饱和度 */
  --accent-sage: #9CAF88;      /* 鼠尾草绿 - 成功/掌握/Easy */
  --accent-clay: #C4A77D;      /* 陶土褐 - 警告/复习/Good */
  --accent-slate: #7D8C9B;     /* 石板灰 - 信息/新卡片 */
  --accent-dusty: #B8A9A1;     /* 灰粉 - 中性/次要/Hard */
  --accent-terracotta: #C9A89A; /* 赤陶色 - Again/错误 */
  
  /* 文字 - 高对比度确保可读性 */
  --text-primary: #2C2C2C;     /* 近黑 - 主文字 */
  --text-secondary: #6B6B6B;   /* 中灰 - 次级文字 */
  --text-muted: #9B9B9B;       /* 浅灰 - 禁用/提示 */
  --text-inverse: #FFFFFF;     /* 白 - 深色背景上的文字 */
  
  /* 边框与分隔线 */
  --border-light: #E8E4DF;
  --border-medium: #D4CFC7;
}
```

### 7.3 字体系统

```css
:root {
  /* 标题 - 人文主义衬线体 */
  --font-display: 'Source Serif 4', Georgia, serif;
  
  /* 正文 - 高可读性无衬线 */
  --font-body: 'Sora', -apple-system, BlinkMacSystemFont, sans-serif;
  
  /* 字号 */
  --text-xs: 0.75rem;    /* 12px - 标签、辅助文字 */
  --text-sm: 0.875rem;   /* 14px - 次级内容 */
  --text-base: 1rem;     /* 16px - 正文 */
  --text-lg: 1.125rem;   /* 18px - 卡片内容 */
  --text-xl: 1.25rem;    /* 20px - 小标题 */
  --text-2xl: 1.5rem;    /* 24px - 大标题 */
  --text-3xl: 2rem;      /* 32px - 页面标题 */
}
```

### 7.4 圆角与阴影

```css
:root {
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-full: 9999px;
  
  --shadow-soft: 0 2px 12px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.08);
  --shadow-floating: 0 16px 48px rgba(0, 0, 0, 0.12);
}
```

### 7.5 间距系统

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  
  /* 安全区域适配 */
  --safe-top: env(safe-area-inset-top);
  --safe-bottom: env(safe-area-inset-bottom);
  --safe-left: env(safe-area-inset-left);
  --safe-right: env(safe-area-inset-right);
}
```

### 7.6 组件规范

**按钮:**
```css
/* 主按钮 */
.btn-primary {
  background: var(--text-primary);
  color: var(--text-inverse);
  padding: 16px 24px;
  border-radius: var(--radius-md);
  font-weight: 500;
}

/* 次级按钮 */
.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

/* 评级按钮 */
.btn-rating-again { background: var(--accent-terracotta); }
.btn-rating-hard { background: var(--accent-dusty); }
.btn-rating-good { background: var(--accent-clay); }
.btn-rating-easy { background: var(--accent-sage); }
```

**卡片:**
```css
.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  padding: var(--space-6);
}

.card-elevated {
  box-shadow: var(--shadow-elevated);
}
```

**输入框:**
```css
.input {
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: var(--text-base);
}

.input:focus {
  border-color: var(--accent-slate);
  background: var(--bg-card);
}
```

---

## 8. 项目结构

```
flashcard/
├── src/
│   ├── components/          # 组件
│   │   ├── ui/             # 基础 UI 组件
│   │   ├── deck/           # 牌组相关组件
│   │   ├── card/           # 卡片相关组件
│   │   ├── study/          # 学习界面组件
│   │   └── stats/          # 统计组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand Stores
│   ├── lib/                # 工具函数
│   │   ├── fsrs.ts         # FSRS 算法实现
│   │   ├── anki.ts         # Anki 导入导出
│   │   ├── sync.ts         # 同步逻辑
│   │   └── db.ts           # IndexedDB 封装
│   ├── types/              # TypeScript 类型
│   ├── styles/             # 全局样式
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── manifest.json       # PWA 配置
│   └── icons/              # 图标
├── docs/
│   └── plans/              # 设计文档
├── tests/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 9. 实现优先级

### Phase 1: MVP（核心学习闭环）
- [ ] 项目初始化 + PWA 配置
- [ ] IndexedDB 基础封装
- [ ] FSRS 算法实现
- [ ] 牌组 CRUD
- [ ] 卡片 CRUD
- [ ] 学习界面（打开即学习）
- [ ] 基础统计（今日学习数据）

### Phase 2: 增强功能
- [ ] .apkg 导入导出
- [ ] Markdown 编辑器
- [ ] 媒体文件支持（图片/音频）
- [ ] 详细统计面板
- [ ] 标签系统

### Phase 3: 同步与扩展
- [ ] KV 同步机制
- [ ] 分享功能（syncHash）
- [ ] CSV 导入
- [ ] 批量操作

---

## 10. 技术约束与注意事项

### 10.1 移动端优化
- 使用 `viewport-fit=cover` 适配 iPhone 刘海屏
- 所有按钮最小 44x44px（Apple HIG 标准）
- 禁用双击缩放
- 输入框聚焦时防止页面缩放（font-size >= 16px）
- 使用 `-webkit-tap-highlight-color: transparent`

### 10.2 性能考虑
- 图片懒加载 + WebP 格式
- 大列表虚拟滚动（如果牌组卡片很多）
- Service Worker 缓存策略：Stale-While-Revalidate
- IndexedDB 索引优化查询

### 10.3 数据安全
- 定期自动导出备份（可选）
- 敏感操作二次确认（删除牌组等）
- 同步数据加密（可选，端对端）

---

**文档版本**: v1.0  
**最后更新**: 2026-02-17
