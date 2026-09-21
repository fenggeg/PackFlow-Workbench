# DESIGN.md — PackFlow Workbench

## 1. Objective

用户打开应用后应感到「这是一台精密的工程仪器」，而不是「一堆彩色卡片拼起来的后台」。任何一次交互——选项目、勾模块、跑构建、看日志——都应在安静、高密度、零装饰的界面里完成。质量条：信息层级靠字重、间距与 1px 分割线表达，彩色只出现在语义状态与唯一主操作上。

## 2. Product Context

- **What the product does:** Windows 桌面端 Maven 多模块构建工作台：选项目、拼命令、跑构建、管构件、SSH 部署。
- **Who it's for:** 后端 / DevOps 工程师，每天长时间盯着构建状态与日志，厌恶无意义动效与营销感文案。
- **Adjacent brands (feel like these):** Vercel Dashboard（近单色、发丝线、黑主按钮）、Stripe Dashboard（克制的语义色、表格即主角）、Linear（高密度、字重分层、几乎无阴影）。
- **Distant brand (do not feel like this):** 老版 Ant Design Pro 后台——彩色 Tag 满屏、卡片圆角大而软、信息靠颜色堆砌而非排版。
- **Cultural register:** technical / serious。界面说工程师的语言：mono 字体承载路径、命令、版本号；中文文案短句、动词开头、无感叹号。

## 3. Visual Foundations

### 3a. Color

- **Neutral scale（Vercel 灰阶，冷中性）:**
  - `--n-0: #ffffff`（surface）
  - `--n-25: #fafafa`（app bg）
  - `--n-50: #f5f5f5`（surface-muted / hover bg）
  - `--n-100: #eaeaea`（border，主力发丝线）
  - `--n-200: #e0e0e0`（border-strong）
  - `--n-400: #a1a1a1`（text-muted）
  - `--n-600: #666666`（text-secondary）
  - `--n-900: #171717`（text / primary button bg）
- **Accent:** 不再使用绿色作为品牌主色大面积出现。`--accent-primary: #171717`（近黑，主 CTA 填充底）。绿色降级为成功语义。
- **Semantic:** `--success: #16a34a` · `--warning: #d97706` · `--error: #dc2626` · `--info: #2563eb`（仅用于状态点、状态 pill 文字/边框、进度条，禁止做大面积底色）。
- **Usage rules:** 一屏彩色出现次数 ≤ 5（状态点 + 主按钮外的语义提示）。Tag 禁止 `color="blue|green|orange|red"` 彩底，一律「灰边 pill + 6px 状态圆点」。Console 维持 `#0a0a0a` 底 / `#d4d4d4` 字。

### 3b. Typography

- **Display face:** Inter，weights 500/600；页面标题 20px/600、letter-spacing -0.01em。
- **Body face:** Inter 400/500，正文 13px，控件文字 13px。
- **Mono face:** Geist Mono（或 JetBrains Mono 作 fallback），用于：Maven 命令、路径、分支名、版本号、构件坐标、日志。
- **Fallback stack:** `Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif` / mono: `"Geist Mono", "JetBrains Mono", "Cascadia Code", Consolas, monospace`。
- **Type scale:** 11 / 12 / 13 / 14 / 16 / 20 / 24（px）。
- **Weight discipline:** 正文只用 400；标签与次要按钮 500；数字与关键字段 600；禁止 700+。全站最大字号不超过 24px（桌面工具不需要 hero）。

### 3c. Spacing & rhythm

- **Base unit:** 4px。
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48。
- **"Generous" in numbers:** 工作区页面 padding 24px；卡片内 padding 16px；卡片间距 12px；表行高 40px（紧凑）/ 32px（表格密集模式）。壳层不需要大留白——密度即价值。

### 3d. Component seeds

- **Button:** 3 变体——Primary（`#171717` 底白字，hover `#333`）、Secondary（白底 1px `#eaeaea` 边）、Ghost/Text。圆角 6px，高 32px。全站彩色填充按钮只允许出现一次（构建主操作）。
- **Card / container:** 弱化卡片——白底 + 1px `#eaeaea` 边 + 圆角 8px，**无阴影**。侧栏面板可进一步去边框，仅靠背景色差（`#fff` vs `#fafafa`）与分割线区分。
- **Iconography:** 使用 lucide-react，统一 16px、stroke 观感；禁止彩色图标。
- **StatusPill（核心新组件）:** 高 22px、圆角 999px、透明底、1px border `#eaeaea`、12px 文字 + 左侧 6px 语义色圆点。取代所有彩底 Tag。
- **Input / Select:** 高 32px、圆角 6px、边框 `#e0e0e0`，focus 边框 `#171717` + 0 0 0 2px `rgba(23,23,23,0.08)` ring。
- **Table:** 无斑马纹；表头 12px/500/`#666`；行分割线 1px `#eaeaea`；行 hover `#fafafa`；数字与时间右对齐。

## 4. Accessibility

