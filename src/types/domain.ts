export type BuildStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'

export type PersistedBuildStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED'

export interface MavenProject {
  rootPath: string
  rootPomPath: string
  groupId?: string
  artifactId: string
  version?: string
  packaging?: string
  modules: MavenModule[]
  jdkRequirement?: JdkRequirement
}

export interface MavenModule {
  id: string
  name?: string
  artifactId: string
  groupId?: string
  version?: string
  packaging?: string
  relativePath: string
  pomPath: string
  children?: MavenModule[]
  errorMessage?: string
}

export interface ModuleDependencyEdge {
  fromModuleId: string
  toModuleId: string
  type: 'compile' | 'test' | 'runtime' | 'provided' | 'parent' | 'aggregation' | string
}

export interface ModuleDependencySummary {
  moduleId: string
  packaging?: string
  dependencies: string[]
  dependents: string[]
  aggregationChildren: string[]
  aggregationParent?: string
  releaseCandidateModuleIds: string[]
  requiredBuildModuleIds: string[]
  suggestedValidationModuleIds: string[]
  relatedAggregationModuleIds: string[]
  recommendedModuleIds: string[]
  hasCycle: boolean
  cyclePaths: string[][]
}

export interface ModuleDependencyGraph {
  rootPath: string
  edges: ModuleDependencyEdge[]
  summaries: ModuleDependencySummary[]
  cycles: string[][]
}

export interface DependencyConflict {
  groupId: string
  artifactId: string
  requestedVersion: string
  selectedVersion: string
  moduleId: string
  dependencyPath: string
}

export interface ModuleConflictResult {
  moduleId: string
  artifactId: string
  conflicts: DependencyConflict[]
}

export interface DependencyConflictResult {
  rootPath: string
  modules: ModuleConflictResult[]
  hasConflicts: boolean
  /** 扫描未正常完成时的说明；有值时结果可能不完整，不能当作「没有冲突」 */
  warning?: string
}

export interface ConflictScanProgress {
  currentModule: string
  scannedModules: number
  totalModules: number
}

export interface GitBranch {
  name: string
  isCurrent: boolean
}

export interface GitRepositoryStatus {
  isGitRepo: boolean
  branch?: string
  branches: GitBranch[]
  upstream?: string
  aheadCount: number
  behindCount: number
  hasRemoteUpdates: boolean
  hasLocalChanges: boolean
  message?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
}

export interface GitPullResult {
  success: boolean
  output: string
  status: GitRepositoryStatus
}

export interface GitSwitchBranchResult {
  success: boolean
  output: string
  status: GitRepositoryStatus
}

export interface BuildEnvironment {
  javaHome?: string
  javaVersion?: string
  javaPath?: string
  javaSource: EnvironmentSource
  mavenHome?: string
  mavenVersion?: string
  mavenPath?: string
  mavenSource: EnvironmentSource
  settingsXmlPath?: string
  settingsXmlSource: EnvironmentSource
  localRepoPath?: string
  localRepoSource: EnvironmentSource
  hasMavenWrapper: boolean
  mavenWrapperPath?: string
  useMavenWrapper: boolean
  wrapperSource: EnvironmentSource
  gitPath?: string
  gitVersion?: string
  gitSource: EnvironmentSource
  status: EnvironmentStatus
  errors: string[]
  projectJdkRequirement?: JdkRequirement
  availableJdks?: JdkEntry[]
  matchedJdkId?: string
}

export type EnvironmentStatus = 'ok' | 'warning' | 'error'

export type EnvironmentSource = 'auto' | 'manual' | 'wrapper' | 'missing'

export type BuildDiagnosisCategory =
  | 'jdk_mismatch'
  | 'maven_missing'
  | 'wrapper_issue'
  | 'settings_missing'
  | 'dependency_download_failed'
  | 'repo_unreachable'
  | 'profile_invalid'
  | 'module_invalid'
  | 'test_failed'
  | 'compilation_error'
  | 'out_of_memory'
  | 'plugin_resolution'
  | 'jre_no_compiler'
  | 'encoding_error'
  | 'unknown'

export interface BuildDiagnosis {
  id: string
  taskId: string
  summary: string
  category: BuildDiagnosisCategory
  possibleCauses: string[]
  suggestedActions: string[]
  keywordLines: string[]
}

export interface BuildOptions {
  projectRoot: string
  selectedModulePath: string
  /** 始终按 Maven 生命周期顺序保存 */
  goals: string[]
  profiles: string[]
  properties: Record<string, string | boolean>
  alsoMake: boolean
  skipTests: boolean
  /** 合成后的最终附加参数：由 commonArgs / threadCount / extraArgs 派生，不要直接写入 */
  customArgs: string[]
  /** 「常用开关」预设参数 */
  commonArgs?: string[]
  /** 并行构建线程数（-T） */
  threadCount?: number
  /** 用户手写的附加参数 */
  extraArgs?: string[]
  editableCommand: string
  /**
   * 命令锁定标记：用户在「完整命令预览」中手工保存命令后为 true。
   * 为 true 时自动生成的结果不再回写 editableCommand，避免覆盖用户输入；
   * 用户点击「恢复自动生成」后解除。
   */
  commandLocked?: boolean
}

