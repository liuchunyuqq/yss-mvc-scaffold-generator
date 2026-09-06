[CmdletBinding()]
param([switch]$Check, [string]$SourceRepository)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceConfig = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'source.json') | ConvertFrom-Json
if (-not $SourceRepository) { $SourceRepository = Join-Path $repositoryRoot $sourceConfig.repositoryRoot }
$sourceRoot = [System.IO.Path]::GetFullPath($SourceRepository)
$identity = Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'yss-project.yaml')
if ($identity -notmatch '(?m)^repository_mode:\s*template-source\s*$') { throw 'MVC 源必须是 template-source' }
$exportScript = Join-Path $sourceRoot $sourceConfig.exportScript
$pluginRoot = Join-Path $repositoryRoot 'plugins/yss-mvc-scaffold-generator'
$arguments = @($exportScript, '--target', $pluginRoot)
if ($Check) { $arguments += '--check' }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "MVC 同步失败：$LASTEXITCODE" }
