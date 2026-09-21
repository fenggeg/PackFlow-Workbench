# PackFlow Workbench 改动审查报告（交互逻辑 / 布局结构 / 用户体验）

审查范围：工作区未提交改动（38 个文件，约 +4500 / -5800），核心是一次 **antd → Tailwind v4 + 自建组件库** 的整体 UI 重构（删除 `src/App.css`、`src/theme/uiTokens.ts`，新增 `src/app/*` 外壳、`src/components/ui/*` 与 `src/index.css` 设计令牌）。
静态检查：`npx eslint src --max-warnings=0` 通过（0 error / 0 warning），说明问题集中在**设计与逻辑层面**，不是语法层面。

---

## 一、功能缺陷 / 逻辑错误（P0，建议优先修）

### 1. 构建目标（goals）顺序不可控，会生成非法命令
`goals` 用复选框多选，勾选顺序即数组顺序，而后端直接 `join(" ")`：

```96:113:src/components/BuildOptions/BuildOptionsPanel.tsx
// 勾选顺序 = goals 数组顺序
```

```20:24:src-tauri/src/services/command_builder.rs
if options.goals.is_empty() { args.push("package") } else { args.extend(options.goals) }
```

先勾 `package` 再勾 `clean` → 生成 `mvn package clean`（先打包再清理，语义错误）。
**建议**：改成"目标顺序可编辑的 chips/可拖拽列表"，或在写入 store / 后端时按 Maven 生命周期规范序（`clean < validate < compile < test < package < verify < install < deploy`）排序。

### 2. 同一份 `customArgs` 有三个互相覆盖的编辑入口
- `BuildOptionsPanel`「自定义」输入框（保留常用开关项，追加手写项）
- `AdvancedOptionsPanel`「追加 Maven 参数」textarea：`setBuildOption('customArgs', splitArgs(...))` **全量覆盖**，会把 `-U/-o/-e`、`-T4` 一并吞掉
- `AdvancedOptionsPanel`「并行构建线程数」：往同一数组里塞 `-T{n}`

```120:128:src/components/AdvancedOptions/AdvancedOptionsPanel.tsx
```

用户在任一处输入，都会静默丢失另一处的配置，且无法察觉。
**建议**：把 `customArgs` 拆成结构化字段（`commonFlags` / `threadCount` / `extraArgs`），UI 各自只改自己的字段，最终由统一函数合成命令；textarea 只负责 `extraArgs`。

### 3. 全局错误状态 `error` 几乎不可见
`useAppStore` 里有 20+ 处 `set({ error })`（构建启动失败、保存模板失败、删除产物失败、环境更新失败…），但全项目只有 `ProjectSelector` 消费了它：

```29:29:src/components/ProjectSelector/ProjectSelector.tsx
const error = useAppStore((state) => state.error)
```

`HistoryTable` 里甚至还留着 `// store 已写入 error` 的注释——说明作者以为有提示，实际用户看不到任何反馈。
**建议**：在 `AppShell` 增加全局 Toast/通知中心（右上角或底部），统一消费 `error`，并支持手动关闭与队列；删除各页面里手写的 `flash()`（见第 16 条）。

### 4. 依赖冲突扫描：取消是假的，切 Tab 结果全丢
- `handleCancel` 只置 `abortRef`，后端 `mvn dependency:tree` 仍在跑，UI 却提示"扫描已取消"
- 扫描状态/结果是组件局部 `useState`，而 `SidebarPanel` 用 Radix `Tabs`（非激活面板默认卸载）→ 切到「模块」再切回来，进度条、结果、事件监听全部重置

```177:211:src/components/DependencyConflict/DependencyConflictPanel.tsx
```

**建议**：① 扫描状态提升到 store（或至少 `TabsContent` 加 `forceMount`）；② 后端提供真正的 abort 命令，前端 `取消` 调它；③ 无 abort 能力时把按钮改成「停止等待」并说明"后台仍在扫描"。

