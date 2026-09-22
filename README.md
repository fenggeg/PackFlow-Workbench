# PackFlow Workbench

面向 Windows 的 Maven 多模块项目打包工作台。基于 Tauri 2，React 19 前端负责交互编排，Rust 后端负责 POM 解析、环境检测、进程执行与 SQLite 持久化。

当前版本：`3.3.7`（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` 三处版本号保持一致）。

## 功能概览

### 构建中心

- 解析 Maven 父工程与多模块结构，模块树点选行即加入/移出构建范围
- 打包参数：构建目标（clean / package / install / verify，按生命周期自动排序）、`-am` 依赖构建、跳过测试、Profiles、附加参数（`-U` / `-o` / `-e` / `-X` / `-q` / `-DskipITs`）与自定义参数
- 高级参数：本地仓库覆盖、`revision`、并行构建线程数（`-T`，1–16）、最大并发构建数（1–8）
- 底栏常驻命令区：完整命令预览、手工改写、复制、重新生成、保存为模板、一键构建 / 停止
- 实时构建进度：百分比、当前阶段（准备 / 构建模块 / 扫描产物 / 完成）与子步骤（清理 / 编译 / 测试 / 打包 / 安装），底栏细进度条同步显示
- 构建失败自动诊断：规则引擎给出错误类型、摘要、可能原因、建议动作与关键日志行，支持一键复制
- 依赖冲突检测：基于 `mvn dependency:tree -Dverbose`，展示冲突版本与依赖路径，可生成单条或按模块批量 `<exclusions>` 排除代码

### 环境与工具

- 环境检测：JDK、Maven、Maven Wrapper、settings.xml、本地仓库、Git 状态
- JDK 注册中心：扫描系统已安装 JDK（Program Files、Scoop、IntelliJ 等常见路径），支持手动登记、删除与设为默认
- 环境配置按项目绑定：手动修改后自动记忆并绑定到当前 `projectRoot`，切换项目自动适配；支持解绑
- 手动指定 `settings.xml` / 本地仓库后，命令自动追加 `-s` 与 `-Dmaven.repo.local`
- Git：`git fetch` 检查远端、`git pull --ff-only`、本地分支切换、最近提交列表

### 产物与历史

- 产物管理：聚合当前产物与历史产物并按路径去重，表格展示文件名 / 类型 / 大小 / 模块 / 修改时间，支持关键词搜索、分页、复制路径、打开目录、删除（可选仅删记录）
- 历史管理：顶部统计（总计 / 成功 / 失败 / 已停止），支持按模块或命令搜索、按结果筛选、重跑、删除、复制命令、打开目录
- 常用组合（模板）：保存当前构建参数，支持应用、重命名、置顶、删除

### 首页与工作台

- 首页卡片：系统时间、网络状态（公网 IP / 归属地 / 运营商）、节假日倒计时（含调休提醒）、当前环境状态
- 四区布局：顶栏 + ActivityBar + Sidebar + MainWorkspace + Inspector 抽屉 + 底栏操作条
- 检查器抽屉：日志 / 构建诊断 / 构建详情三个页签，支持全屏放大
- 导航栏设置：页面可见性、排序与启动默认页面可自定义，配置持久化
- 深浅色主题切换（浅色 / 深色 / 跟随系统）
- 命令面板：`Ctrl + K` 唤起，可跳转页面、开始/停止构建、刷新环境、扫描 JDK、切换主题与项目
- 应用内自动更新：基于官方 Updater 插件，自建更新源优先、GitHub 兜底

### 数据与排查

- 数据备份与恢复：把本地数据库导出到指定位置或从备份恢复（校验文件头，拒绝非 SQLite 文件）
- 诊断包导出：一键导出版本、项目、环境、构建参数、诊断结果与最近日志
- 数据导出：历史记录导出 CSV，构建模板与依赖冲突结果导出 JSON
- 打开应用数据目录：直达数据库与日志文件所在位置

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（`tauri` 2.10，Windows 仅 NSIS 打包） |
| 前端 | React 19 + TypeScript 6 + Vite 8 |
| 样式 | Tailwind CSS 4 + CSS 变量设计令牌 |
| 组件 | Radix UI Primitives + 自建 `components/ui`（shadcn 风格） |
| 图标 / 动效 | lucide-react、motion |
| 状态 | Zustand 5（含 persist 持久化） |
| 测试 | Vitest 4 |
| 后端 | Rust（edition 2021，最低 1.77.2） |
| 数据库 | SQLite（rusqlite bundled，WAL 模式） |
| 桌面能力 | windows-sys（Job Object 进程树管理、剪贴板、DPAPI） |
| 更新 | tauri-plugin-updater + GitHub Releases |

## 快速开始

### 前置条件

- Windows 10/11
- Node.js LTS（Vite 8 建议 20.19+ 或 22.12+）与 npm
- Rust 1.77.2+ 与 MSVC 生成工具（Visual Studio Build Tools）
- WebView2 Runtime（Windows 11 一般已内置）

### 常用命令

```bash
npm install                # 安装依赖
npm run dev                # 仅前端开发服务器（http://localhost:5173，strictPort）
npm run tauri:dev          # 完整桌面应用（前端 + Rust 后端）
npm run lint               # ESLint 检查
npm run build              # tsc -b && vite build（类型检查 + 打包）
npm run test               # vitest 单元测试
cd src-tauri && cargo check # Rust 类型/编译检查
```

前端改动建议按 `npm run lint` → `npm run build` → `npm run test` 的顺序验证；Rust 改动在 `src-tauri/` 下执行 `cargo check`。

单元测试覆盖 `useAppStore` 选择逻辑与命令锁定、构建进度解析（含 Reactor 清单统计）、失败诊断规则打分、`boundedBuffer`、`buildOptions` 归一化与日志文本处理，共 9 个 `*.test.ts` 文件。

## 构建安装包

```bash
npm run tauri:build
```

NSIS 安装包输出到 `src-tauri/target/release/bundle/nsis`。

> `dist/` 只是 Vite 的前端产物，供 Tauri 构建时消费；最终安装包不在 `dist/`。

## 项目结构

```
src/
  main.tsx / App.tsx        入口；启动时加载依赖图并在就绪后关闭原生启动窗口
  SplashOverlay.tsx         启动遮罩
  app/                      应用外壳
    AppShell                顶栏 + 四区布局 + 项目切换弹窗
    ActivityBar             一级功能导航（首页 / 构建 / 产物 / 历史），带导航栏设置
    SidebarPanel            构建页侧栏：Git / 模块 / 冲突 / 常用
    MainWorkspace           页面路由容器
    InspectorDrawer         检查器抽屉：日志 / 诊断 / 详情
    BottomActionBar         底栏：状态、目标模块、命令区、构建 / 停止
    ThemeToggle、TitleBarControls
  pages/                    Dashboard、Build、Artifact、History
  components/
    BuildProgress/          进度面板、底栏细进度条、进度语义
    BuildOptions/           打包参数
    AdvancedOptions/        高级参数
    BuildCenter/            构建后续操作
    BuildLogPanel/          构建日志（框选复制、自动滚动、换行开关）
    BuildTemplate/          保存模板弹窗
    DependencyConflict/     依赖冲突检测与排除代码
    EnvPanel/               环境面板、JDK 注册表
    FavoriteGroups/         常用组合
    GitStatus/              Git 状态卡片
    HistoryTable/           历史表格
    ModuleTree/             模块树
    ProjectSelector/        项目选择器
    NavigationSettings/     导航栏设置
    Dashboard/              系统时间、网络状态、节假日倒计时卡片
    UpdateChecker/          应用更新检查
    DataTools/              数据备份/恢复、诊断包导出、打开数据目录
    CommandPalette/         Ctrl+K 命令面板
    common/                 LogConsole、ExternalLinks
    ui/                     button / card / dialog / select / tabs 等基础组件
  services/                 前端业务逻辑
    tauri-api.ts            所有 invoke() 与事件监听的统一入口
    buildProgressService    进度解析（含 Reactor 模块清单统计）
    buildDiagnosisService   构建失败规则诊断
    logParserService        日志解析
    environmentCenterService、holidayService
  store/                    Zustand：useAppStore、useBuildProgressStore、
                            useEnvironmentStore、useDependencyStore、
                            useNavigationConfigStore、useThemeStore、
                            useFeedbackStore、useWorkflowStore、navigationStore
  hooks/ lib/ utils/        事件订阅、动效、格式化、下载导出与容量裁剪工具
  types/domain.ts           前端领域类型

