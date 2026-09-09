/* ============================================================
   charts.js - dashboard charts, rendered with ApexCharts (vendored
   at web/vendor/apexcharts.min.js - no CDN).

   Every builder here draws on the dark dashboard surface
   (css/dashboard.css), so the theme lives in ONE place: THEME below.
   Builders take plain data and return nothing - the caller owns the
   container. Empty data draws a quiet "no data" line rather than an
   empty axis skeleton.
   ============================================================ */
(function () {
  'use strict';

  /* Colours come from the CSS tokens (css/dashboard.css defines the light
     set, css/theme-dark.css the dark one), so a chart never disagrees with
     the panel it sits in. Read once at load - the stylesheets are
     render-blocking, so they are already applied by the time this runs. */
  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  var DARK = !!(window.Theme && Theme.isDark());
  var THEME = {
    ink: token('--d-ink', '#1B2735'),
    muted: token('--d-muted', '#64748B'),
    line: token('--d-line', '#E2E7EE'),
    panel: token('--d-panel', '#FFFFFF'),
    track: token('--d-track', '#E9EDF2'),
    violet: token('--d-violet', '#6D5BD0'),
    blue: token('--d-blue', '#0F4C81'),
    cyan: token('--d-cyan', '#2790BC'),
    green: token('--d-green', '#1B7A46'),
    red: token('--d-red', '#B3261E'),
    amber: token('--d-amber', '#96690F')
  };

  function base(height) {
    return {
      chart: {
        height: height, background: 'transparent', foreColor: THEME.muted,
        fontFamily: 'inherit', toolbar: { show: false },
        animations: { speed: 400 }, parentHeightOffset: 0
      },
      tooltip: { theme: DARK ? 'dark' : 'light' },
      dataLabels: { enabled: false }
    };
  }

  function merge(a, b) {
    Object.keys(b || {}).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
        merge(a[k], b[k]);
      } else { a[k] = b[k]; }
    });
    return a;
  }

  function draw(container, opts) {
    if (!container) return;
    container.innerHTML = '';
    if (typeof ApexCharts === 'undefined') return;
    new ApexCharts(container, opts).render();
  }

  function empty(container, msg) {
    if (container) container.innerHTML = '<p class="empty">' + (msg || 'No data yet.') + '</p>';
  }

  function hasValues(series) {
    return series.some(function (s) {
      return s.data.some(function (v) { return v > 0; });
    });
  }

  /**
   * Stacked gradient area - volume over time.
   * @param data {categories:[label], series:[{name, data:[n], color}]}
   */
  function area(container, data, height) {
    if (!data || !data.series.length || !hasValues(data.series)) return empty(container, 'No cases in this range.');
    draw(container, merge(base(height || 260), {
      chart: { type: 'area', stacked: true },
      series: data.series.map(function (s) { return { name: s.name, data: s.data }; }),
      colors: data.series.map(function (s) { return s.color; }),
      stroke: { curve: 'smooth', width: 2 },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.42, opacityTo: 0.02, stops: [0, 92, 100] }
      },
      markers: { size: 0, hover: { size: 5, sizeOffset: 0 }, strokeWidth: 2, strokeColors: THEME.panel },
      xaxis: {
        categories: data.categories,
        axisBorder: { show: false }, axisTicks: { show: false },
        labels: { style: { fontSize: '10.5px' }, rotate: 0, hideOverlappingLabels: true },
        tooltip: { enabled: false },
        crosshairs: { stroke: { color: THEME.line, width: 1, dashArray: 4 } }
      },
      yaxis: { labels: { style: { fontSize: '10.5px' } }, forceNiceScale: true },
      legend: {
        position: 'top', horizontalAlign: 'right', fontSize: '11.5px',
        markers: { width: 9, height: 9, radius: 3 }, itemMargin: { horizontal: 8 },
        offsetY: -4
      },
      grid: { borderColor: THEME.line, strokeDashArray: 4, padding: { left: 4, right: 4 } },
      tooltip: { theme: DARK ? 'dark' : 'light', shared: true, intersect: false }
    }));
  }

  /**
   * Thick donut with a value in the middle. The legend is rendered as
   * HTML by the caller (see .legend in dashboard.css), so it can carry
   * per-row percentages the way the design calls for.
   * @param segments [{label, value, color}]
   * @param centre {value, label}
   */
  function donut(container, segments, centre) {
    var total = segments.reduce(function (a, s) { return a + (parseInt(s.value, 10) || 0); }, 0);
    if (!total) return empty(container, 'Nothing to show.');
    draw(container, merge(base(238), {
      chart: { type: 'donut' },
      series: segments.map(function (s) { return parseInt(s.value, 10) || 0; }),
      labels: segments.map(function (s) { return s.label; }),
      colors: segments.map(function (s) { return s.color; }),
      stroke: { width: 0 },
      legend: { show: false },
      plotOptions: {
        pie: { donut: { size: '76%', labels: {
          show: true,
          name: { show: true, offsetY: 18, fontSize: '11px', color: THEME.muted },
          value: { show: true, offsetY: -14, fontSize: '25px', fontWeight: 700, color: THEME.ink,
                   formatter: function () { return (centre && centre.value) || String(total); } },
          total: { show: true, showAlways: true,
                   label: (centre && centre.label) || 'Total', fontSize: '11px', color: THEME.muted,
                   formatter: function () { return (centre && centre.value) || String(total); } }
        } } }
      }
    }));
  }

  /**
   * Vertical rounded bars - one value per category (e.g. by weekday).
   * The tallest bar is highlighted, the way the design marks the peak.
   * @param data {categories:[label], data:[n]}
   */
  function bars(container, data, height) {
    if (!data || !data.data.length || !data.data.some(function (v) { return v > 0; })) {
      return empty(container, 'No cases yet.');
    }
    var peak = Math.max.apply(null, data.data);
    var colors = data.data.map(function (v) { return v === peak ? THEME.violet : THEME.blue; });
    draw(container, merge(base(height || 230), {
      chart: { type: 'bar' },
      series: [{ name: 'Cases', data: data.data }],
      colors: colors,
      plotOptions: { bar: { columnWidth: '46%', borderRadius: 5, borderRadiusApplication: 'end', distributed: true } },
      legend: { show: false },
      xaxis: {
        categories: data.categories,
        axisBorder: { show: false }, axisTicks: { show: false },
        labels: { style: { fontSize: '10.5px' } }
      },
      yaxis: { labels: { style: { fontSize: '10.5px' }, formatter: function (v) { return Math.round(v); } }, forceNiceScale: true },
      grid: { borderColor: THEME.line, strokeDashArray: 4, xaxis: { lines: { show: false } } },
      tooltip: { theme: DARK ? 'dark' : 'light', x: { show: true } }
    }));
  }

  /** Bare trend line, no axes - the small print at the bottom of a tile. */
  function spark(container, values, color, height) {
    if (!values || values.length < 2) return empty(container, '');
    draw(container, merge(base(height || 92), {
      chart: { type: 'line', sparkline: { enabled: true } },
      series: [{ name: 'Value', data: values }],
      colors: [color || THEME.violet],
      stroke: { curve: 'smooth', width: 2.5 },
      tooltip: { theme: DARK ? 'dark' : 'light', fixed: { enabled: false },
                 marker: { show: false }, x: { show: false } }
    }));
  }

  /**
   * Radial gauge with the count in the middle - one per product.
   * @param opts {value, max, color, unit}
   */
  function ring(container, opts) {
    var max = opts.max || 1;
    var pct = Math.min(100, Math.round((opts.value / max) * 100));
    draw(container, merge(base(118), {
      chart: { type: 'radialBar' },
      series: [opts.value ? Math.max(pct, 3) : 0],
      colors: [opts.color || THEME.cyan],
      plotOptions: {
        radialBar: {
          hollow: { size: '62%' },
          track: { background: '#22344E', strokeWidth: '100%' },
          dataLabels: {
            name: { show: true, offsetY: 16, fontSize: '9.5px', color: THEME.muted },
            value: {
              show: true, offsetY: -6, fontSize: '17px', fontWeight: 700, color: THEME.ink,
              formatter: function () { return String(opts.value); }
            }
          }
        }
      },
      labels: [opts.unit || 'CASES'],
      stroke: { lineCap: 'round' }
    }));
  }

  window.Charts = {
    THEME: THEME,
    area: area,
    donut: donut,
    bars: bars,
    spark: spark,
    ring: ring
  };
})();
