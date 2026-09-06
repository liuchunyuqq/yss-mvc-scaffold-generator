# YSS MVC Scaffold Generator

这是一个可从 GitHub marketplace 安装的 Codex 插件仓库，用于初始化 YSS Java 8 数据分析项目。

## 安装

```bash
codex plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator --ref main
codex plugin add yss-mvc-scaffold-generator@personal
```

## 使用

安装后在 Codex 中说：

```text
使用 yss-mvc-scaffold-generator，在 C:\projects\sales-analysis 初始化项目。
项目名为 sales-analysis，基础包为 com.yss.dataanalysis.sales，数据库使用 oracle，并启用 Mock。
```

插件会先执行 dry-run；确认参数和空目标目录后再正式生成。生成器不会覆盖或删除非空目录，不会写入真实凭据，也不会自动创建 commit 或 remote。初始化不执行 Maven 或下载依赖，settings 缺失时仍会完整生成，依赖解析延后到后续验证。

## 插件源与更新

插件中的 `yss-mvc-scaffold-generator` Skill 以
`../yss-spec-project-template/.agents/skills/yss-mvc-scaffold-generator`
为唯一初始化和更新来源，来源合同记录在 `source.json`。

更新插件前运行：

```powershell
.\scripts\sync-from-source.ps1
.\scripts\sync-from-source.ps1 -Check
```

同步脚本会先确认源仓库为 `template-source`，再复制 canonical Skill，并在 `-Check` 模式下按 SHA-256 校验文件集合和内容。不要直接维护插件内的 Skill 副本。

## 恢复已克隆 MVC 项目的环境

安装同一团队发行版本后，使用本插件要求“为 D:\work\analysis-service 恢复相邻 skillUtils”。插件执行 `scripts/restore_environment.mjs --project-root <项目根> --dry-run`，再执行恢复。已有非空业务目录受支持；Java、POM、Git 和业务治理资产不重新初始化。

skillUtils 按 MVC 专属清单选择有效 skills 并重新生成平台投影；基座 DDD skills 不被修改。`--check` 为只读比较，版本变化须显式 `--upgrade`，本地内容漂移不能覆盖。旧项目缺少 MVC 身份或工具包缺少完整性基线时返回迁移需求。文件就绪不代表目标 Agent 已实际发现技能。

维护时先改基座 MVC skill，再运行同步脚本。默认基座为相邻目录，可用 `-SourceRepository` 指定位置。同步范围由基座 MVC 的 `references/plugin-inputs.json` 与环境清单共同决定；`mvc-source-manifest.json` 记录源 commit 和实际分发文件哈希。该 commit 只标识基线，具体同步内容以文件哈希为准，可能包含尚未提交的维护修改。