### 5. Git 拉取 / 切换分支会清空工作区状态
`pullGitUpdates`、`switchGitBranch` 成功后都调用 `parseProjectPath`，而该函数会重置 `logs / artifacts / selectedModules / diagnosis / gitStatus`：

```290:313:src/store/useAppStore.ts
```

用户只是想拉个代码，结果已选模块、构建日志、诊断结果全没了，且无任何提示。
**建议**：拆成"轻量重解析"——只刷新 `modules`，保留选择与日志；或在执行前弹确认「将清空当前构建日志与模块选择」。

### 6. 导航栏设置存在"双份状态"，恢复默认后 UI 不刷新
`localItems` 用 `useState` 从 store 快照初始化后再不与 store 同步；`handleReset` 里 `setLocalItems(items)` 用的还是闭包中的旧值：

```29:63:src/components/NavigationSettings/NavigationSettings.tsx
```

**建议**：删除 `localItems`，直接渲染 `useNavigationConfigStore` 的 `items`（单一数据源）。另外「恢复默认」是立即生效且不可撤销，而「完成」只是关闭，二者语义不一致——建议改为"确定/取消"二段式，或把恢复默认放进确认弹窗。

### 7. 模块树：无法"只查看不选中"，依赖洞察面板会突然消失
`Tree` 的行点击同时触发 `onToggleCheck` + `onSelect`；而 `ModuleTreePanel` 的 `onSelect` 只在**已勾选**时才聚焦，且 `onCheckedChange` 里 `keys.size === 1` 才保留聚焦：

```196:215:src/components/ModuleTree/ModuleTreePanel.tsx
```

结果：勾选第 2 个模块时 `keys.size !== 1` → `setFocusedModuleId(undefined)` → 底部整块「依赖洞察」瞬间消失，视觉抖动明显；用户也无法在不改变打包范围的前提下查看某个模块的依赖。
**建议**：分离"选中(打包范围)"与"聚焦(查看详情)"两种点击（复选框管选中，行点击管聚焦，双击或右键菜单管"选中并聚焦"）；多模块时保留最后一个聚焦项或改为"多选模式下隐藏洞察并给出提示"。

---

## 二、布局结构问题（P1）

### 8. 检查器抽屉在所有页面常驻，且小屏覆盖主内容
`InspectorDrawer` 挂在 `AppShell` 主区，首页/产物/历史页也会显示"日志 / 构建诊断 / 构建详情"，语义与当前页面无关；`lg` 以下为 `absolute inset-y-0 right-0 z-30` 覆盖主区，**没有遮罩**，且 toggle 按钮 `absolute right-0 z-40` 悬在主内容之上：

```130:175:src/app/InspectorDrawer.tsx
```

**建议**：① 仅在 `build` 页（或有构建上下文时）启用；② 小屏改为带遮罩的抽屉，并支持 Esc 关闭；③ 抽屉打开时压缩主区而非覆盖（已有 `lg:relative`，可把断点下调）。

### 9. 侧边栏承载过重内容
侧栏宽 260 / 312px，却塞进了：
- 模块树「依赖洞察」：4 组标签 + 3 段说明文字 + 2 个按钮（`ModuleTreePanel` 236–321 行）
- 依赖冲突结果：模块卡片 + 冲突详情 + 批量排除

窄栏 + 长中文说明 + 多行标签 = 阅读成本高、滚动链路长。
**建议**：把"依赖洞察 / 冲突详情"这类详情内容放进右侧检查器抽屉或弹层，侧栏只保留列表与摘要（hover 或点击 → 详情）。

### 10. 语义化与标题层级缺失
`MainWorkspace` 用 `<section>`，页面内部又各自渲染 `<main>`；`PageHeader` 用 `<h3>`，页面缺少 `<h1>/<h2>`。
**建议**：`MainWorkspace` 改为 `<main>`，页面根元素改 `<section>`；`PageHeader` 的 `title` 按页面层级使用 `h1/h2`。

