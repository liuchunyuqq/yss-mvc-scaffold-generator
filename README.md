# YSS MVC Scaffold Generator

这是一个同时兼容 Codex 与 Claude Code 的插件，用于：

- 在空目录初始化独立 Git 管理的 YSS Java 8 MVC 数据分析项目；
- 为已克隆的 MVC 项目恢复或升级相邻的 `skillUtils` 开发环境。

生成项目固定包含 `server`、`core`、`client`、`repository`、`adapter`、`feign-client` 六个 Maven 模块，支持 Oracle、OceanBase Oracle 和可选 Mock Profile。

两个平台共用同一份插件目录 `plugins/yss-mvc-scaffold-generator` 和同一个 Skill；区别只在清单文件：Codex 读取 `.agents/plugins/marketplace.json` 与 `.codex-plugin/plugin.json`，Claude Code 读取 `.claude-plugin/marketplace.json` 与 `.claude-plugin/plugin.json`。两套清单的 marketplace 名称（`personal`）、插件名、版本和描述保持一致。

## 从 GitHub 安装

### Codex

稳定版本使用 `main` 分支：

```bash
codex plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator --ref main
codex plugin add yss-mvc-scaffold-generator@personal
```

测试指定开发分支时，把 `main` 换成实际分支，例如：

```bash
codex plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator --ref codex/mvc-environment-restore
codex plugin add yss-mvc-scaffold-generator@personal
```

`personal` 是本仓库 `.agents/plugins/marketplace.json` 声明的 marketplace 名称。如果本机已有同名 marketplace 或插件来自其他 marketplace，先运行：

```bash
codex plugin marketplace list
codex plugin list
```

确认实际名称后，再将安装命令中的 `@personal` 替换为对应 marketplace 名称。不要手工修改 Codex 的 marketplace 缓存或插件安装缓存。

安装或重新安装后，请新建 Codex 任务再使用插件，以确保新 Skill 和工具被加载。

### Claude Code

在终端执行（`main` 为稳定分支）：

```bash
claude plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator
claude plugin install yss-mvc-scaffold-generator@personal
```

也可以在 Claude Code 会话内使用斜杠命令：

```text
/plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator
/plugin install yss-mvc-scaffold-generator@personal
```

测试指定开发分支时，改用带分支的 Git URL：

```bash
claude plugin marketplace add https://github.com/liuchunyuqq/yss-mvc-scaffold-generator.git#codex/mvc-environment-restore
claude plugin install yss-mvc-scaffold-generator@personal
```

`personal` 同样是 `.claude-plugin/marketplace.json` 声明的名称。如果本机已经添加过另一个同名 marketplace，先运行 `claude plugin marketplace list` 确认，必要时先 `claude plugin marketplace remove personal` 再添加。安装后新开一个 Claude Code 会话，用 `/plugin` 或直接询问“有哪些 skill”确认 `yss-mvc-scaffold-generator` 已被发现。

## 从本地源码安装

本地开发或验证未发布修改时，先克隆仓库并切换到需要测试的分支：

```powershell
git clone https://github.com/liuchunyuqq/yss-mvc-scaffold-generator.git D:\localProject\yss-mvc-scaffold-generator
git -C D:\localProject\yss-mvc-scaffold-generator switch codex/mvc-environment-restore
```

然后把仓库根注册为本地 marketplace，并安装插件：

Codex：

```powershell
codex plugin marketplace add D:\localProject\yss-mvc-scaffold-generator
codex plugin add yss-mvc-scaffold-generator@personal
```

Claude Code：

```powershell
claude plugin marketplace add D:\localProject\yss-mvc-scaffold-generator
claude plugin install yss-mvc-scaffold-generator@personal
```

Claude Code 从本地路径安装时会把插件目录复制到自己的缓存；本地修改源码后，执行 `claude plugin marketplace update personal` 再 `claude plugin update yss-mvc-scaffold-generator@personal`（或先 `uninstall` 再 `install`），并新开会话使改动生效。

本地 marketplace 只需注册一次。后续修改源码后，应先完成插件校验。若只是本地迭代、尚未发布新版本，Codex 侧使用自带的 `plugin-creator` helper 更新单一 cachebuster：

