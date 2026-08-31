---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '6d1e6445-516a-4bf6-bd25-836df390a1bf'
  PropagateID: '6d1e6445-516a-4bf6-bd25-836df390a1bf'
  ReservedCode1: '6dbfb96d-8b6d-4a8a-83ac-3f23cd140e3a'
  ReservedCode2: '6dbfb96d-8b6d-4a8a-83ac-3f23cd140e3a'
---

# PackFlow Workbench

面向 Windows 的 Maven 多模块项目构建桌面工具。基于 Tauri 2 构建，React 前端负责交互编排，Rust 后端负责项目解析、命令执行、SQLite 持久化和 Windows 本地能力集成。

## 功能概览

### 构建中心

- 解析 Maven 父工程和多模块结构，支持模块树选择、依赖构建和命令预览
- 自动识别 JDK、Maven、Maven Wrapper、settings.xml、本地仓库和 Git 状态
- 支持构建参数配置（goals/profiles/properties）、最终命令手工编辑、实时日志、构建诊断、历史回填和常用组合
- 构建失败自动诊断，基于规则引擎分析原因并给出修复建议
- 依赖冲突检测，自动分析并生成排除代码

### 产物管理

- 聚合构建产物，支持按模块和规则筛选 jar/war/zip 等文件
- 支持打开文件夹、复制路径、删除产物（可选仅删记录）

### 其他

- 首页仪表盘：展示环境状态、运行中任务、构建快捷入口
- 统一历史管理：构建记录统一查看，支持重跑和删除
- 环境配置方案：多套 JDK/Maven 配置按项目绑定，切换项目自动适配
- 应用内自动更新检查与安装
- 导航栏页面可见性与排序可自定义

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| UI | Ant Design 6 |
| 状态 | Zustand |
| 后端 | Rust |
| 数据库 | SQLite（rusqlite bundled） |
| 更新 | Tauri Updater Plugin + GitHub Releases |

## 本地开发

```bash
npm install                # 安装依赖
npm run dev                # 前端开发服务器（port 5173）
npm run tauri:dev          # 完整桌面应用（前端 + Rust 后端）
npm run lint               # ESLint 检查
npm run build              # TypeScript 编译 + Vite 构建
npm run test               # vitest 单元测试
cd src-tauri && cargo check # Rust 类型检查
```

## 构建安装包

```bash
npm run tauri:build
```

NSIS 安装包输出到 `src-tauri/target/release/bundle`。

## 项目结构

```
src/
  app/                    应用外壳（ActivityBar、SidebarPanel、MainWorkspace、InspectorDrawer）
  pages/                  页面（Dashboard、Build、Artifacts、History）
  components/             UI 组件
    BuildCenter/          构建选项、下一步操作
    BuildLogPanel/        构建日志
    BuildOptions/         构建参数配置
    CommandPreview/       Maven 命令预览
    DependencyConflict/   依赖冲突检测
    ModuleTree/           Maven 模块树
    GitStatus/            Git 状态卡片
    EnvPanel/             环境面板、JDK 注册表
    FavoriteGroups/       收藏分组管理
    HistoryTable/         历史表格
    ProjectSelector/      项目选择器
    UpdateChecker/        应用更新检查
    NavigationSettings/   导航栏设置
    common/               通用组件（LogConsole）
  services/               前端业务逻辑和 Tauri IPC 封装
    tauri-api.ts          所有 invoke() 调用和事件监听的统一入口
  store/                  Zustand 状态管理
  types/                  前端领域类型

src-tauri/src/
  commands/               Tauri command 入口（11 个模块，42 个命令）
  services/               Rust 业务逻辑
    pom_parser            POM 解析
    env_detector          环境检测
    jdk_scanner           JDK 扫描
    command_builder       Maven 命令构建
    process_runner        构建进程管理
    dependency_graph      模块依赖图分析
    dependency_conflict   依赖冲突检测
    process_utils         进程工具
  repositories/           SQLite 数据访问（4 个模块）
  models/                 serde 数据模型（9 个模块）
  error.rs                AppResult<T> = Result<T, String>
  lib.rs                  Tauri 应用构建与命令注册
```

## 数据与隔离

- 所有数据存储在 Tauri 应用数据目录下的 `app.sqlite3`
- 构建历史和模板按 `projectRoot` 归属项目，切换项目后不会展示其他项目的配置
- 构建历史最多保留最近 100 条

## CI/CD

GitHub Actions（`tauri-build.yml`）：推送到 `main` 或 `v*` 标签时在 `windows-latest` 上构建 NSIS x64 安装包并发布到 GitHub Releases。需要配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 密钥。

## 备注

- 当前定位为 Windows 本地桌面工具
- 用户可见文案以中文为主
- 开发阶段不保证兼容早期本地数据结构