### 11. 历史表布局浪费 + 无检索能力
`min-w-[900px]` 固定列宽（合计 830px），窄窗口横向滚动；`HistoryPage` 主区很高但每页仅 6 行（展开 12 行）。且无搜索、无状态筛选、无排序。

```58:58:src/components/HistoryTable/HistoryTable.tsx
const pageSize = expanded ? 12 : 6
```

**建议**：主区内默认 15–20 行（或自适应高度），表格改为 `table-fixed` + 关键列优先；增加"按状态/项目/时间"筛选与关键字搜索，并支持导出 CSV。

### 12. 底部命令栏信息密度低
整条 Maven 命令单行 `truncate` 展示，长命令基本不可读；手动编辑后没有"恢复自动生成"的入口，一旦改错只能切项目或重启。

**建议**：命令区改为可展开两行 + 悬浮 `title` + "复制"后 Toast；增加「重置为自动生成」按钮（`refreshCommandPreview` 已具备能力）。

---

## 三、交互与一致性问题（P1）

### 13. 图标语义冲突 / 危险操作无确认
- `BuildLogPanel`：「自动滚动」开关用 `Play`，「停止构建」用 `Pause` —— 与直觉相反
- `HistoryTable`：「重跑」是 `variant="primary"` 且**立即清空当前日志与产物**却无二次确认；「恢复」（只载入参数）是 ghost + `RotateCcw`，两者区别用户无法预判

**建议**：自动滚动改用 `ArrowDownToLine`/`ChevronsDown`；停止用 `Square`；「重跑」改为 `secondary` 并加确认（或在构建中时禁用并给出原因）。

### 14. 模板能力两套入口、两套术语、两套实现
- 底栏：「保存为模板 / 构建模板」（`BottomActionBar`）
- 侧栏：「保存当前选择为常用组合 / 常用组合」（`FavoriteGroupsCard`）

两者都在写 `templates`，UI 文案却完全不同，用户会以为是两种东西。
**建议**：统一为「构建模板」单一概念与命名，只保留一个保存入口（推荐放侧栏卡片头部 + 底栏图标入口复用同一组件）。

### 15. 手写下拉菜单会被侧栏裁剪，且无键盘支持
```112:148:src/components/FavoriteGroupsCard.tsx
```
菜单 `absolute right-0 top-full` 位于 `overflow-y-auto` 的 `TabsContent` 内 → 展开后会被容器裁掉并随滚动漂移；没有 Esc 关闭、方向键导航、焦点管理。项目已装 `@radix-ui/react-dropdown-menu` 却没用。
**建议**：直接用 Radix `DropdownMenu`（自带 Portal，避免裁剪 + 完整键盘/ARIA 支持），并移除手写实现。

### 16. 反馈机制各写各的，定时器不清理
`ArtifactPage`、`BuildNextActionsPanel`、`DependencyConflictPanel`、`UpdateChecker` 各自实现了 `flash()` + `window.setTimeout`，均未清理（组件卸载后仍 setState），样式与时长（2400 / 2800ms）也不统一；底栏「复制命令」、`HistoryTable`「复制命令」干脆没有任何反馈。
**建议**：抽出统一 `useToast()` / `<Toaster>`（置于 `AppShell`），复制类操作统一走它。

### 17. 更新提示被截断 + 静默检查触发两次
`UpdateChecker` 的 toast 限定 `max-w-[160px] truncate`，而错误文案都是长句（"下载更新失败：更新包下载中断或内容不完整，请检查网络后重新下载。"）——用户只能看到前几个字。
另外启动 3.5s 的静默检查 effect 依赖 `checkUpdate`，而 `checkUpdate` 依赖 `currentVersion`，版本号返回后会再触发一次静默检查。

**建议**：toast 改为可换行浮层（宽 280–320px，`title` 保留全文）；静默检查用 `useRef` 守卫只跑一次（deps 只留 `[]` + ref 读取版本）。