src-tauri/src/
  commands/                 Tauri command 入口（11 个模块，44 个命令）
    project                 项目解析、模块依赖图
    data                    数据备份/恢复、诊断包导出、打开数据目录
    environment             环境检测、环境设置、项目绑定、JDK 注册表
    build                   命令预览、启停构建、并发上限
    dependency              依赖冲突检测与排除代码生成
    filesystem              产物扫描、删除、资源管理器打开
    clipboard               文件复制到剪贴板（同时写入文件引用与路径文本）
    git                     Git 状态、fetch / pull / 切换分支 / 提交列表
    history                 构建历史读写与删除
    template                构建模板读写与删除
    network                 公网 IP 与归属地查询
  services/
    pom_parser              POM 解析（基于修改时间缓存）
    env_detector            环境检测
    jdk_scanner             JDK 扫描
    command_builder         Maven 命令构建
    process_runner          构建进程管理（Job Object 进程树、并发控制）
    dependency_graph        模块依赖图分析
    dependency_conflict     依赖冲突检测
    app_logger、blocking    日志与阻塞任务调度
  repositories/             SQLite 数据访问（storage、history_repo、settings_repo、template_repo）
  models/                   serde 数据模型（8 个模块）
  error.rs                  AppResult<T> = Result<T, String>
  lib.rs                    Tauri 应用构建与命令注册