```powershell
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\read_marketplace_name.py" --marketplace-path D:\localProject\yss-mvc-scaffold-generator\.agents\plugins\marketplace.json
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py" D:\localProject\yss-mvc-scaffold-generator\plugins\yss-mvc-scaffold-generator
```

第一个命令输出经过校验的 marketplace 名称。cachebuster helper 会保留版本前缀，并把旧的 `+codex.*` 后缀替换为新的 UTC 时间戳，不会重复追加后缀。随后使用实际 marketplace 名称重新安装；本仓库默认名称为 `personal`：

```powershell
codex plugin add yss-mvc-scaffold-generator@personal
```

不要直接编辑 `.agents/plugins/marketplace.json`、`.claude-plugin/marketplace.json`、Codex/Claude 配置文件或各自插件缓存下的安装副本。若插件实际由另一个本地 marketplace 提供，使用 `codex plugin list` / `claude plugin list` 确认来源，并从该 marketplace 重新安装。

## 初始化新项目

推荐在 Codex 或 Claude Code 中明确提供目标目录、项目名、基础包、数据库类型以及是否启用 Mock：

```text
使用 yss-mvc-scaffold-generator，在 C:\projects\sales-analysis 初始化项目。
项目名为 sales-analysis，基础包为 com.yss.dataanalysis.sales，数据库使用 oracle，并启用 Mock。
```

主要参数：

| 参数 | 说明 |
|---|---|
| `project-name` | 小写连字符项目名 |
| `base-package` | 合法 Java 包名 |
| `target-dir` | 最终项目根目录，必须显式给出 |
| `database` | `oracle` 或 `oceanbase-oracle`，默认 `oracle` |
| `with-mock` | 生成 Mock Profile、执行器和 HTTP 冒烟测试 |
| `maven-settings` | 可选的外部 Maven settings 绝对路径，只用于后续验证 |

Skill 会先执行 dry-run，核对参数和目标目录后再正式生成。目标目录必须不存在或为空；插件不会覆盖非空目录，不会写入真实凭据，也不会自动创建 commit 或 remote。

初始化阶段不执行 Maven 或下载依赖。生成完成后会验证六模块结构与独立 Git 根；Maven `validate`、`test`、`package` 和 Mock HTTP 冒烟测试属于后续显式验证。如果使用外部 settings，所有 Maven 命令都要附加 `-s <settings.xml>`。

## 恢复已克隆项目的环境

项目源码已 clone，但相邻 `skillUtils` 缺失时，可以在 Codex 或 Claude Code 中说：

```text
使用 yss-mvc-scaffold-generator，为 D:\work\analysis-service 恢复相邻 skillUtils。
```

插件会先执行只读预演：

```bash
node scripts/restore_environment.mjs --project-root D:\work\analysis-service --dry-run
```

确认计划后再去掉 `--dry-run`。恢复流程支持已有非空业务目录，只写项目相邻的 `skillUtils`；不会重新生成 Java、POM、Git、业务词汇、Spec、Ticket 或项目治理资产。

恢复只接受身份可确认的 MVC `project-instance`。旧项目缺少 MVC 身份证据，或旧 `skillUtils` 没有完整性基线时，会返回 migration-required 并保留现场，不会猜测身份或覆盖未受管目录。

## 插件更新后升级既有项目

插件升级和项目环境升级是两个独立步骤。重新安装插件不会自动修改任何项目。

### 1. 更新并重新安装插件

Codex，GitHub marketplace 安装：

```bash
codex plugin marketplace upgrade personal
codex plugin remove yss-mvc-scaffold-generator
codex plugin add yss-mvc-scaffold-generator@personal
```

Codex，本地源码安装：

```powershell
git -C D:\localProject\yss-mvc-scaffold-generator pull --ff-only
codex plugin add yss-mvc-scaffold-generator@personal
```

Claude Code（GitHub 或本地源码安装相同；本地源码先 `git pull --ff-only`）：

```bash
claude plugin marketplace update personal
claude plugin update yss-mvc-scaffold-generator@personal
```

如果 marketplace 名称不是 `personal`，使用 `codex plugin list` / `claude plugin list` 确认实际来源并替换命令。完成后新建 Codex 任务或 Claude Code 会话，使更新后的插件生效。