export interface BuildArtifact {
  path: string
  fileName: string
  extension: string
  sizeBytes: number
  modifiedAt?: string
  modulePath: string
}

export interface JarEntryInfo {
  name: string
  sizeBytes: number
  compressedBytes: number
  isDirectory: boolean
  /** 可文本预览的条目（配置、脚本、静态资源等） */
  isText: boolean
}

export interface JarInspection {
  path: string
  fileName: string
  fileSizeBytes: number
  entryCount: number
  fileCount: number
  entries: JarEntryInfo[]
  manifest?: string
  /** 条目数超过上限，仅返回了部分内容 */
  truncated: boolean
}

export interface JarEntryContent {
  name: string
  sizeBytes: number
  isText: boolean
  /** 超过单次读取上限，内容只包含前一段 */
  truncated: boolean
  content: string
}

export interface JarUpdateResult {
  /** 本次写入的条目名（按归档内出现顺序） */
  updatedNames: string[]
  /** 修改前的自动备份路径 */
  backupPath: string
  /** 因内容变更而移除的签名文件 */
  removedSignatures: string[]
  sizeBytes: number
}

export interface JarBackupInfo {
  path: string
  fileName: string
  sizeBytes: number
  /** 备份文件的修改时间，格式 yyyy-MM-dd HH:mm:ss */
  modifiedAt: string
}

export interface JarRestoreResult {
  /** 恢复前对当前归档新做的备份路径 */
  backupPath: string
  sizeBytes: number
}

export interface BuildCommandPayload {
  options: BuildOptions
  environment: BuildEnvironment
}

export type PreflightStatus = 'pass' | 'warn' | 'fail'

export interface PreflightCheck {
  key: string
  label: string
  status: PreflightStatus
  message: string
}

export interface PreflightResult {
  ok: boolean
  checks: PreflightCheck[]
}

export interface PreflightPayload {
  projectRoot: string
  modulePath: string
  javaHome?: string
  mavenHome?: string
  mavenPath?: string
  useMavenWrapper: boolean
  settingsXmlPath?: string
  localRepoPath?: string
}

export interface StartBuildPayload {
  projectRoot: string
  command: string
  modulePath: string
  moduleArtifactId?: string
  javaHome?: string
  mavenHome?: string
  useMavenWrapper: boolean
}

export interface BuildLogEvent {
  buildId: string
  stream: 'stdout' | 'stderr' | 'system'
  line: string
}

export interface BuildFinishedEvent {
  buildId: string
  status: PersistedBuildStatus
  durationMs: number
  /** 本次构建的日志文件路径，用于历史回看 */
  logPath?: string
}

export interface BuildHistoryRecord {
  id: string
  createdAt: string
  projectRoot: string
  modulePath: string
  moduleArtifactId?: string
  command: string
  status: PersistedBuildStatus
  durationMs: number
  javaHome?: string
  mavenHome?: string
  useMavenWrapper: boolean
  buildOptions?: BuildOptions
  artifacts?: BuildArtifact[]
  /** 构建日志文件路径，历史记录可回看完整日志 */
  logPath?: string
}

export interface BuildTemplate {
  id: string
  name: string
  projectRoot: string
  modulePath: string
  goals: string[]
  profiles: string[]
  properties: Record<string, string | boolean>
  alsoMake: boolean
  skipTests: boolean
  customArgs: string[]
  commonArgs?: string[]
  threadCount?: number
  extraArgs?: string[]
  useMavenWrapper: boolean
  javaHome?: string
  mavenHome?: string
  createdAt?: string
  updatedAt?: string
  pinned?: boolean
}

export interface EnvironmentSettings {
  activeProfileId?: string
  profiles: EnvironmentProfile[]
  lastProjectPath?: string
  projectPaths?: string[]
  /** projectPath -> profileId，项目专属环境方案绑定 */
  projectProfileBindings?: Record<string, string>
  jdkRegistry?: JdkEntry[]
  maxConcurrentBuilds?: number
}

export interface JdkEntry {
  id: string
  name: string
  path: string
  version?: string
  majorVersion?: number
  vendor?: string
  isDefault: boolean
  source: JdkSource
}

export type JdkSource = 'scan' | 'manual' | 'envVar' | 'path'

export interface JdkRequirement {
  versionSpec: string
  source: JdkRequirementSource
  resolvedMajor?: number
}

export type JdkRequirementSource =
  | 'mavenCompilerRelease'
  | 'mavenCompilerTarget'
  | 'mavenCompilerSource'
  | 'javaVersion'
  | 'mavenCompilerPlugin'
  | 'unspecified'

export interface EnvironmentProfile {
  id: string
  name: string
  javaHome?: string
  mavenHome?: string
  settingsXmlPath?: string
  localRepoPath?: string
  useMavenWrapper: boolean
  updatedAt?: string
}

export interface NetworkInfo {
  ip: string
  city?: string
  province?: string
  country?: string
  continent?: string
  isp?: string
  timeZone?: string
  isoCode?: string
  network?: string
}