### 18. 表单细节
- 保存模板 / 编辑组合名称：无 Enter 提交、无长度上限、重名无提示
- `EnvPanel` 三个路径输入框用 `defaultValue + onBlur` 提交：点「完成」关闭弹窗时不触发 blur → 已输入内容**被静默丢弃**
- `AdvancedOptionsPanel` 数字输入 `max` 不生效（可输入 99），空值处理绕（`value ? ... : 0`）

**建议**：统一受控输入 + 显式「保存」按钮；数字输入加 clamp 与错误提示。

### 19. 空状态缺失
`GitStatusCard` 在未选项目时 `return null`，侧栏「Git」页签整块空白，没有任何引导。

**建议**：补空状态（"请先选择项目" + 跳转按钮，`navigateToProjectSelector` 已在 store 中存在却未被使用）。

### 20. 全局禁用右键菜单
```6:8:src/main.tsx
document.addEventListener('contextmenu', (event) => { event.preventDefault() })
```
对本应用是明显退步：日志区、命令输入框、路径文本都无法右键复制/粘贴，而"复制命令/复制路径"恰恰是高频操作。
**建议**：仅对非输入区域（如标题栏拖拽区）禁用，或在日志/命令区提供自定义右键菜单（复制、全选、清空）。

---

## 四、设计体系与工程质量（P2）

### 21. 主题令牌体系只做了一半
- `.dark` 全量定义却**没有任何切换入口**（全项目无 `classList.add('dark')`）→ 死代码
- `SplashOverlay` 内联样式硬编码 `#fafafa / #171717`，`TitleBarControls` 关闭按钮 hover 硬编码 `#dc2626`，都绕过了令牌

**建议**：补一个"外观：跟随系统 / 浅色 / 深色"设置并持久化；把上述硬编码换成 `var(--*)`。

### 22. 令牌使用方式不利于维护
全项目大量 `bg-[var(--card)]`、`text-[var(--muted-foreground)]`、`border-[var(--border)]` 这类任意值写法散落在 30+ 处。
**建议**：在 `@theme` 中登记语义色后直接用 `bg-card / text-muted-foreground / border-border`，或沉淀 `Panel`、`SectionTitle`、`MetaText` 等语义组件，减少重复与后续换肤成本。

### 23. 死代码与重复实现
未被任何文件引用：`ui/collapsible.tsx`、`ui/scroll-area.tsx`、`ui/separator.tsx`、`ui/badge.tsx`、`ui/panel-section.tsx`；
已装未用：`@radix-ui/react-dropdown-menu`、`@radix-ui/react-label`、`@radix-ui/react-collapsible`、`@radix-ui/react-scroll-area`；
`WorkspaceCollapse` 自己实现了折叠（`ui/collapsible` 已存在）；`WorkbenchHistoryPanel` 只是 `<HistoryTable />` 的空壳包装；`InspectorLogSource` 只有一个 `'build'` 取值却在 `BuildLogPanel` 里做条件渲染（无意义抽象）。

**建议**：清理未使用文件与依赖；删除 `WorkbenchHistoryPanel`；`InspectorLogSource` 要么补全要么移除。

### 24. 性能隐患
- `LogConsole` 每行调用 `classifyLine` 3 次、渲染最多 1200 个 `<pre>`，Maven 高频输出时明显掉帧
- `setBuildOption` 每次输入（含逐字输入 profile）都触发一次 `refreshCommandPreview()` IPC
- 自动滚动不会在用户上滑时自动关闭

**建议**：① 分类结果在 `useMemo` 里算一次并复用；② 日志区改用虚拟列表（或把 `renderLimit` 降到 300 并支持"加载更早"）；③ 命令预览加 200–300ms debounce；④ 监听 `scroll` 事件，用户上滑即暂停自动滚动并显示"回到底部"。

