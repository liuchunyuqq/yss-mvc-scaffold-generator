[CmdletBinding()]
param(
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceConfigPath = Join-Path $repositoryRoot 'source.json'
$sourceConfig = Get-Content -Raw -LiteralPath $sourceConfigPath | ConvertFrom-Json
$sourceRepository = [System.IO.Path]::GetFullPath($sourceConfig.repositoryRoot)
$sourceSkill = [System.IO.Path]::GetFullPath((Join-Path $sourceRepository $sourceConfig.skillPath))
$targetSkill = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $sourceConfig.pluginSkillPath))
$runtimeSkill = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $sourceConfig.runtimeSkillPath))

if (-not (Test-Path -LiteralPath (Join-Path $sourceRepository 'yss-project.yaml') -PathType Leaf)) {
    throw "插件源缺少 yss-project.yaml：$sourceRepository"
}

$identity = Get-Content -Raw -LiteralPath (Join-Path $sourceRepository 'yss-project.yaml')
if ($identity -notmatch '(?m)^repository_mode:\s*template-source\s*$') {
    throw "插件源不是 template-source：$sourceRepository"
}

if (-not (Test-Path -LiteralPath (Join-Path $sourceSkill 'SKILL.md') -PathType Leaf)) {
    throw "插件源 Skill 不存在：$sourceSkill"
}

$relativeFiles = Get-ChildItem -LiteralPath $sourceSkill -Recurse -File |
    ForEach-Object { [System.IO.Path]::GetRelativePath($sourceSkill, $_.FullName) } |
    Sort-Object
$targetFiles = if (Test-Path -LiteralPath $targetSkill) {
    Get-ChildItem -LiteralPath $targetSkill -Recurse -File |
        ForEach-Object { [System.IO.Path]::GetRelativePath($targetSkill, $_.FullName) } |
        Sort-Object
} else {
    @()
}

$differences = [System.Collections.Generic.List[string]]::new()
foreach ($relativeFile in $relativeFiles) {
    $sourceFile = Join-Path $sourceSkill $relativeFile
    $targetFile = Join-Path $targetSkill $relativeFile
    if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf)) {
        $differences.Add("missing: $relativeFile")
        continue
    }
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash
    $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetFile).Hash
    if ($sourceHash -ne $targetHash) {
        $differences.Add("changed: $relativeFile")
    }
}
foreach ($relativeFile in $targetFiles) {
    if ($relativeFile -notin $relativeFiles) {
        $differences.Add("obsolete: $relativeFile")
    }
}

if ($Check) {
    if ($differences.Count -gt 0) {
        $differences | ForEach-Object { Write-Error $_ }
        throw '插件 Skill 与固定源不一致。运行 scripts/sync-from-source.ps1 更新。'
    }
    foreach ($relativeFile in $relativeFiles) {
        $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sourceSkill $relativeFile)).Hash
        $runtimeFile = Join-Path $runtimeSkill $relativeFile
        if (-not (Test-Path -LiteralPath $runtimeFile -PathType Leaf) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeFile).Hash -ne $sourceHash) {
            throw "插件运行时 Skill 投影与固定源不一致：$relativeFile"
        }
    }
    Write-Output "插件 Skill 与固定源一致：$sourceSkill"
    exit 0
}

New-Item -ItemType Directory -Force -Path $targetSkill | Out-Null
foreach ($relativeFile in $relativeFiles) {
    $sourceFile = Join-Path $sourceSkill $relativeFile
    $targetFile = Join-Path $targetSkill $relativeFile
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetFile) | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
}

if (Test-Path -LiteralPath $runtimeSkill) {
    Remove-Item -LiteralPath $runtimeSkill -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtimeSkill) | Out-Null
Copy-Item -LiteralPath $targetSkill -Destination $runtimeSkill -Recurse -Force

foreach ($relativeFile in $targetFiles) {
    if ($relativeFile -notin $relativeFiles) {
        Remove-Item -LiteralPath (Join-Path $targetSkill $relativeFile) -Force
    }
}

Write-Output "已从固定源同步插件 Skill：$sourceSkill"
