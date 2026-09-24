$desktop = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$shortcutPath = Join-Path $desktop "AgentC.lnk"
$targetExe = "d:\PROJETOS\agentc\AgentC.exe"
$workingDir = "d:\PROJETOS\agentc"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $workingDir
$shortcut.Description = "Iniciar AgentC (Frontend + Backend)"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$shortcut.Save()

Write-Host "Atalho criado com sucesso em: $shortcutPath"