### 25. 其它
- `StrictMode` 下 `useEventSubscriptions` 的 effect 会跑两次 → `initialize()` 在 dev 下执行两次（重复加载历史/解析项目），建议加 ref 幂等守卫
- 产物页把 `artifacts` 与 `history[].artifacts` 合并去重后**无排序**（顺序取决于来源），也无搜索、无批量清理
- 首页「开始打包」在 `PageHeader.actions` 与「快捷操作」卡片中重复出现
- `Route` 级 `lazy` + `Suspense` 的 fallback 是裸文字，建议统一为骨架屏

---

## 五、建议的修复优先级

| 优先级 | 事项 | 预估 |
|---|---|---|
| P0 | #1 goals 排序、#2 customArgs 拆分、#3 全局 Toast、#4 冲突扫描状态提升、#5 Git 操作不清空工作区、#6 导航设置单一数据源、#7 模块树聚焦逻辑 | 1–2 天 |
| P1 | #8 检查器抽屉作用域与遮罩、#9 侧栏减负、#12 命令区可读性、#13 图标与危险操作确认、#14 模板概念统一、#15 用 Radix DropdownMenu、#16 统一 Toast、#19 空状态、#20 放开右键菜单 | 2–3 天 |
| P2 | #10 语义化、#11 历史表分页与检索、#17/#18 细节打磨、#21 深色模式落地、#22 语义类沉淀、#23 死代码清理、#24 日志性能 | 3–5 天 |

> 总体判断：本次重构在**视觉一致性与信息密度**上提升明显（统一 13px 字号、克制的语义色、独立深色控制台岛屿），但**状态管理与交互反馈层没有同步重构**——局部 `useState` 泛滥、store 的 `error` 无人消费、同一数据多入口编辑、危险操作无确认，是当前最需要补齐的部分。

---

## 六、修复记录（已完成）

### 状态管理与反馈层（新增/重构）
| 文件 | 说明 |
|---|---|
| `src/store/useFeedbackStore.ts`（新增） | 全局通知单一出口：`notify/notifySuccess/notifyError/...`，相同内容去重、定时器与 store 分离可清理、`describeError` 统一异常文案 |
| `src/components/ui/toaster.tsx`（新增） | 右下角通知栈，支持换行长文案、手动关闭、`role=alert/status` |
| `src/store/useDependencyStore.ts`（新增） | 依赖冲突扫描状态（scanning/progress/result/elapsed）提升到 store，事件监听在 store 层注册一次，切页签不再丢进度 |
| `src/store/useThemeStore.ts`（新增）+ `src/app/ThemeToggle.tsx` | 主题持久化与切换，`.dark` 不再是死代码 |
| `src/store/useAppStore.ts` | 新增统一错误出口 `fail()`（写 store + 弹通知），覆盖全部 `set({error})`；新增 `scheduleCommandPreview`（200ms 防抖）与 `flushCommandPreview`（构建前强制冲刷）；新增 `setGoals/setCommonArgs/setExtraArgs/setThreadCount/clearError/reloadProjectModules`；`initialize` 幂等（StrictMode 不再重复初始化）；命令预览发送前统一归一化 |
| `src/utils/buildOptions.ts`（新增） | goals 按生命周期排序；`customArgs` 拆为 `commonArgs/threadCount/extraArgs` 并单向合成；`normalizeBuildOptions` 兼容旧数据（拆分回填） |

### 逻辑错误修复
- goals 不再出现 `mvn package clean`（`sortGoals` + 归一化）
- `customArgs` 三个编辑入口不再互相覆盖：常用开关/线程数/自定义各写各字段，`customArgs` 只作为派生结果
- 导航设置删除本地副本 `localItems`，直接读写 store
- 模块树：复选框管"打包范围"、行点击管"依赖洞察"，多选不再导致洞察面板闪断；Tree 支持 Enter/方向键
- Git 拉取/切分支改用 `reloadProjectModules`，保留日志、产物、诊断与已选模块
- 依赖冲突"取消"改为诚实的"放弃等待"（令牌作废 + 说明后端仍在扫描）
- 环境路径弹窗改为受控草稿 + 显式保存，不再静默丢弃输入

