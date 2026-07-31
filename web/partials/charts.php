<?php
/**
 * Admin dashboard charts, rendered with ApexCharts (vendored locally at
 * web/vendor/apexcharts.min.js - no CDN, same convention as pdf.min.js).
 * Each function returns a <div> placeholder + its own <script> that builds
 * the chart once ApexCharts has loaded; admin/index.php includes the
 * vendor script once, after all of these have been echoed.
 *
 * Pure rendering only - callers pass already-computed PHP arrays. Options
 * objects are plain PHP arrays, JSON-encoded straight through (no raw JS
 * embedded) - ApexCharts' own defaults (sum-of-series donut center,
 * value+series-name tooltips) already cover what a formatter would add,
 * so there's nothing here that needs splicing a function into the JSON.
 * Status colors reuse the app's own reserved palette (--ok/--fail/--warn
 * in styles.css) rather than a fresh categorical scheme.
 */

/** JSON-encode for safe inline embedding inside a <script> tag. */
function chart_json($data): string
{
    return json_encode($data, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
}

/** Shared container + ApexCharts init script for every chart below. */
function chart_container(string $id, array $opts): string
{
    return '<div id="' . e($id) . '" class="chart-box"></div>' .
        '<script>(function(){var el=document.getElementById(' . chart_json($id) . ');if(!el||typeof ApexCharts===\'undefined\')return;' .
        'new ApexCharts(el,' . chart_json($opts) . ').render();})();</script>';
}

/**
 * Donut chart for a small part-to-whole breakdown (status counts), with
 * the total shown in the center (ApexCharts' own sum-of-series default)
 * and an always-visible legend (never color-alone identification).
 * @param array $segments [['label'=>string,'value'=>int,'color'=>'#hex'], ...]
 */
function chart_donut(array $segments, string $id = 'chart-donut'): string
{
    $opts = [
        'chart' => ['type' => 'donut', 'height' => 260, 'fontFamily' => 'inherit'],
        'series' => array_map('intval', array_column($segments, 'value')),
        'labels' => array_column($segments, 'label'),
        'colors' => array_column($segments, 'color'),
        'legend' => ['position' => 'right', 'fontSize' => '13px', 'markers' => ['width' => 10, 'height' => 10]],
        'dataLabels' => ['enabled' => false],
        'stroke' => ['width' => 2, 'colors' => ['#fff']],
        'fill' => ['type' => 'gradient', 'gradient' => ['shade' => 'light', 'shadeIntensity' => 0.35, 'type' => 'diagonal1']],
        'plotOptions' => ['pie' => ['donut' => ['size' => '68%', 'labels' => [
            'show' => true,
            'total' => ['show' => true, 'label' => 'Total', 'fontSize' => '12px', 'color' => '#64748B'],
            'value' => ['fontSize' => '22px', 'fontWeight' => 800, 'color' => '#16324F'],
        ]]]],
    ];
    return chart_container($id, $opts);
}

/**
 * Horizontal stacked bar - one bar per entity (e.g. checker), split into
 * named series (approved/rejected) so the total and the split both read
 * directly off the chart.
 * @param array $rows [['label'=>string, 'approved'=>int, 'rejected'=>int], ...]
 */
function chart_checker_bar(array $rows, string $id = 'chart-checker'): string
{
    if (!$rows) return '<p class="sub" style="margin:0">No decided cases yet.</p>';
    $opts = [
        'chart' => ['type' => 'bar', 'height' => max(180, count($rows) * 56), 'stacked' => true, 'toolbar' => ['show' => false], 'fontFamily' => 'inherit'],
        'series' => [
            ['name' => 'Approved', 'data' => array_map('intval', array_column($rows, 'approved'))],
            ['name' => 'Rejected', 'data' => array_map('intval', array_column($rows, 'rejected'))],
        ],
        'colors' => ['#1B7A46', '#B3261E'],
        'plotOptions' => ['bar' => ['horizontal' => true, 'barHeight' => '55%', 'borderRadius' => 4, 'borderRadiusApplication' => 'end']],
        'xaxis' => ['categories' => array_column($rows, 'label'), 'labels' => ['style' => ['fontSize' => '11px']]],
        'legend' => ['position' => 'top', 'horizontalAlign' => 'left', 'fontSize' => '12px'],
        'dataLabels' => ['enabled' => true, 'style' => ['fontSize' => '11px', 'fontWeight' => 700]],
        'grid' => ['borderColor' => '#E2E7EE', 'xaxis' => ['lines' => ['show' => true]], 'yaxis' => ['lines' => ['show' => false]]],
        'fill' => ['opacity' => 1],
    ];
    return chart_container($id, $opts);
}

/**
 * Smooth gradient area chart - case volume over time, one series per
 * status so the trend AND the mix are both visible (matches the app's
 * status palette, stacked so the total silhouette is still readable).
 * @param array $days [['label'=>'29/07', 'parts'=>[['value'=>int,'color'=>'#hex','name'=>string], ...]], ...] oldest first
 */
function chart_daily_area(array $days, string $id = 'chart-daily'): string
{
    if (!$days) return '<p class="sub" style="margin:0">No cases yet.</p>';
    $names = array_column($days[0]['parts'], 'name');
    $colors = array_column($days[0]['parts'], 'color');
    $series = [];
    foreach ($names as $i => $name) {
        $series[] = ['name' => $name, 'data' => array_map(function ($d) use ($i) {
            return (int) $d['parts'][$i]['value'];
        }, $days)];
    }
    $opts = [
        'chart' => ['type' => 'area', 'height' => 260, 'stacked' => true, 'toolbar' => ['show' => false], 'fontFamily' => 'inherit'],
        'series' => $series,
        'colors' => $colors,
        'stroke' => ['curve' => 'smooth', 'width' => 2],
        'fill' => ['type' => 'gradient', 'gradient' => ['opacityFrom' => 0.45, 'opacityTo' => 0.05, 'shadeIntensity' => 1, 'stops' => [0, 90, 100]]],
        'dataLabels' => ['enabled' => false],
        'xaxis' => ['categories' => array_column($days, 'label'), 'labels' => ['style' => ['fontSize' => '10.5px']], 'tooltip' => ['enabled' => false]],
        'yaxis' => ['labels' => ['style' => ['fontSize' => '10.5px']], 'forceNiceScale' => true],
        'legend' => ['position' => 'top', 'horizontalAlign' => 'left', 'fontSize' => '12px'],
        'grid' => ['borderColor' => '#E2E7EE', 'strokeDashArray' => 3],
        'tooltip' => ['shared' => true, 'intersect' => false],
    ];
    return chart_container($id, $opts);
}

/*
 * WHAT THIS FILE DOES (in plain language)
 * ----------------------------------------
 * A small toolbox of chart-drawing helpers used only by the Admin
 * Dashboard (admin/index.php) - not a page of its own.
 *
 * - chart_donut(): draws the "Case outcomes" donut (approved/rejected/
 *   pending/draft split).
 * - chart_checker_bar(): draws the horizontal bar chart of how many
 *   cases each checker has approved vs. rejected.
 * - chart_daily_area(): draws the "Cases by day" area chart showing
 *   case volume over the selected date range, broken down by status.
 *
 * Each function takes plain PHP data the calling page already computed
 * from the database, converts it into the JSON config ApexCharts (a
 * JavaScript charting library loaded from web/vendor/apexcharts.min.js)
 * expects, and prints a placeholder <div> plus a tiny inline <script>
 * that draws the chart into it once the page loads.
 */
