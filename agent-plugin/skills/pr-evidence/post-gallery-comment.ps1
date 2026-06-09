#Requires -Version 5.1
<#
.SYNOPSIS
    Posts or updates a single PR comment containing the evidence gallery URL.

.DESCRIPTION
    Uses a hidden HTML marker (<!-- pr-evidence-gallery -->) to locate an
    existing comment. If found, the comment body is updated in place (PATCH).
    If not found, a new comment is posted (POST). This makes the operation
    idempotent across re-reviews — one comment per PR, always up to date.

.PARAMETER Repo
    GitHub repository in "owner/name" format, e.g. "acme/my-app".

.PARAMETER Pr
    Pull request number (integer), e.g. 42.

.PARAMETER Url
    The gallery URL to include in the comment body.

.EXAMPLE
    .\post-gallery-comment.ps1 -Repo "acme/my-app" -Pr 42 -Url "https://gallery.example.com/pr/acme/my-app/42"
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Repo,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$Pr,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Url
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Verify gh is available and authenticated
# ---------------------------------------------------------------------------
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "gh CLI not found on PATH. Install it from https://cli.github.com/ and authenticate with 'gh auth login'."
    exit 1
}

# ---------------------------------------------------------------------------
# Build the comment body
# The hidden marker makes the comment findable for future updates.
# ---------------------------------------------------------------------------
$marker = '<!-- pr-evidence-gallery -->'
$body   = "$marker`n📸 **PR evidence gallery:** $Url"

# ---------------------------------------------------------------------------
# Fetch existing comments and look for the marker
# ---------------------------------------------------------------------------
$commentsJson = gh api "repos/$Repo/issues/$Pr/comments" --paginate 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to fetch PR comments for ${Repo}#${Pr}. Is 'gh' authenticated? Run 'gh auth status' to check.`ngh output: $commentsJson"
    exit 1
}

$comments = $commentsJson | ConvertFrom-Json
$existing = $comments | Where-Object { $_.body -like "*$marker*" } | Select-Object -First 1

# ---------------------------------------------------------------------------
# Post or update
# ---------------------------------------------------------------------------
if ($null -ne $existing) {
    # Update the existing comment in place.
    gh api -X PATCH "repos/$Repo/issues/comments/$($existing.id)" -f body="$body" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to update gallery comment (comment ID $($existing.id)) for ${Repo}#${Pr}."
        exit 1
    }
    Write-Output "Updated gallery comment"
}
else {
    # Post a new comment.
    gh api -X POST "repos/$Repo/issues/$Pr/comments" -f body="$body" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to post gallery comment for ${Repo}#${Pr}."
        exit 1
    }
    Write-Output "Posted gallery comment"
}
