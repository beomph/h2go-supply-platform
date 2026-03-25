# Supabase 호스트 프로젝트: H2GO 회원가입에 필요한 Auth 플래그 (앱은 Email+Password signUp 한 경로만 사용)
# - external_email_enabled = true → Email 제공자 사용 (끄면 클라이언트 signUp 과 충돌)
# - disable_signup = false  → "Email signups are disabled" 오류 방지
# - mailer_autoconfirm = true → 확인 메일 없이 가입·로그인 (@h2go.local)
#
# 준비: https://supabase.com/dashboard/account/tokens (PAT)
# 권한: Fine-grained 토큰은 auth_config_write 또는 project_admin_write 포함
#
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
$body = '{"external_email_enabled": true, "disable_signup": false, "mailer_autoconfirm": true}'

try {
    $resp = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body
    Write-Host "OK: external_email_enabled =" $resp.external_email_enabled "; disable_signup =" $resp.disable_signup "; mailer_autoconfirm =" $resp.mailer_autoconfirm
}
catch {
    Write-Error $_
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd()
    }
    exit 1
}
