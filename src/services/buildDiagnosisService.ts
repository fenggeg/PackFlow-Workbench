import type {BuildDiagnosis, BuildDiagnosisCategory, BuildEnvironment, BuildLogEvent,} from '../types/domain'
import {parseBuildLogs} from './logParserService'

interface DiagnosisRule {
  category: BuildDiagnosisCategory
  /**
   * 规则权重。多条规则同时命中时取权重最高者，
   * 而不是「数组里排在前面的那个」—— 越具体的失败原因权重越高，
   * 避免出现「日志里出现过 settings 字样就判定 settings.xml 缺失」这类误判。
   */
  weight: number
  matches: (text: string, environment?: BuildEnvironment) => boolean
  summary: string
  causes: string[]
  actions: string[]
}

const rules: DiagnosisRule[] = [
  {
    category: 'jre_no_compiler',
    weight: 100,
    matches: (text) =>
      /No compiler is provided in this environment|Perhaps you are running on a JRE|Unable to locate the Javac Compiler|Cannot find javac|javac.*not found/i.test(text),
    summary: '当前 Java 环境只有 JRE，没有编译器，无法编译源码。',
    causes: ['JAVA_HOME 指向了 JRE 目录（没有 bin/javac.exe）。', 'JDK 注册表中登记了 JRE 路径。'],
    actions: ['在环境中心把 JDK 切换为带 javac.exe 的 JDK 目录。', '检查 JAVA_HOME 是否指向 JDK 而非 JRE。', '重新扫描 JDK，JRE 目录会被自动剔除。'],
  },
  {
    category: 'compilation_error',
    weight: 95,
    matches: (text) =>
      /COMPILATION ERROR|cannot find symbol|找不到符号|符号查找失败|程序包\s*\S+\s*不存在|package\s+[\w.]+\s+does not exist|incompatible types|不兼容的类型|does not override abstract method|is not abstract and does not override/i.test(text),
    summary: '源码编译失败。',
    causes: ['代码引用了不存在的类、方法或变量。', '依赖版本升级后 API 不兼容。', '模块之间没有正确声明依赖。'],
    actions: ['查看日志中 [ERROR] 标注的文件与行号，定位首个编译错误。', '确认被引用的类在依赖模块中已 install 到本地仓库。', '如果是依赖变更导致，先构建上游模块。'],
  },
  {
    category: 'out_of_memory',
    weight: 94,
    matches: (text) =>
      /OutOfMemoryError|Java heap space|GC overhead limit exceeded|Metaspace|There is insufficient memory|PermGen space/i.test(text),
    summary: '构建过程中 JVM 内存不足。',
    causes: ['MAVEN_OPTS 或 -Xmx 设置过小。', '项目模块多、并行构建（-T）占用内存过高。', '机器可用内存不足。'],
    actions: ['增大 MAVEN_OPTS，例如 -Xmx2g。', '降低并行构建线程数或关闭 -T。', '关闭其他占用内存的程序后重试。'],
  },
  {
    category: 'jdk_mismatch',
    weight: 92,
    matches: (text, environment) =>
      /invalid target release|release version .* not supported|UnsupportedClassVersionError|source release .* requires target release|invalid source release/i.test(text)
      || Boolean(environment?.javaVersion && /1\.8|8/.test(environment.javaVersion) && /release version 1[17]|--release 1[17]/i.test(text)),
    summary: 'JDK 版本与项目编译要求不匹配。',
    causes: ['当前 JAVA_HOME 指向的 JDK 版本过低或过高。', '项目 pom.xml 的 maven-compiler-plugin 配置与本机 JDK 不一致。'],
    actions: ['检查 JAVA_HOME。', '在环境中心手动切换 JDK。', '核对 pom.xml 中的 source/target/release 配置。'],
  },
  {
    category: 'maven_missing',
    weight: 90,
    matches: (text, environment) =>
      /'mvn' is not recognized|mvn\.cmd.*not recognized|系统找不到指定的文件|The system cannot find the file specified/i.test(text)
      || Boolean(environment?.mavenSource === 'missing' && !environment.useMavenWrapper),
    summary: '未找到可用的 Maven 执行器。',
    causes: ['Maven 未安装或未加入 PATH。', '手动指定的 Maven 路径不可执行。'],
    actions: ['检查 Maven 路径。', '在环境中心手动选择 mvn.cmd 或 Maven 目录。', '如果项目有 mvnw.cmd，可切换到 Maven Wrapper。'],
  },
  {
    category: 'module_invalid',
    weight: 88,
    matches: (text) =>
      /Could not find the selected project in the reactor|Child module .* does not exist|Non-readable POM|POM file .* does not exist|Malformed POM/i.test(text),
    summary: '模块路径或 pom.xml 无效。',
    causes: ['-pl 参数中的模块路径不存在。', 'pom.xml modules 配置指向了错误目录。'],
    actions: ['重新选择模块后重试。', '检查父 pom.xml 的 modules 配置。'],
  },
  {
    category: 'wrapper_issue',
    weight: 86,
    matches: (text, environment) =>
      /mvnw.*not recognized|maven-wrapper\.jar|wrapperUrl|Could not find or load main class org\.apache\.maven\.wrapper|Error downloading maven-wrapper/i.test(text)
      || Boolean(environment?.useMavenWrapper && !environment.hasMavenWrapper),
    summary: 'Maven Wrapper 不可用或文件缺失。',
    causes: ['项目缺少 mvnw.cmd 或 .mvn/wrapper 文件。', 'Wrapper 下载地址不可达。'],
    actions: ['检查项目根目录的 mvnw.cmd。', '修复 .mvn/wrapper/maven-wrapper.properties。', '临时切换为本机 Maven。'],
  },
  {
    category: 'profile_invalid',
    weight: 84,
    matches: (text) =>
      /The requested profile .* could not be activated|Profile .* does not exist|Unknown profile/i.test(text),
    summary: '指定的 Maven profile 不存在。',
    causes: ['命令中的 -P 名称拼写错误。', '目标 profile 只存在于特定 settings.xml 或父 pom 中。'],
    actions: ['检查 profile 名称是否存在。', '确认当前 settings.xml 与父 pom 已生效。'],
  },
  {
    category: 'plugin_resolution',
    weight: 82,
    matches: (text) =>
      /Plugin .* or one of its dependencies could not be resolved|Failed to resolve plugin|Plugin .* not found|Cannot access .* in offline mode|The plugin .* does not exist/i.test(text),
    summary: 'Maven 插件无法解析或下载。',
    causes: ['插件版本在本地仓库和远程仓库中都不存在。', '离线模式（-o）下缺少插件缓存。', '私服未代理该插件仓库。'],
    actions: ['检查插件的 groupId/artifactId/version 是否正确。', '关闭离线模式后重试。', '确认 settings.xml 中的 mirror 覆盖了插件仓库。'],
  },
  {
    category: 'encoding_error',
    weight: 80,
    matches: (text) =>
      /unmappable character|不可映射的字符|编码\s*\S+\s*的不可映射字符|MalformedInputException|Unicode escape.*malformed/i.test(text),
    summary: '源文件编码与编译编码不一致。',
    causes: ['源码文件编码不是项目配置的编码（常见为 UTF-8 与 GBK 混用）。', '未在 pom.xml 中声明 project.build.sourceEncoding。'],
    actions: ['把源文件统一转换为 UTF-8。', '在 pom.xml 中设置 <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>。'],
  },
  {
    category: 'dependency_download_failed',
    weight: 78,
    matches: (text) =>
      /Could not resolve dependencies|Could not find artifact|Failed to collect dependencies|Non-resolvable parent POM|checksum|will not be reattempted|The following artifacts could not be resolved/i.test(text),
    summary: '依赖解析或下载失败。',
    causes: ['依赖坐标不存在或版本写错。', '本地仓库缓存损坏（checksum 校验失败）。', '私服没有同步目标依赖。'],
    actions: ['检查依赖坐标和版本。', '删除本地仓库中对应的损坏目录后重试。', '检查 settings.xml 中的 mirror/repository 配置。'],
  },
  {
    category: 'repo_unreachable',
    weight: 76,
    matches: (text) =>
      /Connection timed out|Connection refused|Unknown host|PKIX path building failed|Received fatal alert|transfer failed|status code: 40[13]|status code: 50[023]/i.test(text),
    summary: '远程仓库或私服不可达。',
    causes: ['网络、代理或 VPN 不可用。', '私服地址、证书或账号权限异常。'],
    actions: ['检查网络或仓库地址。', '确认 settings.xml 中的私服账号与 mirror。', '如为 HTTPS 证书错误，检查 JDK 信任证书。'],
  },
  {
    category: 'settings_missing',
    weight: 70,
    matches: (text, environment) =>
      /settings\.xml.*(not found|does not exist)|The specified user settings file does not exist|Non-parseable settings|Could not read settings/i.test(text)
      || Boolean(environment?.settingsXmlSource === 'missing' && /settings\.xml/i.test(text)),
    summary: 'settings.xml 缺失或路径无效。',
    causes: ['手动指定的 settings.xml 不存在。', '私服配置不在默认 Maven 配置路径中。'],
    actions: ['检查 settings.xml 路径。', '在环境中心重新选择 settings.xml。', '确认文件中 server、mirror、profile 配置完整。'],
  },
  {
    category: 'test_failed',
    weight: 68,
    matches: (text) =>
      /There are test failures|Failed tests:|Tests run: .* Failures: [1-9]|Tests in error:|There were failing tests/i.test(text),
    summary: '单元测试失败导致构建中断。',
    causes: ['测试用例断言失败。', '测试环境依赖缺失。'],
    actions: ['查看 surefire-reports 中的失败详情。', '修复测试或临时启用跳过测试后重试。'],
  },
]