### 交互与布局
- 检查器抽屉仅在构建页或有构建上下文时出现；小屏加遮罩 + Esc 关闭 + 显式收起按钮
- 模块树"依赖洞察"折叠化；冲突详情移入弹窗；侧栏信息密度下降
- `MainWorkspace` 改 `<main>`、页面改 `<section>`、`PageHeader` 用 `<h1>`
- 历史表：每页 12/20 条、新增关键字搜索与结果筛选、`table-fixed` 横向滚动；「重跑」改为 secondary + 二次确认（说明会清空日志）
- 底栏命令支持两行展示 + 「恢复自动生成」+ 复制反馈；命令弹窗区分取消/保存
- 模板统一为「构建模板」一套概念，底栏与侧栏共用 `SaveTemplateDialog`
- 常规模板菜单改用 Radix `DropdownMenu`（Portal 不被侧栏裁剪 + 键盘/ARIA）
- 图标语义：自动滚动 `ArrowDownToLine`、停止 `Square`；新增「回到底部」
- 右键菜单只屏蔽空白区，输入控件与 `data-allow-context-menu`（日志/命令/代码预览）保留
- `SplashOverlay`、标题栏关闭按钮改用令牌颜色；Splash 隐藏时 `visibility: hidden`
- 自动滚动在用户上滑时自动暂停；`LogConsole` 分类结果只算一次、渲染上限 300 行
- 产物页按修改时间排序 + 搜索；Dashboard 去掉重复的「开始打包」

### 清理
- 删除：`ui/collapsible.tsx`、`ui/scroll-area.tsx`、`ui/separator.tsx`、`ui/badge.tsx`、`ui/badge-variants.ts`、`ui/panel-section.tsx`、`HistoryTable/WorkbenchHistoryPanel.tsx`
- 移除 store 中无意义的 `inspectorLogSource`（仅一个取值却做条件渲染）

### 验证
`npm run lint` 0 error / 0 warning，`npm run build` 通过，`npm run test` 14 项通过（新增 `src/utils/buildOptions.test.ts` 11 项覆盖排序与参数拆分/合成/归一化）。

### 新增功能：打包进度可视化
| 文件 | 说明 |
|---|---|
| `src/services/buildProgressService.ts` | 纯函数式进度推导：解析 Maven 日志的 `Building X`、`Reactor Summary`、`maven-*-plugin` 目标行、`BUILD SUCCESS/FAILURE`，输出阶段/模块/子步骤与百分比 |
| `src/store/useBuildProgressStore.ts` | 进度状态：整批日志一次性推导，快照签名无变化则不写入 store；成功后 3.2s 自动收起，失败/取消保持可见 |
| `src/components/BuildProgress/BuildProgressPanel.tsx` | 详细视图（构建页）：总进度条 + 四阶段（准备/构建模块/扫描产物/完成）+ 模块计数 + 子步骤（清理/编译/测试/打包/安装）+ 失败提示与「查看诊断」+ 完成耗时与产物数 |
| `src/components/BuildProgress/BuildProgressStrip.tsx` | 底栏细进度条，绝对定位不占布局；底栏状态位同步显示 `百分比 · 当前阶段` |
| `src/components/BuildProgress/progressTone.ts` | 状态配色/文案映射，全部走设计令牌（浅色/深色一致） |
| `src/index.css` | 新增 `progress-stripes` 条纹动画，仅用于「进行中」状态 |

- 性能：进度与日志同源，复用已有的 50ms 批量缓冲；tracker 存于模块作用域，仅在快照变化时才 `set`，百分比取整后渲染频率进一步降低
- 语义：进度由日志推导，界面明确标注「按日志估算」，避免误导为 Maven 上报的精确值
- 状态：`pending/active/done/failed` 四态在阶段与子步骤上统一（图标 + 令牌色）

### 遗留建议
`package.json` 中 `@radix-ui/react-{label,collapsible,scroll-area,separator}` 已无引用，可 `npm uninstall` 清理（涉及 lockfile 变更，未在本轮执行）。
