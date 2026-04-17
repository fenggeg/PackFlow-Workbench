# Maven 多模块打包桌面工具

一个面向 Windows 的本地桌面工具，用来解析 Maven 多模块项目、选择目标模块、生成可编辑的打包命令，并在界面里查看实时构建日志。

## 技术栈

- Tauri 2
- React + TypeScript + Vite
- Ant Design
- Zustand
- Rust 后端服务
- 本地 JSON 存储

## 当前 MVP 状态

- 已完成 Tauri + React 工程骨架。
- 已完成前后端 command 通信层。
- 已完成 Maven 根目录校验与多模块 POM 递归解析。
- 已完成 JDK、Maven、settings.xml、mvnw.cmd 环境识别。
- 已完成打包参数表单与命令预览。
- 已支持最终命令手工编辑。
- 已支持启动构建、停止构建、实时日志事件。
- 已支持历史记录保存与回填。
- 已支持常用模板保存、应用、删除。
- 已支持 JDK/Maven/mvnw 设置持久化。

## 本地开发

安装依赖：

```bash
npm install
```

启动前端开发页：

```bash
npm run dev
```

启动桌面应用：

```bash
npm run tauri:dev
```

## 构建 Windows 安装包

```bash
npm run tauri:build
```

产物会生成在 `src-tauri/target/release/bundle` 下。

## 数据存储

MVP 阶段使用 Tauri 应用数据目录下的 JSON 文件：

- `history.json`：构建历史，最多保留最近 100 条。
- `templates.json`：常用构建模板。
- `settings.json`：JDK/Maven/mvnw 选择。

后续可以平滑替换为 SQLite。

## 使用流程

1. 选择包含根 `pom.xml` 的 Maven 父工程目录。
2. 在左侧模块树里选择目标模块。
3. 查看环境识别结果，必要时手工指定 JDK 或 Maven。
4. 勾选打包参数，确认命令预览。
5. 按需手工编辑最终命令。
6. 点击“开始打包”，在日志区查看实时输出。
7. 使用历史记录回填命令，或保存常用模板。
