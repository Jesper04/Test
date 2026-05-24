$ErrorActionPreference='Stop'
$dlUrl='https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe'
$dest='D:\GitInstaller.exe'
Write-Output "Downloading installer to $dest"
Invoke-WebRequest -Uri $dlUrl -OutFile $dest -UseBasicParsing
Write-Output "Starting installer (may prompt for UAC)..."
Start-Process -FilePath $dest -ArgumentList '/VERYSILENT','/NORESTART','/DIR=D:\Git' -Verb RunAs -Wait
Write-Output "Installer finished. Updating user PATH."
$old=[Environment]::GetEnvironmentVariable('Path','User')
if([string]::IsNullOrEmpty($old)) { $old='' }
if($old -notlike '*D:\Git\cmd*') {
  $new = ($old.TrimEnd(';') + ';D:\Git\cmd').TrimStart(';')
  [Environment]::SetEnvironmentVariable('Path',$new,'User')
  Write-Output 'PATH updated'
} else {
  Write-Output 'PATH already contains D:\Git\cmd'
}
Write-Output 'Verifying git executable directly...'
if(Test-Path 'D:\Git\cmd\git.exe') { & 'D:\Git\cmd\git.exe' --version } else { Write-Output 'git.exe not found at D:\Git\cmd\git.exe' }
