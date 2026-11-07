param (
    [string]$CommitMessage = "AI Agent Auto-Update: Cap nhat he thong POS va Web Hy Chay"
)

$repoPath = "D:\BaoAnhLam_AI\HyChayFood_Web"
if (-not (Test-Path $repoPath)) {
    Write-Host "[ERROR] Khong tim thay thu muc: $repoPath"
    exit 1
}

Set-Location -Path $repoPath

Write-Host "=========================================================="
Write-Host "[BUOC 1]: KIEM TRA THAY DOI MA NGUON (GIT STATUS)..."
Write-Host "=========================================================="
git status

Write-Host "`n=========================================================="
Write-Host "[BUOC 2]: TU DONG ADD VA COMMIT MA NGUON..."
Write-Host "=========================================================="
git add .

$statusOutput = git status --porcelain
if ($statusOutput) {
    git commit -m "$CommitMessage"
} else {
    Write-Host "[INFO] Ma nguon da o trang thai sach (Khong co file moi chua commit)."
}

Write-Host "`n=========================================================="
Write-Host "[BUOC 3]: DAY LEN GITHUB VA KICH HOAT VERCEL DEPLOY..."
Write-Host "=========================================================="

$pushResult = git push origin main 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`n[THANH CONG] Da day code thanh cong len GitHub! Vercel dang tu dong Deploy ban cap nhat moi len https://hychayfood.vercel.app"
} else {
    Write-Host "$pushResult"
    if ($pushResult -match "TEN_TAI_KHOAN_GITHUB|not found|fatal") {
        Write-Host "`n[CHU Y QUAN TRONG]: Remote origin hien tai la: https://github.com/TEN_TAI_KHOAN_GITHUB/TEN_REPOSITORY.git"
        Write-Host "De day truc tiep ve GitHub ca nhan cua Giam doc, vui long cap nhat remote bang lenh:"
        Write-Host "   git remote set-url origin https://github.com/<user>/<repo>.git"
    }
}