- **Text contrast:** 正文 ≥ 4.5:1（`#171717` on `#fff` ≈ 16:1；`#666` on `#fff` ≈ 5.7:1）；`#a1a1a1` 仅用于禁用态与装饰性说明。
- **Motion:** 默认动效 ≤ 150ms、ease-out；尊重 `prefers-reduced-motion`；无弹跳、无 parallax、无装饰性 loading 花纹。
- **Focus indicators:** 全局 `:focus-visible` → 2px `#171717` outline + 2px offset，禁止去掉 outline。
- **Status not by color alone:** 所有状态点旁必须有文字（成功/失败/运行中），色盲可读。
- **Alt / aria:** 图标按钮一律 `aria-label`；构建中 ActivityBar 徽标加 `aria-live="polite"`。

## 5. Voice & Tone

- **Register:** technical，短句。
- **Sentence rhythm:** 标签 2–4 字；提示句 ≤ 20 字；错误信息含「原因 + 下一步动作」。
- **Words this brand uses:** 构建、部署、构件、模块、命令、重试。
- **Words this brand refuses:** 赋能、无缝、轻松搞定、智能管家、精彩、Oops。
- **Address:** 「你」→ 直接祈使：「选择项目」「重试构建」，不写「请您选择」。

## 6. Implementation Practices

- **Token format:** 单一事实源 `src/index.css` 的 CSS 变量（`:root` 中 `--background`、`--foreground`、`--primary`、`--muted`、`--border` 等），组件通过 `var(--*)` 或 Tailwind `@theme inline` token 引用，禁止组件内写死颜色。
- **Component library convention:** 已迁移至 shadcn/ui（Radix Primitives + Tailwind CSS v4 + CVA）。`src/components/ui/` 存放 shadcn 生成的基础组件；业务组件只引用 `ui/` 原语。禁止业务代码直接 import `antd`。
- **Image treatment rules:** 无图片、无插画、无 emoji 装饰——界面本身是视觉。
- **Grid system:** 壳层维持 `56px | 312px | 1fr | (inspector)` 三栏 + 顶栏 48px + 底栏 56px（整体压扁）；工作区内容 `max-width: 1200px` 左对齐而非居中（工具类界面左对齐更符合扫描习惯）。
- **Motion rules:** 仅允许 transition 类动效（颜色、边框、背景、opacity）；时长 120–150ms；`cubic-bezier(0.2, 0, 0, 1)`。

## 7. Anti-Patterns

- **No 彩底 Tag 装饰信息层级。** 这个产品的信息密度靠排版，彩色底会把「状态」和「分类」搅成噪声——Vercel/Stripe 全部用中性 pill + 语义点。
- **No 大圆角软阴影卡片网格。** 16px 圆角 + 柔阴影是营销页语言；工程工具用发丝线与底色差建立容器感。
- **No 全站绿色品牌化。** 绿色 #16a34a 曾是 primary，导致「绿色=品牌」稀释了「绿色=成功」；主操作改近黑，绿色只归状态。
- **No 每个动作都做成填充主按钮。** 一屏最多一个 Primary；其余 Secondary/Ghost。
- **No 组件默认主题裸奔。** 任何未映射到 CSS 变量的组件默认样式视为缺陷。
- **No 装饰性渐变、发光、毛玻璃。** 唯一允许的「质感」是 1px 线与灰阶。

## 8. Decision-Making

1. **语义正确性 > 视觉丰富度。** 若彩色让状态更可读，保留彩色；若只是「好看」，改灰。
2. **密度 > 留白。** 桌面生产力工具优先一屏塞下决策所需信息；留白只用于分组，不用于气氛。
3. **一致性 > 局部亮点。** 任何页面不得引入规范外的圆角/色值/字号，即使它「这一页更好看」。
4. **可访问性 > 极简美学。** 对比度、focus、状态文字兜底不可为极简牺牲。
5. **shadcn/ui 作为唯一组件源。** 已全面弃用 antd；所有 UI 通过 shadcn/ui 提供，token 映射到 CSS variables。换来像素级设计控制与无运行时依赖。

## 9. Workflow

1. 初始化 Tailwind CSS v4 + shadcn/ui：添加依赖、生成 `components.json`、配置路径别名 `@/*`。
2. 迁移 token：将设计规范映射到 shadcn 的 CSS variables（`--background`, `--foreground`, `--primary`, `--muted`, `--border` 等），并同步 `index.css`。
3. 生成 shadcn 基础组件至 `src/components/ui/`：Button, Card, Badge, Tabs, Table, Dialog, Drawer, Select, Input, ScrollArea, Tooltip, Separator, Tree（自定义或基于 Radix）。
4. 改造壳层四件套：顶栏去彩 Tag、ActivityBar 激活态改中性、底栏主按钮改近黑、Inspector 边框对齐——全部使用 shadcn 组件。
5. 逐页迁移（Build → History → Artifact → Dashboard）：将 antd 调用替换为对应 shadcn 组件；移除彩 Tag → StatusPill（基于 Badge）。
6. 表格与日志组件统一 mono/对齐/行高规范；日志控制台保留深色独立 token。
7. 清理：删除 `antd` 依赖与 `App.css` 中 antd 覆盖；硬编码色值全部改 `var(--*)`。
8. 自查清单过一遍（见重构计划验收节）+ `npm run lint && npm run build && npm run test`。