```

## 数据持久化

- SQLite 数据库为应用数据目录下的 `app.sqlite3`，启用 WAL 模式与外键约束
- 三张表：`build_history`、`build_templates`、`app_settings`（均为 JSON payload 列）
- 构建历史最多保留最近 100 条，写入时自动清理更早记录
- 构建历史与模板按 `projectRoot` 归属项目，切换项目不会展示其他项目的配置
- 环境设置（含项目与配置的绑定关系）保存在 `app_settings`
- 导航栏配置、主题等 UI 偏好由前端 Zustand persist 存于 localStorage

## IPC 与事件约定

- 所有 `invoke()` 调用统一收口在 `src/services/tauri-api.ts`，新增 IPC 请在此处添加
- `isTauriRuntime()` 守卫所有 Tauri 调用，非桌面环境会抛出中文提示
- 后端命令统一返回 `Result<T, String>`（`AppResult`）
- 长任务用事件推送：构建日志 `build-log`、构建结束 `build-finished`；前端在 `hooks/useEventSubscriptions.ts` 统一订阅
- 应用就绪事件 `app-ready` 由前端发出，后端收到后关闭原生启动窗口（`public/splash.html`）并显示主窗口
- 耗时操作（Git 远端访问、环境检测、项目解析、产物扫描、数据库读写）走 `services/blocking.rs` 后台线程，避免阻塞 UI

## CI/CD

GitHub Actions（`.github/workflows/tauri-build.yml`）：

- 触发条件：推送到 `main`、推送 `v*` 标签，或手动 `workflow_dispatch`
- 运行环境 `windows-latest`，产出 NSIS x64 安装包（`PackFlow Workbench_x64-setup.exe`）
- 从 `CHANGELOG.md` 抽取对应版本小节作为 Release 说明；`v*` 标签缺少对应小节会直接失败
- 非标签推送会发布到 `windows-auto-build` 的 draft / prerelease
- 需要配置 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 密钥

## 更新机制

- 使用官方 `tauri-plugin-updater`，端点按顺序为自建更新源与 GitHub Releases 兜底，配置见 `src-tauri/tauri.conf.json`
- Windows 安装模式为 `passive`：安装前自动退出进程，安装完成后自动重启新版本
- 桌面启动时静默检查更新；发现新版本时顶栏「检查更新」按钮显示红点提醒

## 附带资产

- `website/`：项目官网静态站点
- `docs/`：GitHub Releases 更新说明、UI 交互审查报告

## 备注

- 当前定位为 Windows 本地桌面工具，仅构建 NSIS 安装包
- 用户可见文案以中文为主
- 网络相关的两个可选能力依赖外部接口：网络状态查询使用 `realip.cc`，节假日数据使用第三方节假日接口；接口不可用仅影响对应卡片，不影响构建功能
- 开发阶段不保证兼容早期本地数据结构
