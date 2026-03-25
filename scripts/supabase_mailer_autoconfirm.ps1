# Supabase 호스트 프로젝트: 이메일 확인 없이 가입·로그인 (mailer_autoconfirm = true)
# 준비: https://supabase.com/dashboard/account/tokens 에서 Personal Access Token 발급
# 권한: Fine-grained 토큰이면 auth_config_write 또는 project_admin_write 포함
#
# 사용 (PowerShell):
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_...."
#   .\scripts\supabase_mailer_autoconfirm.ps1 -ProjectRef "zbihunanzjgyceqfegka"
#
# 참고: https://supabase.com/docs/reference/api/v1-update-auth-service-config

param(
    [Parameter(Mandatory = $false)]
    [string] $ProjectRef = "zbihunanzjgyceqfegka",
    [string] $Token = $env:SUPABASE_ACCESS_TOKEN
)

$ErrorActionPreference = "Stop"
if (-not $Token) {
    Write-Error "SUPABASE_ACCESS_TOKEN 환경 변수를 설정하거나 Account → Access Tokens에서 PAT를 발급하세요."
    exit 1
}

$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"
$headers = @{
    Authorization  = "Bearer $Token"
    "Content-Type" = "application/json"
}
# true: 가입 시 이메일 확인 생략·암시적 확인 (대시보드의 Confirm email 끄기와 동등)
$body = '{"mailer_autoconfirm": true}'

try {
    $resp = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body
    Write-Host "OK: auth 설정이 갱신되었습니다. mailer_autoconfirm =" $resp.mailer_autoconfirm
}
catch {
    Write-Error $_
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd()
    }
    exit 1
}