### 2. 检查目标项目是否需要升级

在新任务中要求 Codex 或 Claude Code：

```text
使用 yss-mvc-scaffold-generator，检查 D:\work\analysis-service 的 MVC 环境是否需要升级。
```

对应的只读命令是：

```bash
node scripts/restore_environment.mjs --project-root D:\work\analysis-service --check
```

`--check` 只比较已安装环境与当前插件发行资产，不写文件。项目已经一致时无需继续。

### 3. 显式升级项目环境

确认检查结果后要求 Codex 或 Claude Code：

```text
使用 yss-mvc-scaffold-generator，升级 D:\work\analysis-service 的 MVC skillUtils 环境。
```

对应命令是：

```bash
node scripts/restore_environment.mjs --project-root D:\work\analysis-service --upgrade
```

升级会通过 staging 写入，并保留旧目录备份。若发现本地内容漂移、身份不明确或完整性基线缺失，流程会停止并保留原目录。

`--upgrade` 只更新相邻 `skillUtils` 及其平台投影，不更新项目中的 Java、POM、Spec、Ticket 或治理文档，也不会重新运行项目初始化。若新插件版本改变了生成工程结构，需要按发行说明单独制定项目迁移方案，不能靠重新执行脚手架覆盖已有项目。

升级完成后，应在目标项目中执行其登记的验证命令，并再次新建 Codex 任务或 Claude Code 会话，确认项目实际发现了更新后的 Skills。`FILES_READY` 只证明文件已就绪，不等于 Agent 已加载，也不等于项目通过业务或发布门禁。

## 插件维护与发布

插件内的 `yss-mvc-scaffold-generator` Skill 不是独立维护源。其唯一来源由根目录 `source.json` 声明，默认指向相邻的 `../yss-spec-project-template/.agents/skills/yss-mvc-scaffold-generator`。

先在模板源维护 canonical Skill，然后在本仓库根执行：

```powershell
.\scripts\sync-from-source.ps1
.\scripts\sync-from-source.ps1 -Check
```

也可以显式指定模板源：

```powershell
.\scripts\sync-from-source.ps1 -SourceRepository D:\localProject\yss-spec-project-template
```

同步脚本会验证源仓库是 `template-source`，并按照 `references/plugin-inputs.json` 与 MVC 环境清单生成插件分发副本。`mvc-source-manifest.json` 记录源 commit 和实际文件 SHA-256；源 commit 只标识基线，实际同步内容以文件哈希为准。

同步后至少运行：

```bash
node scripts/verify-plugin-manifests.mjs
node --test plugins/yss-mvc-scaffold-generator/skills/yss-mvc-scaffold-generator/scripts/generate_project.test.mjs plugins/yss-mvc-scaffold-generator/skills/yss-mvc-scaffold-generator/scripts/restore_environment.test.mjs
node plugins/yss-mvc-scaffold-generator/skills/yss-mvc-scaffold-generator/scripts/verify_plugin_integration.mjs plugins/yss-mvc-scaffold-generator
```

`verify-plugin-manifests.mjs` 校验 Codex 与 Claude Code 两套 marketplace.json / plugin.json 的名称、版本（忽略 `+codex.*` 后缀）、描述、作者、skills 路径一致，并确认 `skills/yss-mvc-scaffold-generator/SKILL.md` 存在且 frontmatter 合法；任一不一致即以非零退出。

发布时同步更新 `plugins/yss-mvc-scaffold-generator/.codex-plugin/plugin.json` 与 `plugins/yss-mvc-scaffold-generator/.claude-plugin/plugin.json` 的版本（两者必须一致；Codex 本地迭代追加的 `+codex.*` 后缀除外），完成仓库要求的验证后再提交和推送。不要直接维护插件内 `.agents/skills` 或 `skills` 的生成副本。

两份 plugin.json 由本仓库直接维护，不属于 `sync-from-source.ps1` 的同步范围。Claude Code 只读取 `skills/` 目录下的 Skill，`.agents/skills` 只是随插件分发、用于恢复项目 `skillUtils` 的资产，两个平台在这一点上行为一致。
