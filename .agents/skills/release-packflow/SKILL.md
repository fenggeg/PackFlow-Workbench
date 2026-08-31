---
name: release-packflow
description: >
  PackFlow Workbench（Tauri 桌面应用）专用发版技能。当用户说"发布"、"release"、"发版"、"发布新版本"、"出一个新版本"时触发。
  完整流程：检查未提交文件 → 提交 → 读取最近 tag → 确定新版本号 → 生成 CHANGELOG 小节 →
  同步更新 package.json 与 src-tauri/tauri.conf.json → 提交并打 v* tag → 推送远端触发 GitHub Actions 构建。
  推送 v* tag 后，CI（.github/workflows/tauri-build.yml）自动构建 NSIS x64 安装包、发布 GitHub Release、
  更新 latest.json 供应用内 updater 拉取。支持指定版本号或自动顺延。
---

# Release Skill（PackFlow Workbench 专用）

自动化发布 PackFlow Workbench 新版本。PackFlow Workbench 是 Tauri 2 桌面应用（React 19 + Rust），Windows-only，产物为 NSIS x64 安装包，通过 GitHub Actions 构建。

## CI 触发方式（必须了解）

发版 CI 定义在 `.github/workflows/tauri-build.yml`，触发条件：

- **`push` 到 `main` 分支** → 自动构建，但产物为**草稿/预发布**（tag 名 `windows-auto-build`），不是正式发版。
- **`push` `v*` 标签** → **正式发版**：发布正式 GitHub Release，读取 `CHANGELOG.md` 对应版本小节作为 release notes，并更新 `latest.json` 供应用内 updater 使用。
- `workflow_dispatch` → 手动触发。

**关键约束：**

1. **正式发版只靠推送 `v*` tag 触发**。本仓库默认分支是 `master`，而 CI 监听的分支 push 是 `main`，因此 push 到 `master` 不会触发正式发版 CI；只有推 `v*` tag 才会。
2. **CHANGELOG.md 必须有对应版本小节**，否则 CI 构建失败（`tauri-build.yml` 中 `Write-Error "Missing CHANGELOG.md section for version ..."`）。小节标题格式：`## [版本号] - YYYY-MM-DD`。
3. **版本号必须同步** `package.json` 的 `version` 和 `src-tauri/tauri.conf.json` 的 `version`，且与 tag 一致（tag 为 `v` + 版本号）。
4. CI 需要 secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（用于 updater 签名）。
5. 产物命名：`PackFlow Workbench_x64-setup.exe`，输出到 `release-dist/` 并上传到 GitHub Release。

## 触发条件

用户输入包含以下关键词时触发：发布、release、发版、发布新版本、出一个新版本。

用户可能附带版本号，例如"发布 3.1.0"或"release v3.1.0"，也可能不附带。

## 执行流程

严格按以下顺序执行，每一步完成后再进入下一步。

### 第 1 步：检查未提交文件

```bash
git status --short
```

- 如果有未提交的文件（包括本次会话修改的文件），先全部提交。
- 提交信息格式：`feat: <简短描述>` 或 `fix: <简短描述>`，根据实际改动判断。
- 如果改动较多，用 `feat: <主要功能概括>` 作为提交信息。
- 如果没有未提交文件，跳过此步。

### 第 2 步：获取最近一个 tag 和当前版本

```bash
git tag --sort=-v:refname | Select-Object -First 1
```

- 记录最近的 tag（例如 `v3.1.0`）。
- 提取版本号部分（`3.1.0`）。

同时读取 `package.json` 的 `version` 字段和 `src-tauri/tauri.conf.json` 的 `version` 字段确认当前版本（两者应一致）。

### 第 3 步：确定新版本号

**规则：**

- 如果用户指定了版本号（例如"发布 3.1.0"），直接使用用户指定的版本号。
- 如果用户没有指定版本号，默认 **patch +1**（例如 3.1.0 → 3.1.1）。
- 特殊情况才升级 minor 或 major：
  - **minor +1**：本次发布以一个完整的大型新功能为主题（例如新增了整个模块、全新架构重构），不是零散的小改进混合。
  - **major +1**：有破坏性变更（API 不兼容、数据格式迁移等）。
- 判断依据是发布内容的整体性质，而不是单个 commit 的 Conventional Commits 前缀。一次发布通常包含 feat、fix、优化等多种类型，此时默认 patch 升级。

版本号格式：`X.Y.Z`（不含 `v` 前缀）。

### 第 4 步：生成更新日志

```bash
git log <最近tag>..HEAD --oneline
```

分析提交记录，生成面向用户的更新日志。

**重要规则：**
- 不要写代码级别的内容（不要提变量名、函数名、文件名、CSS 类名等）。
- 只写用户能感知到的功能变化、界面改进、问题修复。
- 分类为：新增、优化、修复（没有的分类不要写）。
- 每条用一句话描述，格式：`- **功能名**：描述。`
- 参考 `CHANGELOG.md` 已有条目的风格。

生成的内容格式：

```markdown
## [<版本号>] - <YYYY-MM-DD>

### 新增

- **功能名**：描述。

### 优化

- **功能名**：描述。

### 修复

- **功能名**：描述。
```

将新版本的更新日志插入到 `CHANGELOG.md` 文件的头部（在 `# 更新日志` 标题和说明文字之后，第一个 `## [` 之前）。

**⚠ 这一步必须完成且格式正确**：CI 推 `v*` tag 时会校验 `CHANGELOG.md` 是否存在 `## [版本号]` 小节，缺失会导致构建失败。

### 第 5 步：更新版本号

需要同步更新两个文件中的版本号（保持一致）：

1. **`package.json`** — `version` 字段
2. **`src-tauri/tauri.conf.json`** — `version` 字段

用 Edit 工具精确替换版本号字符串。两个文件的版本号必须完全相同，且与即将打的 tag 一致。

### 第 6 步：提交版本更新并打 tag

```bash
git add package.json src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "release: v<版本号> - <一句话概括本次更新>"
git tag v<版本号>
```

### 第 7 步：推送到远端

```bash
git push origin master
git push origin v<版本号>
```

**注意：**
- `git push origin master` 推送提交，但**不会触发正式发版 CI**（CI 监听的是 `main` 分支，本仓库默认分支是 `master`）。
- `git push origin v<版本号>` 推送 tag，**这才是触发正式发版 CI 的动作**。GitHub Actions 监听 `v*` 标签，自动构建 NSIS x64 安装包、发布 GitHub Release、更新 `latest.json`。

### 第 8 步：确认

向用户报告：
- 新版本号
- 更新日志摘要
- CI/CD 已由 `v*` tag 推送触发，可到 GitHub Actions 页面查看构建进度
- 构建完成后，用户可通过应用内"检查更新"获取新版本（updater 从 GitHub Release 的 `latest.json` 拉取）

## 示例

**用户输入：** `发布新版本`

**执行：**
1. 检查 git status，有改动则提交
2. 最近 tag: `v3.1.0`，当前版本: `3.1.0`
3. 分析提交记录，默认 patch +1 → 新版本 `3.1.1`
4. 生成 changelog 插入到 CHANGELOG.md（必须有 `## [3.1.1] - <日期>` 小节）
5. 更新 package.json 和 tauri.conf.json 版本号为 `3.1.1`
6. 提交、打 tag `v3.1.1`
7. 推送 master 和 tag `v3.1.1`（tag 触发正式发版 CI）

**用户输入：** `发布 3.2.0`

**执行：**
- 同上，但版本号直接使用 `3.2.0`，跳过自动推断。
