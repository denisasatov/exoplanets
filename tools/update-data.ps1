# ============================================================
#  Обновление данных экзопланет из NASA Exoplanet Archive
#  Источник: TAP-сервис https://exoplanetarchive.ipac.caltech.edu/TAP
#  Таблица: pscomppars (подтверждённые планеты, сводные параметры)
#
#  Запуск:  powershell -ExecutionPolicy Bypass -File tools\update-data.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot          # корень проекта
$dataDir = Join-Path $root "data"
$jsDir = Join-Path $root "js"
New-Item -ItemType Directory -Force -Path $dataDir, $jsDir | Out-Null

$columns = "pl_name,hostname,sy_dist,ra,dec,pl_orbsmax,pl_orbper,pl_rade," +
           "pl_bmasse,pl_bmassj,pl_eqt,pl_insol,pl_dens,disc_year,discoverymethod," +
           "disc_facility,st_teff,st_mass,st_rad,st_spectype,st_age,sy_snum,sy_pnum," +
           "sy_vmag,pl_controv_flag"

$query  = "select $columns from pscomppars"
$enc    = [uri]::EscapeDataString($query)
$url    = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=$enc&format=csv"

Write-Host "Запрос данных к NASA Exoplanet Archive..."
$csvPath = Join-Path $dataDir "planets_raw.csv"
Invoke-WebRequest -Uri $url -OutFile $csvPath

$csv  = Import-Csv $csvPath
$ic   = [Globalization.CultureInfo]::InvariantCulture

function Num([string]$s, [int]$dec = 4) {
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    $d = 0.0
    if ([double]::TryParse($s, [Globalization.NumberStyles]::Float, $ic, [ref]$d)) {
        return [Math]::Round($d, $dec)
    }
    return $null
}

$noDist = 0
$list = foreach ($row in $csv) {
    $d = Num $row.sy_dist 3
    if ($null -eq $d) { $noDist++ }

    $o = [ordered]@{ n = $row.pl_name; h = $row.hostname }
    if ($null -ne $d) { $o.d = $d }              # расстояние, пк
    $o.ra = Num $row.ra 5                        # прямое восхождение, град
    $o.dec = Num $row.dec 5                      # склонение, град

    # числовые параметры (планета + звезда)
    $map = [ordered]@{
        a   = 'pl_orbsmax'   # большая полуось, а.е.
        p   = 'pl_orbper'    # период, дней
        r   = 'pl_rade'      # радиус, R⊕
        m   = 'pl_bmasse'    # масса, M⊕
        mj  = 'pl_bmassj'    # масса, M♃
        teq = 'pl_eqt'       # температура равновесия, K
        ins = 'pl_insol'     # инсоляция, S⊕
        den = 'pl_dens'      # плотность, г/см³
        t   = 'st_teff'      # Teff звезды, K
        sm  = 'st_mass'      # масса звезды, M☉
        sr  = 'st_rad'       # радиус звезды, R☉
        age = 'st_age'       # возраст звезды, Гyr
        v   = 'sy_vmag'      # видимая звёздная величина
    }
    foreach ($k in $map.Keys) {
        $val = Num $row.($map[$k]) 4
        if ($null -ne $val) { $o[$k] = $val }
    }

    if ($row.disc_year)       { $o.y  = [int]$row.disc_year }
    if ($row.discoverymethod) { $o.me = $row.discoverymethod }
    if ($row.disc_facility)   { $o.f  = $row.disc_facility }
    if ($row.st_spectype)     { $o.sp = $row.st_spectype }
    $o.ns = [int]$row.sy_snum     # звёзд в системе
    $o.np = [int]$row.sy_pnum     # планет в системе
    if ($row.pl_controv_flag -eq '1') { $o.c = 1 }   # спорный статус
    $o
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$jsonPath  = Join-Path $dataDir "planets.json"
$json      = $list | ConvertTo-Json -Compress -Depth 3
[System.IO.File]::WriteAllText($jsonPath, $json, $utf8NoBom)

# --- JavaScript-обёртка (нужна, чтобы страница работала прямо с file://) ---
$date  = Get-Date -Format "yyyy-MM-dd"
$js    = "// Сгенерировано tools\update-data.ps1 — не редактировать вручную." +
         "`r`n// Источник: NASA Exoplanet Archive (TAP, таблица pscomppars), $date`r`n" +
         "window.PLANETS_UPDATED = `"$date`";`r`n" +
         "window.PLANETS = $json;`r`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "data.js"), $js, $utf8NoBom)

Remove-Item $csvPath -Force   # промежуточный CSV больше не нужен

Write-Host ""
Write-Host "Планет:      $($list.Count)"
Write-Host "Без расст.:  $noDist  (на карте не отображаются)"
Write-Host "planets.json $([Math]::Round((Get-Item $jsonPath).Length/1KB)) КБ"
Write-Host "js\data.js   $([Math]::Round((Get-Item (Join-Path $jsDir 'data.js')).Length/1KB)) КБ"
Write-Host "Готово."
