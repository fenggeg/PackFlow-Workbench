# PackFlow Workbench

面向 Windows 的 Maven 多模块项目构建、部署与服务器运维桌面工具。基于 Tauri 2 构建，React 前端负责交互编排，Rust 后端负责项目解析、命令执行、SSH 传输、SQLite 持久化和 Windows 本地能力集成。

## 功能概览

### 构建中心

- 解析 Maven 父工程和多模块结构，支持模块树选择、依赖构建和命令预览
- 自动识别 JDK、Maven、Maven Wrapper、settings.xml、本地仓库和 Git 状态
- 支持构建参数配置（goals/profiles/properties）、最终命令手工编辑、实时日志、构建诊断、历史回填和常用组合
- 构建失败自动诊断，基于规则引擎分析原因并给出修复建议

### 产物管理

- 聚合构建产物，支持按模块和规则筛选可部署的 jar/war/zip 等文件
- 支持打开文件夹、复制路径、删除产物（可选仅删记录）、一键部署

### 命令调度中心

- 配置命令模板和步骤链，支持 SSH 命令执行、文件上传、等待等步骤类型
- 模板变量支持文本输入和下拉选择，变量来源可配置为构建产物
- 执行时展示上传进度、步骤状态和实时日志
- 后台命令（如 `tail -f`）支持断开日志连接，命令在服务器端继续运行

### 服务器管理

- 管理服务器连接信息，支持密码或私钥认证，密码通过 Windows DPAPI 加密保存
- 服务器分组、标签、收藏路径管理
- 远程终端（xterm.js + SSH PTY）
- 远程文件浏览、上传下载、创建目录、删除和重命名
- 远程日志实时查看，支持搜索过滤和停止
- 常用命令快捷执行

### 服务运维

- 维护服务运行时配置（重启/停止/启动命令、健康检查、日志路径）
- 一键重启服务，支持重启后自动健康检查
- 远程日志实时流，支持关键字过滤和自动滚动

### 其他

- 首页仪表盘：展示环境状态、运行中任务、服务器快捷入口
- 统一历史管理：构建记录和部署记录统一查看，支持重跑和删除
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
| 终端 | xterm.js |
| 后端 | Rust |
| 数据库 | SQLite（rusqlite bundled） |
| SSH | ssh-rs + ssh2 双引擎 |
| 安全 | Windows DPAPI |
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
  app/                    应用外壳（Header、ActivityBar、Sidebar、MainWorkspace、InspectorDrawer）
  pages/                  页面（Dashboard、Build、Artifacts、Deployment、Servers、History）
  components/             UI 组件
    BuildCenter/          构建选项、下一步操作
    BuildLogPanel/        构建日志
    CommandCenter/        命令调度（模板管理、变量编辑、执行日志、执行历史）
    ServerManagement/     服务器列表、详情页、远程终端/文件/日志/常用命令
    ModuleTree/           Maven 模块树
    GitStatus/            Git 状态卡片
    EnvPanel/             环境面板、JDK 注册表
    HistoryTable/         历史表格
    common/               通用组件（LogConsole）
  features/
    service-ops/          服务运维（运行时配置、重启、健康检查、远程日志）
  services/               前端业务逻辑和 Tauri IPC 封装
    tauri-api.ts          所有 invoke() 调用和事件监听的统一入口
  store/                  Zustand 状态管理
  types/                  前端领域类型

src-tauri/src/
  commands/               Tauri command 入口（13 个模块，约 60 个命令）
  services/               Rust 业务逻辑
    pom_parser            POM 解析
    env_detector          环境检测
    jdk_scanner           JDK 扫描
    command_builder       Maven 命令构建
    process_runner        构建进程管理
    command_runner        命令执行器
    ssh_transport_service SSH 传输（连接池、SFTP、远程命令）
    terminal_session      远程终端会话
    remote_log_session    远程日志会话
    service_operation     服务操作执行器
    secure_storage        DPAPI 安全存储
    dependency_graph      模块依赖图分析
  repositories/           SQLite 数据访问（9 个模块）
  models/                 serde 数据模型（13 个模块）
  error.rs                AppResult<T> = Result<T, String>
  lib.rs                  Tauri 应用构建与命令注册
```

## 数据与隔离

- 所有数据存储在 Tauri 应用数据目录下的 `app.sqlite3`
- 服务映射按 `projectRoot` 归属项目，切换项目后不会展示其他项目的配置
- 服务器密码通过 Windows DPAPI 加密保存，不以明文存储
- 构建历史最多保留最近 100 条

## CI/CD

GitHub Actions（`tauri-build.yml`）：推送到 `main` 或 `v*` 标签时在 `windows-latest` 上构建 NSIS x64 安装包并发布到 GitHub Releases。需要配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 密钥。

## 备注

- 当前定位为 Windows 本地桌面工具
- SSH 连接使用 ssh-rs 和 ssh2 双引擎，不依赖系统 `ssh.exe`
- 用户可见文案以中文为主
- 开发阶段不保证兼容早期本地数据结构