/** 按权重选出最可能的原因：命中的规则里权重最高者胜出 */
const pickRule = (text: string, environment?: BuildEnvironment) =>
  rules
    .filter((rule) => rule.matches(text, environment))
    .sort((left, right) => right.weight - left.weight)[0]

export function diagnoseBuildFailure(
  taskId: string,
  logs: BuildLogEvent[],
  environment?: BuildEnvironment,
): BuildDiagnosis {
  const parsed = parseBuildLogs(logs)
  const text = logs.map((event) => event.line).join('\n')
  const rule = pickRule(text, environment)
  const category = rule?.category ?? 'unknown'
  const moduleSuffix = parsed.moduleName ? `（模块：${parsed.moduleName}）` : ''

  return {
    id: crypto.randomUUID(),
    taskId,
    category,
    summary: rule?.summary ?? `构建失败，首个关键错误：${parsed.firstCriticalLine ?? '未提取到明确错误行。'}${moduleSuffix}`,
    possibleCauses: rule?.causes ?? ['日志中没有匹配到已知规则。', '可能是插件、脚本或外部命令返回了非零退出码。'],
    suggestedActions: rule?.actions ?? ['查看首个 [ERROR] 附近的上下文。', '复制诊断结果并结合完整日志进一步排查。'],
    keywordLines: parsed.keywordLines.length > 0
      ? parsed.keywordLines
      : logs.slice(-8).map((event) => event.line),
  }
}
