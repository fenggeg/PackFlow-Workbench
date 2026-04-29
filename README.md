# 打包部署工作台

面向 Windows 的本地桌面工作台，用于管理 Maven 多模块项目的打包、产物定位、服务器环境、服务映射和部署流水线。应用基于 Tauri 2 构建，前端负责交互编排，Rust 后端负责项目解析、命令执行、SSH 部署、SQLite 持久化和 Windows 本地能力集成。

## 核心能力

- 解析 Maven 父工程和多模块结构，支持模块树选择、依赖构建和命令预览。
- 自动识别 JDK、Maven、Maven Wrapper、settings.xml、本地仓库和 Git 状态。
- 支持构建参数配置、最终命令手工编辑、实时日志、构建诊断、历史回填和常用组合。
- 聚合构建产物，支持按模块和规则筛选可部署的 jar/war/zip 等文件。
- 管理服务器连接信息，支持密码或私钥认证，密码通过 Windows DPAPI 加密保存。
- 维护项目级服务映射，服务映射按项目隔离，避免切换项目后误用其他项目的模块和部署配置。
- 配置部署模板和部署步骤，支持 SSH 命令、等待、端口检测、HTTP 检查、日志关键字检测、文件上传。
- 执行部署流水线，展示上传进度、步骤状态、健康探针结果、部署日志和部署记录。
- 支持应用内更新检查。

## 技术栈

- Tauri 2
- React 19 + TypeScript + Vite
- Ant Design
- Zustand
- Rust
- SQLite
- Windows DPAPI / Job Objects / `ssh.exe`

## 本地开发

安装依赖：

```bash
npm install
```

只启动前端开发服务：

```bash
npm run dev
```

启动完整桌面应用：

```bash
npm run tauri:dev
```

代码检查和前端构建：

```bash
npm run lint
npm run build
```

检查 Rust 后端：

```bash
cd src-tauri
cargo check
```

## 构建安装包

```bash
npm run tauri:build
```

Windows 安装包会输出到：

```text
src-tauri/target/release/bundle
```

当前配置会生成 NSIS、MSI 和更新器相关产物。

## 使用流程

1. 点击顶部当前项目，或在左侧「项目」页签中选择包含根 `pom.xml` 的 Maven 父工程。
2. 在模块树中选择目标模块，配置打包目标、Profile、自定义参数和常用开关。
3. 查看底部命令预览，必要时手工编辑最终命令。
4. 点击「开始构建」，在日志区查看实时输出和诊断结果。
5. 构建成功后，在产物页或部署中心选择可部署产物。
6. 在部署中心维护服务器、服务映射和部署模板。
7. 在「部署执行」中选择服务映射、目标服务器和产物，执行部署流水线。
8. 在「部署记录」中查看步骤、耗时、失败原因和日志，必要时重跑部署。

## 数据模型与隔离

- 项目、环境、构建历史、常用组合、服务器、服务映射和部署记录存储在 Tauri 应用数据目录下的 `app.sqlite3`。
- 构建历史最多保留最近 100 条。
- 服务映射按 `projectRoot` 归属项目，只在对应项目下展示和参与部署。
- 服务映射同时保存模块 ID、模块路径和 artifactId，用于模块匹配和展示兜底。
- 部署任务也记录 `projectRoot`，切换项目后不会继续展示上一个项目的部署状态。

## 目录说明

```text
src/
  app/                  应用外壳、导航、检查器、底部命令栏
  components/           构建、环境、部署、日志、历史等 UI 组件
  pages/                工作台页面
  services/             前端业务服务和 Tauri IPC 封装
  store/                Zustand 状态
  types/                前端领域类型

src-tauri/src/
  commands/             Tauri command 入口
  services/             Maven 解析、环境检测、进程运行、部署执行、SSH、健康检查
  repositories/         SQLite 数据访问
  models/               serde 数据模型
```

## 备注

- 当前应用定位为 Windows 本地桌面工具。
- SSH 部署依赖 Windows 可用的 `ssh.exe`。
- 用户可见文案以中文为主。
- 开发阶段不保证兼容早期本地数据结构。
