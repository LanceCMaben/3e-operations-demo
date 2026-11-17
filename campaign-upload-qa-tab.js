(function (global) {
  'use strict';

  var host = null;
  var chapterRoot = null;
  var tabActive = false;
  var embedState = { ready: false, loading: false, error: '' };
  var state = embedState;

  function hostStatus(msg, kind) {
    if (host && typeof host.setStatus === 'function') host.setStatus(msg, kind);
  }

  function chapterRefresh() {
    if (host && typeof host.onChapterRefresh === 'function') host.onChapterRefresh();
  }

/* ============================================================
   3E Campaign QA — Partition upload freshness
   ============================================================ */

var CONFIG = {
  /** Prefer this dataset when it returns rows; otherwise use the next mapped source that works. */
  primaryAlias: 'campaignQaInsights',
  /** Drop partitions whose name starts with this prefix (case-insensitive). */
  ignorePartitionPrefix: 'z_',
  /** SLA windows in days (inclusive). Past week8 is stale. */
  sla: {
    week1Days: 7,
    week2Days: 14,
    week4Days: 28,
    week8Days: 56
  },
  weekFilters: [
    { id: 'w1', label: '1 week', min: 0, max: 7 },
    { id: 'w2', label: '2 weeks', min: 8, max: 14 },
    { id: 'w3', label: '3 weeks', min: 15, max: 21 },
    { id: 'w4', label: '4 weeks', min: 22, max: 28 },
    { id: 'w5', label: '5 weeks', min: 29, max: 35 },
    { id: 'w6', label: '6 weeks', min: 36, max: 42 },
    { id: 'w7', label: '7 weeks', min: 43, max: 49 },
    { id: 'w8', label: '8 weeks', min: 50, max: 56 },
    { id: 'w9plus', label: 'Over 8 weeks', min: 57, max: null },
    { id: 'missing', label: 'No data', missing: true }
  ],
  queryTimeoutMs: 90000,
  dataQueryLimit: 10000,
  chartPaginationMaxPages: 3,
  paginationParallelBatch: 4,
  cacheTtlMs: 600000,
  debugLogColumns: false,
  sqlFastTimeoutMs: 45000,
  /**
   * Probe these in order. Enrollment Metrics is smaller than XPL and has file-date columns.
   * XPL is only queried if Enrollment Metrics returns no rows.
   * preferredFields skip the limit=1 schema probe when SQL aggregation works.
   */
  datasets: [
    {
      alias: 'campaignQaInsights',
      label: 'Enrollment Metrics',
      short: 'Enrollment',
      appendFields: false,
      partitionCandidates: ['PARTITION', 'PROGRAM_PARTITION', 'CLIENT'],
      dateCandidates: ['CF_SOURCE_FILE_DATE', 'SOURCE_FILE_DATE', 'EXTRACT_TIME'],
      countCandidates: ['RECORD_LOCATION', 'INSTANCE_LEAD_ID', 'CF_CLIENT_ID'],
      yearCandidates: ['CAMPAIGN_YEAR'],
      campaignCandidates: ['PROGRAM_SOLUTION', 'CF_CAMPAIGN_TYPE'],
      preferredFields: {
        partition: 'PARTITION',
        date: 'CF_SOURCE_FILE_DATE',
        count: 'RECORD_LOCATION',
        year: 'CAMPAIGN_YEAR',
        campaign: 'PROGRAM_SOLUTION'
      }
    },
    {
      alias: 'leads',
      label: 'XPL',
      short: 'XPL',
      appendFields: true,
      partitionCandidates: ['PROGRAM_PARTITION', 'PARTITION', 'CLIENT'],
      dateCandidates: ['CF_SOURCE_FILE_DATE', 'EXTRACT_TIME', 'UPDATED_AT', 'MEMBERSHIP_DATE'],
      countCandidates: ['INSTANCE_ID', 'CF_CLIENT_ID', 'INSTANCE_LEAD_ID'],
      yearCandidates: ['CAMPAIGN_YEAR'],
      campaignCandidates: ['PROGRAM_SOLUTION'],
      preferredFields: {
        partition: 'PROGRAM_PARTITION',
        date: 'CF_SOURCE_FILE_DATE',
        count: 'INSTANCE_ID',
        year: 'CAMPAIGN_YEAR',
        campaign: 'PROGRAM_SOLUTION'
      }
    }
  ],
  statusOrder: ['missing'],
  statusLabels: { missing: 'No data' },
  useCampaignYearRangeDisplay: true,
  /** Fallback calendar year when no program tab is active. */
  keepCalendarYear: 2026,
  /** Years shown as CY25 / CY26 pills. AWR is the CY25 cycle (entry year 2026). CNVA* / CNVD are CY26. */
  filterYears: [2025, 2026],
  /**
   * Header tabs. Year pills choose CY25 vs CY26.
   * campaignCodes = exact canonical codes (CNVA must not swallow CNVAU).
   * Verbose names such as "Conversion Apply" map onto those codes before matching.
   * campaignPrefixes = family match (AWR includes AWRSS / AWRRS).
   * Clicking a family tab selects its keepCalendarYear; All keeps the year pill.
   */
  programTabs: [
    {
      id: 'all',
      label: 'All',
      allCampaigns: true,
      keepCalendarYear: 2026
    },
    {
      id: 'cnva',
      label: 'CNVA',
      campaignCodes: ['CNVA'],
      keepCalendarYear: 2026
    },
    {
      id: 'cnvau',
      label: 'CNVAU',
      campaignCodes: ['CNVAU'],
      keepCalendarYear: 2026
    },
    {
      id: 'cnvaa',
      label: 'CNVAA',
      campaignCodes: ['CNVAA'],
      keepCalendarYear: 2026
    },
    {
      id: 'cnvaaff',
      label: 'CNVAAFF',
      campaignCodes: ['CNVAAFF'],
      keepCalendarYear: 2026
    },
    {
      id: 'cnvasc',
      label: 'CNVASC',
      campaignCodes: ['CNVASC'],
      keepCalendarYear: 2026
    },
    {
      id: 'cnvd',
      label: 'CNVD',
      campaignCodes: ['CNVD'],
      keepCalendarYear: 2026
    },
    {
      id: 'awr',
      label: 'AWR',
      awrFamily: true,
      campaignPrefixes: ['AWR'],
      keepCalendarYear: 2025
    }
  ],
  minCampaignYear: '',
  debugLogColumns: true
};

var C = {
  text: '#18181A',
  r1: '#1B1B1E',
  r2: '#6FBFB0',
  r3: '#FFD100',
  card: '#FFFFFF',
  track: '#FAFAF8',
  muted: '#9A9A95',
  grid: '#ECEAE4',
  unknownStack: '#C6C8CC',
  cat5: '#6A6A66',
  cat6: '#A9D2CA',
  cat7: '#E2E0DA',
  accentInk: '#161616',
  tooltipBg: '#141416'
};

var charts = {};
var RAW = null;
var LAST_DASH_DATA = null;
var SCHEMA = {};
var ROSTER_SEARCH = '';
var SORT_KEY = 'days';
var SORT_DIR = 'desc';
var PROGRAM_TAB_KEY = '3e-qa-program-tab-v4';
var YEAR_FILTER_KEY = '3e-qa-year-v1';
var QA_CACHE_KEY = '3e-qa-pack-v6';
var Join = window.OpsJoin || {};
var CAMPAIGN_CODE_ORDER = Join.CAMPAIGN_CODE_ORDER || ['CNVAAFF', 'CNVASC', 'CNVAU', 'CNVAA', 'CNVD', 'CNVA', 'AWRSS', 'AWRRS', 'AWR'];
var ACTIVE_PROGRAM_TAB = 'all';
var SELECTED_YEAR = 2026;
var SELECTED_QA_REC_ID = '';
var QA_DETAIL_PROGRAM_ROW = null;

function $(id) {
  if (chapterRoot) {
    var scoped = chapterRoot.querySelector('#' + id);
    if (scoped) return scoped;
  }
  return document.getElementById(id);
}

function qaQueryAll(sel) {
  return chapterRoot ? chapterRoot.querySelectorAll(sel) : document.querySelectorAll(sel);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncChartPalette() {
  var s = getComputedStyle(document.documentElement);
  function v(name, fallback) {
    var x = s.getPropertyValue(name).trim();
    return x || fallback;
  }
  C.text = v('--text', C.text);
  C.r1 = v('--cat-1', C.r1);
  C.r2 = v('--mint', C.r2);
  C.r3 = v('--accent', C.r3);
  C.card = v('--card', C.card);
  C.track = v('--card-2', C.track);
  C.muted = v('--text-mute', C.muted);
  C.grid = v('--grid', C.grid);
  C.unknownStack = v('--cat-4', C.unknownStack);
  C.cat5 = v('--cat-5', C.cat5);
  C.cat6 = v('--cat-6', C.cat6);
  C.cat7 = v('--cat-7', C.cat7);
  C.accentInk = v('--accent-ink', C.accentInk);
  C.tooltipBg = v('--header-bg', '#141416');
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = C.muted;
    Chart.defaults.plugins.tooltip.backgroundColor = C.tooltipBg;
    Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
    Chart.defaults.plugins.tooltip.bodyColor = '#FFFFFF';
  }
}

function statusColor(status) {
  var m = /^day-(\d+)$/.exec(status || '');
  if (m) {
    var n = Number(m[1]);
    if (n > 13) return '#E65100';
    if (n >= 7) return C.r3;
    return C.r2;
  }
  return C.unknownStack;
}

function statusChipClass(status) {
  var m = /^day-(\d+)$/.exec(status || '');
  if (m) {
    var n = Number(m[1]);
    if (n > 13) return 'status-chip--overdue';
    if (n >= 7) return 'status-chip--aging';
    return 'status-chip--fresh';
  }
  return 'status-chip--missing';
}

function initThemeToggle() {
  /* Overview scope header owns theme; do not rewrite data-theme from this chapter. */
}

function qaLoading(active, label) {
  var sk = $('campaignUploadQaSkeleton');
  if (sk) sk.hidden = !active;
  var app = $('app');
  if (app) app.hidden = !!active;
  if (active && label) hostStatus(label, 'loading');
}

function showDataLoadError(message) {
  qaLoading(false);
  var msg = message || 'Unknown error';
  hostStatus('Campaign Upload QA failed: ' + msg, 'error');
  var diag = $('qa-diag');
  if (diag) {
    diag.hidden = false;
    diag.classList.remove('hidden');
    diag.textContent = msg;
  }
}

function setLoaderProgress(target, message) {
  if (message) qaLoading(true, message);
}

function initDataLoader() {
  qaLoading(true, 'Loading Campaign Upload QA…');
}

function finishDataLoader() {
  qaLoading(false);
  return Promise.resolve();
}

function formatQueryError(err) {
  if (!err) return 'Unknown error';
  var parts = [];
  if (err.message) parts.push(err.message);
  if (err.status != null) parts.push('HTTP ' + err.status);
  if (typeof err.responseText === 'string' && err.responseText.length) {
    parts.push(err.responseText.slice(0, 400));
  }
  return parts.join(' — ') || String(err);
}

function asRowArray(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.rows)) return v.rows;
  return [];
}

function getDataQueryLimit() {
  var lim = typeof CONFIG.dataQueryLimit === 'number' ? CONFIG.dataQueryLimit : 100000;
  return Math.max(1000, Math.min(lim, 100000));
}

function withDataApiOffset(url, offset) {
  if (!offset) return url;
  if (/[&?]offset=/.test(url)) {
    return url.replace(/([&?])offset=[^&]*/, '$1offset=' + encodeURIComponent(String(offset)));
  }
  return url + '&offset=' + encodeURIComponent(String(offset));
}

function fetchQueryWithTimeout(url, queryKey, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      resolve({
        rows: [],
        error: new Error(queryKey + ': timed out after ' + Math.round(timeoutMs / 1000) + 's')
      });
    }, timeoutMs);
    domo.get(url).then(function (rows) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ rows: asRowArray(rows), error: null });
    }).catch(function (err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      console.warn('[3E-QA]', queryKey, 'Data API error:', formatQueryError(err));
      console.warn('[3E-QA]', queryKey, 'URL:', url);
      resolve({ rows: [], error: err });
    });
  });
}

async function fetchPagedQuery(url, queryKey, timeoutMs, maxPages) {
  var lim = getDataQueryLimit();
  var batch = Math.max(1, Math.min(typeof CONFIG.paginationParallelBatch === 'number' ? CONFIG.paginationParallelBatch : 4, 8));
  var first = await fetchQueryWithTimeout(withDataApiOffset(url, 0), queryKey, timeoutMs);
  if (first.error) return first;
  var allRows = asRowArray(first.rows).slice();
  if (allRows.length < lim) return { rows: allRows, error: null };

  var page = 1;
  var stop = false;
  while (!stop && page < maxPages) {
    var count = Math.min(batch, maxPages - page);
    var reqs = [];
    for (var i = 0; i < count; i++) {
      var offset = (page + i) * lim;
      reqs.push(fetchQueryWithTimeout(withDataApiOffset(url, offset), queryKey + ' [offset ' + offset + ']', timeoutMs));
    }
    var results = await Promise.all(reqs);
    for (var j = 0; j < results.length; j++) {
      var r = results[j];
      if (r.error) {
        console.warn('[3E-QA]', queryKey, 'pagination stopped:', formatQueryError(r.error));
        stop = true;
        break;
      }
      var rows = asRowArray(r.rows);
      allRows = allRows.concat(rows);
      if (rows.length < lim) { stop = true; break; }
    }
    page += count;
  }
  return { rows: allRows, error: null };
}

function findColumnNameCI(cols, name) {
  if (!name) return null;
  var target = String(name).toUpperCase();
  for (var i = 0; i < cols.length; i++) {
    if (String(cols[i]).toUpperCase() === target) return cols[i];
  }
  return null;
}

function firstMatchingColumn(cols, candidates) {
  var list = candidates || [];
  var i;
  for (i = 0; i < list.length; i++) {
    var hit = findColumnNameCI(cols, list[i]);
    if (hit) return hit;
  }
  return null;
}

function formatCampaignYearLabel(v) {
  if (!CONFIG.useCampaignYearRangeDisplay) return String(v || '');
  var s = String(v == null ? '' : v).trim();
  var m = /^CY(\d{2})$/i.exec(s);
  if (m) {
    var yy = parseInt(m[1], 10);
    var start = 2000 + yy;
    return start + '–' + (start + 1);
  }
  if (/^\d{4}$/.test(s)) {
    var y = parseInt(s, 10);
    return y + '–' + (y + 1);
  }
  return s;
}

function normalizeCampaignYear(v) {
  if (v == null) return '';
  return String(v).trim();
}

function normalizeCampaignName(v) {
  if (v == null) return '';
  return String(v).trim();
}

function compactToken(v) {
  return Join.compactToken ? Join.compactToken(v) : String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function normalizeJoinKey(v) {
  return Join.compactJoinKey ? Join.compactJoinKey(v) : String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function canonicalCampaignCode(v) {
  return Join.canonicalCampaignCode ? Join.canonicalCampaignCode(v) : compactToken(v);
}

function resolveCampaignName(primary, alt) {
  return canonicalCampaignCode(normalizeCampaignName(primary) || normalizeCampaignName(alt));
}

function partitionKeysOverlap(a, b) {
  if (Join.partitionKeysOverlap) return Join.partitionKeysOverlap(a, b);
  var na = normalizeJoinKey(a);
  var nb = normalizeJoinKey(b);
  if (!na || !nb) return false;
  return na === nb;
}

function formatCampaignLabel(year, campaignName) {
  var y = (isAwrCampaignName(campaignName) && awrYearMatchesCy25(year))
    ? formatCampaignYearLabel('CY25')
    : (year ? formatCampaignYearLabel(year) : '');
  var n = normalizeCampaignName(campaignName);
  if (y && n) return y + ' ' + n;
  return y || n || '';
}

function programTabList() {
  return (CONFIG.programTabs && CONFIG.programTabs.length) ? CONFIG.programTabs.slice() : [];
}

function programTabById(id) {
  var list = programTabList();
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function getActiveProgramTab() {
  return programTabById(ACTIVE_PROGRAM_TAB) || programTabList()[0] || null;
}

function programTabYearLabel(tab) {
  if (!tab) return selectedYearLabel();
  if (tab.allCampaigns) return selectedYearLabel();
  if (tab.keepCalendarYear == null) return selectedYearLabel();
  return formatCampaignYearLabel(String(tab.keepCalendarYear));
}

function yearFilterOptions() {
  var years = {};
  (CONFIG.filterYears || []).forEach(function (y) { years[Number(y)] = true; });
  programTabList().forEach(function (tab) {
    if (tab.keepCalendarYear != null) years[Number(tab.keepCalendarYear)] = true;
  });
  if (!Object.keys(years).length && CONFIG.keepCalendarYear != null) {
    years[Number(CONFIG.keepCalendarYear)] = true;
  }
  return Object.keys(years).map(Number).sort();
}

function keptCalendarYears() {
  return yearFilterOptions();
}

function calendarYearToken(calendarYear) {
  var y = Number(calendarYear);
  if (!y) return '';
  return 'CY' + String(y).slice(-2);
}

function selectedYearLabel() {
  return formatCampaignYearLabel(String(SELECTED_YEAR));
}

function calendarYearFromValue(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).trim();
  var m = /^CY(\d{2})$/i.exec(s);
  if (m) return 2000 + parseInt(m[1], 10);
  if (/^\d{4}$/.test(s)) return parseInt(s, 10);
  var start = /^(\d{4})/.exec(s);
  return start ? parseInt(start[1], 10) : null;
}

function calendarYearToCycleToken(calendarYear) {
  if (calendarYear == null || calendarYear === '') return '';
  var fromVal = cycleTokenFromValue(calendarYear);
  if (fromVal) return fromVal;
  var n = Number(calendarYear);
  if (!isFinite(n)) return '';
  return 'CY' + String(n).slice(-2);
}

/**
 * 3E cycle identity (Wiki / Client Impact):
 * CY25 = Aug 1 2025–Jul 31 2026, entry year 2026.
 * Token CY## → entry year 2001+##. A 4-digit year on AWR rows is usually that entry year,
 * so AWR 2026 belongs on CY25, not CY26.
 */
function entryYearFromCycleToken(token) {
  var m = /^CY(\d{2})$/i.exec(String(token || '').trim());
  if (!m) return null;
  return 2001 + parseInt(m[1], 10);
}

function cycleTokenFromValue(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  var m = /^CY(\d{2})$/.exec(s);
  if (m) return 'CY' + m[1];
  m = /^CY(\d{4})$/.exec(s);
  if (m) {
    var yy4 = String(Number(m[1]) % 100);
    if (yy4.length === 1) yy4 = '0' + yy4;
    return 'CY' + yy4;
  }
  m = /^(\d{4})[-–\/](\d{2,4})$/.exec(s);
  if (m) return 'CY' + String(m[1]).slice(-2);
  if (/^\d{4}$/.test(s)) return 'CY' + s.slice(-2);
  return '';
}

function isAwrCampaignName(name) {
  var code = canonicalCampaignCode(name);
  return !!(code && code.indexOf('AWR') === 0);
}

/** AWR files sit in the CY25 cycle (Aug 2025–Jul 2026, entry 2026). */
function awrYearMatchesCy25(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return false;
  if (s === 'CY25' || s === 'CY2025') return true;
  if (s === '2025' || s === '2026') return true;
  if (/^2025[-–\/]20?26$/.test(s) || /^CY25[-–\/]/.test(s)) return true;
  if (/^2026[-–\/]20?27$/.test(s)) return true;
  return false;
}

function yearMatchesCalendarYear(v, calendarYear, campaignName) {
  if (calendarYear == null) return true;
  var s = normalizeCampaignYear(v);
  if (!s) return false;
  var want = calendarYearToCycleToken(calendarYear);
  if (!want) return false;
  if (isAwrCampaignName(campaignName)) {
    if (want === 'CY25') return awrYearMatchesCy25(s);
    return false;
  }
  var got = cycleTokenFromValue(s);
  if (got && got === want) return true;
  var year = Number(calendarYear);
  if (s === String(year)) return true;
  if (/^\d{4}$/.test(s)) {
    var n = Number(s);
    if (n === year) return true;
    var filterYears = CONFIG.filterYears || [];
    if (n === year + 1 && filterYears.indexOf(n) < 0) return true;
  }
  var m = /^CY(\d{2})$/i.exec(s);
  if (m && (2000 + parseInt(m[1], 10)) === year) return true;
  var start = /^(\d{4})[-–\/]/.exec(s);
  return !!(start && Number(start[1]) === year);
}

function campaignMatchesProgram(name, tab) {
  if (!tab || tab.allCampaigns) return true;
  if (tab.awrFamily) return isAwrCampaignName(name);
  var n = canonicalCampaignCode(name);
  if (!n) return false;
  var i;
  var codes = tab.campaignCodes && tab.campaignCodes.length ? tab.campaignCodes : null;
  if (codes) {
    for (i = 0; i < codes.length; i++) {
      if (n === canonicalCampaignCode(codes[i])) return true;
    }
    return false;
  }
  var prefixes = tab.campaignPrefixes && tab.campaignPrefixes.length
    ? tab.campaignPrefixes
    : [tab.label];
  for (i = 0; i < prefixes.length; i++) {
    var pre = canonicalCampaignCode(prefixes[i]);
    if (!pre) continue;
    if (n === pre || n.indexOf(pre) === 0) return true;
  }
  return false;
}

function programRowField(row, name) {
  if (!row) return '';
  if (row[name] != null && String(row[name]).trim() !== '') return row[name];
  var upper = String(name).toUpperCase();
  var k;
  for (k in row) {
    if (Object.prototype.hasOwnProperty.call(row, k) && String(k).toUpperCase() === upper) return row[k];
  }
  return '';
}

function programRowIsActive(row) {
  if (!row) return false;
  var status = String(programRowField(row, 'PROGRAM_STATUS') || '').trim().toUpperCase();
  if (status.indexOf('DEVELOPMENT') >= 0 || status.indexOf('DEVELOP') >= 0) return false;
  if (status.indexOf('INACTIVE') >= 0) return false;
  var flag = programRowField(row, 'ACTIVE_FLAG');
  if (flag == null || String(flag).trim() === '') {
    return status.indexOf('ACTIVE') >= 0;
  }
  var s = String(flag).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'ACTIVE';
}

function programRowLifecycle(row) {
  var status = String(programRowField(row, 'PROGRAM_STATUS') || '').trim().toUpperCase();
  if (status.indexOf('DEVELOPMENT') >= 0 || status.indexOf('DEVELOP') >= 0) return 'development';
  if (status.indexOf('INACTIVE') >= 0) return 'inactive';
  if (programRowIsActive(row)) return 'active';
  if (status.indexOf('ACTIVE') >= 0) return 'inactive';
  return 'inactive';
}

function hostProgramRows() {
  if (!host || typeof host.getPrograms !== 'function') return [];
  var rows = host.getPrograms();
  return Array.isArray(rows) ? rows : [];
}

function hostFilters() {
  var defaultStatuses = Join.defaultProgramStatusSelection
    ? Join.defaultProgramStatusSelection()
    : ['active', 'inactive', 'development'];
  var empty = {
    partners: [],
    campaigns: [],
    years: [],
    statuses: defaultStatuses.slice(),
    search: '',
    portalPartners: null
  };
  if (!host || typeof host.getFilters !== 'function') return empty;
  var f = host.getFilters() || {};
  var statuses = Array.isArray(f.statuses) ? f.statuses : [];
  if (!statuses.length) statuses = defaultStatuses.slice();
  return {
    partners: Array.isArray(f.partners) ? f.partners : [],
    campaigns: Array.isArray(f.campaigns) ? f.campaigns : [],
    years: Array.isArray(f.years) ? f.years : [],
    statuses: statuses,
    search: f.search || '',
    portalPartners: f.portalPartners || null,
    scopePartners: Array.isArray(f.scopePartners) ? f.scopePartners : []
  };
}

var PROGRAM_STATUS_INDEX = null;

function invalidateProgramStatusIndex() {
  PROGRAM_STATUS_INDEX = null;
}

function programRowPartitionNames(row) {
  return ['PARTITION', 'CLIENT', 'PROGRAM_PARTITION', 'PARTNER'].map(function (field) {
    return String(programRowField(row, field) || '').trim();
  }).filter(Boolean);
}

function programStatusIndex() {
  if (PROGRAM_STATUS_INDEX) return PROGRAM_STATUS_INDEX;
  var index = {};
  hostProgramRows().forEach(function (row) {
    var campaign = canonicalCampaignCode(programRowField(row, 'PROGRAM_SOLUTION'));
    if (!campaign) return;
    programRowPartitionNames(row).forEach(function (part) {
      var keys = [part.toLowerCase(), normalizeJoinKey(part)].filter(Boolean);
      keys.forEach(function (k) {
        var key = k + '\0' + campaign;
        if (!index[key]) index[key] = [];
        if (index[key].indexOf(row) < 0) index[key].push(row);
      });
    });
  });
  PROGRAM_STATUS_INDEX = index;
  return index;
}

function recYearMatchesValue(rec, value) {
  if (value == null || value === '') return true;
  var recY = rec && rec.year != null ? String(rec.year).trim() : '';
  var hub = String(value).trim();
  if (!recY || !hub) return false;
  if (recY.toUpperCase() === hub.toUpperCase()) return true;
  if (isAwrCampaignName(rec.campaignName)) {
    var hubTok = cycleTokenFromValue(hub) || calendarYearToCycleToken(calendarYearFromValue(hub));
    if (hubTok === 'CY25' || awrYearMatchesCy25(hub)) return awrYearMatchesCy25(recY);
    return false;
  }
  var cal = calendarYearFromValue(hub);
  if (cal != null && yearMatchesCalendarYear(rec.year, cal, rec.campaignName)) return true;
  var recTok = cycleTokenFromValue(recY);
  var wantTok = cycleTokenFromValue(hub) || calendarYearToCycleToken(cal);
  return !!(recTok && wantTok && recTok === wantTok);
}

function matchingProgramRows(rec) {
  var campaign = canonicalCampaignCode(rec && rec.campaignName);
  var partRaw = String((rec && rec.name) || '').trim().toLowerCase();
  var partCompact = normalizeJoinKey(rec && rec.name);
  if (!campaign || (!partRaw && !partCompact)) return [];
  var index = programStatusIndex();
  var rows = [];
  function addRows(list) {
    (list || []).forEach(function (row) {
      if (rows.indexOf(row) < 0) rows.push(row);
    });
  }
  addRows(index[partRaw + '\0' + campaign]);
  if (partCompact && partCompact !== partRaw) addRows(index[partCompact + '\0' + campaign]);
  if (!rows.length && partCompact.length >= 6) {
    var suffix = '\0' + campaign;
    Object.keys(index).forEach(function (k) {
      if (k.slice(-suffix.length) !== suffix) return;
      var p = k.slice(0, k.length - suffix.length);
      if (p.length < 6) return;
      if (p.indexOf(partCompact) === 0 || partCompact.indexOf(p) === 0) addRows(index[k]);
    });
  }
  if (!rows.length) return [];
  return rows.filter(function (row) {
    return recYearMatchesValue(rec, programRowField(row, 'CAMPAIGN_YEAR'));
  });
}

function recProgramLifecycle(rec) {
  if (rec && rec.programLifecycle) return rec.programLifecycle;
  if (!hostProgramRows().length) return '';
  var matches = matchingProgramRows(rec);
  if (!matches.length) return 'unmapped';
  var i;
  var life = programRowLifecycle(matches[0]);
  for (i = 0; i < matches.length; i++) {
    if (programRowLifecycle(matches[i]) === 'active') return 'active';
  }
  return life;
}

function recMatchesProgramStatuses(rec, statuses) {
  if (Join.effectiveProgramStatusFilter) {
    statuses = Join.effectiveProgramStatusFilter(statuses);
    if (!statuses) return true;
  } else if (!statuses || !statuses.length) {
    return true;
  }
  if (!hostProgramRows().length) return true;
  var life = recProgramLifecycle(rec);
  if (life === 'unmapped' || !life) return statuses.indexOf('inactive') >= 0;
  return statuses.indexOf(life) >= 0;
}

function recMatchesPartnerList(name, selected) {
  if (!selected || !selected.length) return true;
  var i;
  for (i = 0; i < selected.length; i++) {
    if (partitionKeysOverlap(name, selected[i])) return true;
  }
  return false;
}

function recMatchesSelectedList(value, selected, normalize) {
  if (!selected || !selected.length) return true;
  var have = normalize ? normalize(value) : String(value == null ? '' : value).trim();
  if (!have) return false;
  var i;
  for (i = 0; i < selected.length; i++) {
    var want = normalize ? normalize(selected[i]) : String(selected[i] == null ? '' : selected[i]).trim();
    if (!want) continue;
    if (have === want) return true;
    if (String(have).toLowerCase() === String(want).toLowerCase()) return true;
  }
  return false;
}

function recMatchesHubFilters(rec) {
  var f = hostFilters();
  var name = rec && rec.name;
  var scope = f.scopePartners || [];
  if (scope.length && !recMatchesPartnerList(name, scope)) return false;
  if (!recMatchesSelectedList(rec && rec.campaignName, f.campaigns, canonicalCampaignCode)) return false;
  if (f.years && f.years.length) {
    var yearOk = false;
    var i;
    for (i = 0; i < f.years.length; i++) {
      if (recYearMatchesValue(rec, f.years[i])) {
        yearOk = true;
        break;
      }
    }
    if (!yearOk) return false;
  }
  if (!recMatchesProgramStatuses(rec, f.statuses)) return false;
  if (f.search && !matchesRosterView(rec, f.search)) return false;
  return true;
}

function recMatchesProgramTab(rec, tab) {
  tab = tab || getActiveProgramTab();
  if (!tab) return true;
  if (SELECTED_YEAR != null && !yearMatchesCalendarYear(rec.year, SELECTED_YEAR, rec.campaignName)) return false;
  if (!campaignMatchesProgram(rec.campaignName, tab)) return false;
  if (!recMatchesHubFilters(rec)) return false;
  return true;
}

function campaignYearKeepCodes() {
  var codes = [];
  var seen = {};
  keptCalendarYears().forEach(function (year) {
    var yy = String(year).slice(-2);
    var entry = year + 1;
    [ 'CY' + yy, String(year), String(entry), year + '-' + (year + 1), year + '–' + (year + 1) ].forEach(function (c) {
      if (seen[c]) return;
      seen[c] = true;
      codes.push(c);
    });
  });
  return codes;
}

function campaignYearIsKept(v, campaignName) {
  var years = keptCalendarYears();
  if (!years.length) return true;
  return years.some(function (year) { return yearMatchesCalendarYear(v, year, campaignName); });
}

function campaignYearFilterClause(yearField) {
  if (!yearField || !keptCalendarYears().length) return '';
  var inner = campaignYearKeepCodes().map(function (c) { return '"' + c + '"'; }).join(',');
  return yearField + ' in [' + inner + ']';
}

function appendCampaignYearFilter(url, yearField) {
  var clause = campaignYearFilterClause(yearField);
  if (!clause) return url;
  return url + '&filter=' + encodeURIComponent(clause);
}

function sqlQuote(v) {
  return "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
}

function qaColumnName(col) {
  if (col == null) return '';
  if (typeof col === 'string') return col;
  if (typeof col === 'object') {
    if (col.name != null) return String(col.name);
    if (col.column != null) return String(col.column);
    if (col.field != null) return String(col.field);
  }
  return String(col);
}

function parseQaSqlResp(resp) {
  if (resp && Array.isArray(resp.columns) && Array.isArray(resp.rows)) {
    return { cols: resp.columns.map(qaColumnName), rows: resp.rows };
  }
  if (Array.isArray(resp) && resp.length && Array.isArray(resp[0])) {
    return { cols: resp[0].map(qaColumnName), rows: resp.slice(1) };
  }
  if (Array.isArray(resp) && resp.length && typeof resp[0] === 'object' && !Array.isArray(resp[0])) {
    var c = Object.keys(resp[0]);
    return { cols: c, rows: resp.map(function (r) { return c.map(function (k) { return r[k]; }); }) };
  }
  return { cols: [], rows: [] };
}

function sqlColIdx(cols, name) {
  var upper = String(name).toUpperCase();
  var i;
  for (i = 0; i < cols.length; i++) {
    if (String(cols[i]).toUpperCase() === upper) return i;
  }
  return -1;
}

function schemaFromDef(def) {
  var f = def.preferredFields || {};
  return {
    alias: def.alias,
    label: def.label,
    short: def.short,
    ok: !!(f.partition && (f.count || f.date)),
    columns: [],
    partitionField: f.partition || null,
    dateField: f.date || null,
    dateCandidates: (f.date ? [f.date] : []).concat(def.dateCandidates || []).filter(function (name, i, arr) {
      return name && arr.indexOf(name) === i;
    }),
    countField: f.count || null,
    yearField: f.year || null,
    campaignField: f.campaign || null,
    campaignAltField: f.campaignAlt || null,
    appendFields: def.appendFields === true,
    useCount: true,
    error: null,
    fromPreferred: true
  };
}

function partitionSql(schema, dateField, skipYear, fromExpr) {
  var p = schema.partitionField;
  var y = schema.yearField;
  var c = schema.campaignField;
  var c2 = schema.campaignAltField;
  var select = [p + ' AS PARTITION_NAME'];
  if (y) select.push(y + ' AS CAMPAIGN_YEAR');
  else select.push("'' AS CAMPAIGN_YEAR");
  if (c) select.push(c + ' AS PROGRAM_SOLUTION');
  else select.push("'' AS PROGRAM_SOLUTION");
  if (c2 && c2 !== c) select.push(c2 + ' AS CAMPAIGN_TYPE');
  select.push('COUNT(*) AS CNT');
  if (dateField) select.push('MAX(' + dateField + ') AS LAST_DATE');
  var sql = 'SELECT ' + select.join(', ') + ' FROM ' + (fromExpr || '{alias}');
  var years = campaignYearKeepCodes();
  if (!skipYear && y && years.length) {
    sql += ' WHERE ' + y + ' IN (' + years.map(sqlQuote).join(',') + ')';
  }
  sql += ' GROUP BY ' + p;
  if (y) sql += ', ' + y;
  if (c) sql += ', ' + c;
  if (c2 && c2 !== c) sql += ', ' + c2;
  return sql;
}

function fetchSqlPromise(alias, sql, label, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      resolve({ error: new Error((label || 'SQL') + ': timed out after ' + Math.round(timeoutMs / 1000) + 's'), rows: [] });
    }, timeoutMs);
    domo.post('/sql/v1/' + alias, sql, { contentType: 'text/plain' }).then(function (raw) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (raw && typeof raw === 'object' && !Array.isArray(raw) &&
          (raw.error || raw.status === 'error') && !raw.columns && !raw.rows) {
        resolve({ error: new Error(raw.error || raw.message || label + ' SQL error'), rows: [] });
        return;
      }
      resolve({ error: null, parsed: parseQaSqlResp(raw) });
    }).catch(function (err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ error: err, rows: [] });
    });
  });
}

function mapSqlPartitionRows(parsed, schema) {
  var cols = parsed.cols || [];
  var iName = sqlColIdx(cols, 'PARTITION_NAME');
  if (iName < 0) iName = sqlColIdx(cols, schema.partitionField);
  var iYear = sqlColIdx(cols, 'CAMPAIGN_YEAR');
  var iCamp = sqlColIdx(cols, 'PROGRAM_SOLUTION');
  var iCnt = sqlColIdx(cols, 'CNT');
  var iDate = sqlColIdx(cols, 'LAST_DATE');
  if (iName < 0) return [];
  var out = [];
  (parsed.rows || []).forEach(function (row) {
    var cells = Array.isArray(row) ? row : cols.map(function (k) { return row[k]; });
    var name = cells[iName] != null ? String(cells[iName]).trim() : '';
    if (!name) return;
    var year = iYear >= 0 ? normalizeCampaignYear(cells[iYear]) : '';
    var iCampAlt = sqlColIdx(cols, 'CAMPAIGN_TYPE');
    var campaignName = resolveCampaignName(
      iCamp >= 0 ? cells[iCamp] : '',
      iCampAlt >= 0 ? cells[iCampAlt] : ''
    );
    if (schema.yearField && !campaignYearIsKept(year, campaignName)) return;
    out.push({
      name: name,
      year: year,
      campaignName: campaignName,
      records: iCnt >= 0 ? Number(cells[iCnt]) || 0 : 0,
      lastDate: iDate >= 0 ? parseDomoDate(cells[iDate]) : null
    });
  });
  return out;
}

function qaCacheTtl() {
  return typeof CONFIG.cacheTtlMs === 'number' ? CONFIG.cacheTtlMs : 600000;
}

function serializeQaPacks(packs) {
  var out = {};
  Object.keys(packs || {}).forEach(function (alias) {
    var pack = packs[alias] || {};
    out[alias] = {
      alias: pack.alias || alias,
      dims: pack.dims || [],
      error: pack.error || null,
      preparsed: true,
      rows: (pack.rows || []).map(function (r) {
        return {
          name: r.name,
          year: r.year,
          campaignName: r.campaignName,
          records: r.records,
          lastDate: r.lastDate instanceof Date ? r.lastDate.toISOString() : r.lastDate
        };
      })
    };
  });
  return out;
}

function reviveQaPacks(packs) {
  var out = {};
  Object.keys(packs || {}).forEach(function (alias) {
    var pack = packs[alias] || {};
    out[alias] = {
      alias: pack.alias || alias,
      dims: pack.dims || [],
      error: pack.error || null,
      preparsed: true,
      rows: (pack.rows || []).map(function (r) {
        return {
          name: r.name,
          year: r.year,
          campaignName: r.campaignName,
          records: r.records,
          lastDate: parseDomoDate(r.lastDate)
        };
      })
    };
  });
  return out;
}

function readQaCache() {
  try {
    var raw = localStorage.getItem(QA_CACHE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.at || (Date.now() - parsed.at) > qaCacheTtl()) return null;
    if (!parsed.raw || !parsed.raw.packs) return null;
    parsed.raw.packs = reviveQaPacks(parsed.raw.packs);
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeQaCache(raw, schema) {
  try {
    localStorage.setItem(QA_CACHE_KEY, JSON.stringify({
      at: Date.now(),
      raw: { packs: serializeQaPacks(raw.packs), warnings: raw.warnings || [] },
      schema: schema || SCHEMA
    }));
  } catch (e) { /* ignore quota */ }
}

function clearQaCache() {
  try { localStorage.removeItem(QA_CACHE_KEY); } catch (e) { /* ignore */ }
}

function isIgnoredPartition(name) {
  var s = String(name == null ? '' : name).trim();
  if (!s) return true;
  var Join = window.OpsJoin;
  if (Join && Join.isIgnoredPartition) return Join.isIgnoredPartition(s);
  var prefix = CONFIG.ignorePartitionPrefix != null ? String(CONFIG.ignorePartitionPrefix) : 'z_';
  if (!prefix) return false;
  return s.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
}

function formatDateInput(d) {
  if (!d) return '';
  return formatDateYmd(d);
}

function parseInputDate(s) {
  if (!s) return null;
  var d = new Date(String(s).trim() + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d, n) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateYmd(d) {
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

function parseDomoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && isFinite(v)) {
    var n = v;
    if (n > 1e12) n = Math.round(n);
    else if (n > 1e9) n = Math.round(n * 1000);
    var dn = new Date(n);
    return isNaN(dn.getTime()) ? null : dn;
  }
  var s = String(v).trim();
  if (!s) return null;
  if (/^1900-01-01/.test(s) || /^1899-/.test(s)) return null;
  var iso = Date.parse(s);
  if (!isNaN(iso)) return new Date(iso);
  return null;
}

function daysSince(date, now) {
  if (!date) return null;
  var a = startOfDay(date);
  var b = startOfDay(now || new Date());
  return Math.max(0, Math.round((b - a) / 86400000));
}

function statusForDays(days) {
  if (days == null || !isFinite(days)) return 'missing';
  return 'day-' + Math.max(0, Math.round(days));
}

function statusLabel(status) {
  if (status === 'missing') return 'No data';
  var m = /^day-(\d+)$/.exec(status || '');
  if (m) {
    var n = parseInt(m[1], 10);
    if (n === 0) return 'Today';
    if (n === 1) return '1 day';
    return n + ' days';
  }
  return (CONFIG.statusLabels && CONFIG.statusLabels[status]) || status;
}

function statusSortValue(status) {
  if (!status || status === 'missing') return 1e9;
  var m = /^day-(\d+)$/.exec(status);
  return m ? Number(m[1]) : 1e8;
}

function collectStatusKeys(rows) {
  var seen = {};
  (rows || []).forEach(function (r) {
    if (r && r.status) seen[r.status] = true;
  });
  return Object.keys(seen).sort(function (a, b) {
    return statusSortValue(a) - statusSortValue(b);
  });
}

function statusLabelsFor(keys) {
  var labels = {};
  (keys || []).forEach(function (s) { labels[s] = statusLabel(s); });
  return labels;
}

function formatDisplayDate(d) {
  if (!d) return '—';
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function formatRelativeDays(days) {
  if (days == null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return days + ' days ago';
}

function median(values) {
  var nums = (values || []).filter(function (n) { return n != null && isFinite(n); }).slice();
  if (!nums.length) return null;
  nums.sort(function (a, b) { return a - b; });
  var mid = Math.floor(nums.length / 2);
  if (nums.length % 2) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

function readAggField(row, field, dims) {
  if (!row) return null;
  if (field && row[field] !== undefined && row[field] !== null && row[field] !== '') {
    return row[field];
  }
  var skip = {};
  (dims || []).forEach(function (d) { skip[d] = true; });
  var keys = Object.keys(row);
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (skip[k]) continue;
    if (field && String(k).toUpperCase() === String(field).toUpperCase()) return row[k];
  }
  return null;
}

function readMaxDate(row, dateField, dims) {
  var v = readAggField(row, dateField, dims);
  var d = parseDomoDate(v);
  if (d) return d;
  var keys = Object.keys(row || {});
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (/max/i.test(k) || (dateField && String(k).toUpperCase().indexOf(String(dateField).toUpperCase()) !== -1)) {
      d = parseDomoDate(row[k]);
      if (d) return d;
    }
    if (typeof row[k] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row[k])) {
      d = parseDomoDate(row[k]);
      if (d) return d;
    }
  }
  return null;
}

function readAggNumber(row, field, dims) {
  var v = readAggField(row, field, dims);
  var n = Number(v);
  if (isFinite(n) && n >= 0) return n;
  var skip = {};
  (dims || []).forEach(function (d) { skip[d] = true; });
  var k;
  for (k in row) {
    if (!Object.prototype.hasOwnProperty.call(row, k) || skip[k]) continue;
    if (/^count$/i.test(k) || /_count$/i.test(k)) {
      var cv = Number(row[k]);
      if (isFinite(cv) && cv >= 0) return cv;
    }
  }
  return 0;
}

function readPartitionName(row, partitionField, dims) {
  if (!row) return '';
  var v = readAggField(row, partitionField, dims);
  if (v != null && String(v).trim() !== '') return String(v).trim();
  var keys = Object.keys(row);
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (/partition|client/i.test(k) && row[k] != null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  for (i = 0; i < keys.length; i++) {
    var k2 = keys[i];
    if (/^(count|max|min|avg|sum)$/i.test(k2) || /_(count|max|min|avg|sum)$/i.test(k2)) continue;
    var val = row[k2];
    if (val == null || typeof val === 'number' || typeof val === 'boolean') continue;
    var s = String(val).trim();
    if (!s || /^\d+(\.\d+)?$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s)) continue;
    return s;
  }
  return '';
}

function slaNote() {
  return 'Status is the exact number of days since that partition’s last upload.';
}

/* ---- Schema probe + partition queries ---- */

async function trialUrl(url, label, timeoutMs) {
  var trialTimeout = timeoutMs != null ? timeoutMs : Math.min(CONFIG.queryTimeoutMs, 45000);
  return fetchQueryWithTimeout(url, label, trialTimeout);
}

function appendDataApiFields(url, fieldNames) {
  var seen = {};
  var out = [];
  (fieldNames || []).forEach(function (f) {
    var name = f != null ? String(f).trim() : '';
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push(name);
  });
  if (!out.length) return url;
  return url + '&fields=' + out.join(',');
}

function queryGroupFields(schema, opts) {
  opts = opts || {};
  var group = [];
  if (schema.partitionField) group.push(schema.partitionField);
  if (opts.year !== false && schema.yearField) group.push(schema.yearField);
  if (opts.campaign !== false && schema.campaignField) group.push(schema.campaignField);
  if (opts.campaign !== false && schema.campaignAltField && schema.campaignAltField !== schema.campaignField) {
    group.push(schema.campaignAltField);
  }
  return group;
}

function countQueryUrl(alias, group, countField, withFields, yearField) {
  var url = '/data/v1/' + alias +
    '?groupby=' + group.map(encodeURIComponent).join(',') +
    '&count=' + encodeURIComponent(countField) +
    '&limit=' + getDataQueryLimit();
  if (withFields) url = appendDataApiFields(url, group.concat([countField]));
  return appendCampaignYearFilter(url, yearField);
}

function maxQueryUrl(alias, group, dateField, withFields, yearField) {
  var url = '/data/v1/' + alias +
    '?groupby=' + group.map(encodeURIComponent).join(',') +
    '&max=' + encodeURIComponent(dateField) +
    '&limit=' + getDataQueryLimit();
  if (withFields) url = appendDataApiFields(url, group.concat([dateField]));
  return appendCampaignYearFilter(url, yearField);
}

function combinedQueryUrl(alias, group, countField, dateField, withFields, yearField) {
  var url = '/data/v1/' + alias +
    '?groupby=' + group.map(encodeURIComponent).join(',') +
    '&count=' + encodeURIComponent(countField);
  if (dateField) url += '&max=' + encodeURIComponent(dateField);
  url += '&limit=' + getDataQueryLimit();
  var fields = group.concat([countField]);
  if (dateField) fields.push(dateField);
  if (withFields) url = appendDataApiFields(url, fields);
  return appendCampaignYearFilter(url, yearField);
}

function pickExistingColumn(cols, candidates) {
  return firstMatchingColumn(cols, candidates);
}

async function probeDataset(def) {
  var alias = def.alias;
  var result = {
    alias: alias,
    label: def.label,
    short: def.short,
    ok: false,
    columns: [],
    partitionField: null,
    dateField: null,
    dateCandidates: [],
    countField: null,
    yearField: null,
    campaignField: null,
    campaignAltField: null,
    appendFields: def.appendFields === true,
    useCount: true,
    error: null
  };
  try {
    var probe = await trialUrl('/data/v1/' + alias + '?limit=1', alias + ' probe', 30000);
    var cols = (!probe.error && probe.rows[0]) ? Object.keys(probe.rows[0]) : [];
    result.columns = cols;
    if (CONFIG.debugLogColumns !== false) {
      console.log('[3E-QA][diag]', alias, 'sample columns (' + cols.length + '):', cols.length ? cols.join(', ') : '(none)');
      if (probe.error) console.warn('[3E-QA][diag]', alias, 'limit=1 probe:', formatQueryError(probe.error));
    }
    if (!cols.length) {
      result.error = alias + ' returned no sample columns.';
      return result;
    }

    result.partitionField = pickExistingColumn(cols, def.partitionCandidates);
    if (!result.partitionField) {
      var i;
      for (i = 0; i < cols.length; i++) {
        if (/partition/i.test(cols[i])) {
          result.partitionField = cols[i];
          break;
        }
      }
    }
    result.countField = pickExistingColumn(cols, def.countCandidates);
    result.yearField = pickExistingColumn(cols, def.yearCandidates);
    result.campaignField = pickExistingColumn(cols, def.campaignCandidates);
    result.campaignAltField = null;
    (def.campaignCandidates || []).forEach(function (name) {
      var hit = findColumnNameCI(cols, name);
      if (hit && hit !== result.campaignField && !result.campaignAltField) result.campaignAltField = hit;
    });
    result.dateCandidates = (def.dateCandidates || []).map(function (name) {
      return findColumnNameCI(cols, name);
    }).filter(Boolean);
    result.dateField = result.dateCandidates[0] || null;
    result.ok = !!(result.partitionField && result.countField);

    if (!result.ok) {
      result.error = alias + ' is missing a usable partition/count column ' +
        '(partition=' + (result.partitionField || '—') +
        ', count=' + (result.countField || '—') + ').';
      return result;
    }
    console.log('[3E-QA][diag]', alias, 'using', {
      partition: result.partitionField,
      count: result.countField,
      date: result.dateField || 'none',
      year: result.yearField || 'none',
      campaign: result.campaignField || 'none',
      campaignAlt: result.campaignAltField || 'none'
    });
    return result;
  } catch (err) {
    result.error = formatQueryError(err);
    return result;
  }
}

function rowKey(name, year, campaignName) {
  return String(name) + '\0' + String(year || '') + '\0' + String(campaignName || '');
}

function readGroupedYear(row, schema, dims) {
  if (row && row.year != null && String(row.year).trim() !== '') return normalizeCampaignYear(row.year);
  if (!schema || !schema.yearField) return '';
  return normalizeCampaignYear(readAggField(row, schema.yearField, dims));
}

function readGroupedCampaignName(row, schema, dims) {
  var primary = '';
  var alt = '';
  if (row && row.campaignName != null && String(row.campaignName).trim() !== '') {
    primary = row.campaignName;
  } else if (schema && schema.campaignField) {
    primary = readAggField(row, schema.campaignField, dims);
  }
  if (schema && schema.campaignAltField) {
    alt = readAggField(row, schema.campaignAltField, dims);
  }
  return resolveCampaignName(primary, alt);
}

async function fetchDatasetPartitionsSqlFast(schema, timeoutMs) {
  if (!schema || !schema.fromPreferred || !schema.partitionField || !schema.countField) return null;
  timeoutMs = timeoutMs || CONFIG.sqlFastTimeoutMs || 45000;
  var dateField = schema.dateField || (schema.dateCandidates && schema.dateCandidates[0]) || null;
  var savedAlt = schema.campaignAltField;
  var fromExprs = [schema.alias, '{alias}'];
  var i;
  for (i = 0; i < fromExprs.length; i++) {
    schema.campaignAltField = null;
    var sql = partitionSql(schema, dateField, false, fromExprs[i]);
    var res = await fetchSqlPromise(schema.alias, sql, schema.alias + ' SQL (fast)', timeoutMs);
    if (!res.error) {
      var rows = mapSqlPartitionRows(res.parsed, schema);
      if (rows.length) {
        schema.campaignAltField = savedAlt;
        if (dateField) schema.dateField = dateField;
        return {
          alias: schema.alias,
          rows: rows,
          dims: queryGroupFields(schema),
          error: null,
          preparsed: true,
          via: 'sql-fast'
        };
      }
    }
    sql = partitionSql(schema, dateField, true, fromExprs[i]);
    res = await fetchSqlPromise(schema.alias, sql, schema.alias + ' SQL (fast)', timeoutMs);
    if (!res.error) {
      rows = mapSqlPartitionRows(res.parsed, schema);
      if (rows.length) {
        schema.campaignAltField = savedAlt;
        if (dateField) schema.dateField = dateField;
        return {
          alias: schema.alias,
          rows: rows,
          dims: queryGroupFields(schema),
          error: null,
          preparsed: true,
          via: 'sql-fast'
        };
      }
    }
  }
  schema.campaignAltField = savedAlt;
  return null;
}

async function fetchDatasetPartitionsSql(schema) {
  var timeoutMs = CONFIG.queryTimeoutMs;
  var dateFields = [];
  if (schema.dateField) dateFields.push(schema.dateField);
  (schema.dateCandidates || []).forEach(function (d) {
    if (d && dateFields.indexOf(d) < 0) dateFields.push(d);
  });
  if (!dateFields.length) dateFields.push(null);
  var fromExprs = ['{alias}'];
  if (schema.alias && fromExprs.indexOf(schema.alias) < 0) fromExprs.push(schema.alias);
  var f;
  var d;
  var t;
  for (f = 0; f < fromExprs.length; f++) {
    var fromWorked = false;
    for (d = 0; d < dateFields.length; d++) {
      var tries = [false];
      if (schema.yearField) tries.push(true);
      var dateErrored = false;
      for (t = 0; t < tries.length; t++) {
        var sql = partitionSql(schema, dateFields[d], tries[t], fromExprs[f]);
        var res = await fetchSqlPromise(schema.alias, sql, schema.alias + ' SQL', timeoutMs);
        if (res.error && schema.campaignAltField) {
          schema.campaignAltField = null;
          sql = partitionSql(schema, dateFields[d], tries[t], fromExprs[f]);
          res = await fetchSqlPromise(schema.alias, sql, schema.alias + ' SQL', timeoutMs);
        }
        if (res.error) {
          if (/timed out/i.test(formatQueryError(res.error))) return null;
          dateErrored = true;
          break;
        }
        fromWorked = true;
        var rows = mapSqlPartitionRows(res.parsed, schema);
        if (!rows.length) {
          console.warn('[3E-QA]', schema.alias, 'SQL returned 0 grouped rows');
          continue;
        }
        if (dateFields[d]) schema.dateField = dateFields[d];
        return {
          alias: schema.alias,
          rows: rows,
          dims: queryGroupFields(schema),
          error: null,
          preparsed: true,
          via: 'sql'
        };
      }
      if (fromWorked) break;
      if (!dateErrored) break;
    }
    if (fromWorked) break;
  }
  return null;
}

function mapDataApiPartitionRows(countRows, dateMap, schema, group) {
  return (countRows || []).map(function (row) {
    var name = readPartitionName(row, schema.partitionField, group);
    var year = readGroupedYear(row, schema, group);
    var campaignName = readGroupedCampaignName(row, schema, group);
    var rec = {
      name: name,
      year: year,
      campaignName: campaignName,
      records: readAggNumber(row, schema.countField, group),
      lastDate: dateMap[rowKey(name, year, campaignName)] || readMaxDate(row, schema.dateField, group)
    };
    rec._raw = row;
    return rec;
  }).filter(function (rec) {
    if (!rec.name) return false;
    if (schema.yearField && !campaignYearIsKept(rec.year, rec.campaignName)) return false;
    return true;
  });
}

async function fetchDatasetPartitionsDataApi(schema) {
  var timeoutMs = CONFIG.queryTimeoutMs;
  var maxPages = typeof CONFIG.chartPaginationMaxPages === 'number' ? CONFIG.chartPaginationMaxPages : 3;
  var withFields = schema.appendFields === true;
  var group = queryGroupFields(schema);
  var yearFilterField = schema.yearField || null;
  var dateField = schema.dateField || (schema.dateCandidates && schema.dateCandidates[0]) || null;

  var combinedUrl = combinedQueryUrl(schema.alias, group, schema.countField, dateField, withFields, yearFilterField);
  var combinedRes = await fetchPagedQuery(combinedUrl, schema.alias + ' count+max', timeoutMs, maxPages);
  if (!combinedRes.error && combinedRes.rows && combinedRes.rows.length) {
    var combinedRows = mapDataApiPartitionRows(combinedRes.rows, {}, schema, group);
    if (combinedRows.length) {
      console.log('[3E-QA]', schema.alias, 'combined Data API partitions:', combinedRows.length);
      return { alias: schema.alias, rows: combinedRows, dims: group, error: null, preparsed: true, via: 'data-combined' };
    }
  }

  var countUrl = countQueryUrl(schema.alias, group, schema.countField, withFields, yearFilterField);
  var dateUrl = dateField ? maxQueryUrl(schema.alias, group, dateField, withFields, yearFilterField) : null;
  var pair = await Promise.all([
    fetchPagedQuery(countUrl, schema.alias + ' counts', timeoutMs, maxPages),
    dateUrl
      ? fetchPagedQuery(dateUrl, schema.alias + ' dates ' + dateField, timeoutMs, maxPages)
      : Promise.resolve({ rows: [], error: null })
  ]);
  var countRes = pair[0];
  var dateRes = pair[1];
  if (countRes.error) {
    return {
      alias: schema.alias,
      rows: [],
      dims: [schema.partitionField],
      error: formatQueryError(countRes.error)
    };
  }

  var dateMap = {};
  if (!dateRes.error) {
    (dateRes.rows || []).forEach(function (row) {
      var name = readPartitionName(row, schema.partitionField, group);
      if (!name) return;
      var year = readGroupedYear(row, schema, group);
      var campaignName = readGroupedCampaignName(row, schema, group);
      if (schema.yearField && !campaignYearIsKept(year, campaignName)) return;
      var date = readMaxDate(row, dateField, group);
      if (!date) return;
      var key = rowKey(name, year, campaignName);
      if (!dateMap[key] || date > dateMap[key]) dateMap[key] = date;
    });
  }

  var rows = mapDataApiPartitionRows(countRes.rows, dateMap, schema, group);
  console.log('[3E-QA]', schema.alias, 'Data API partitions:', rows.length);
  return { alias: schema.alias, rows: rows, dims: group, error: null, preparsed: true, via: 'data-parallel' };
}

async function fetchDatasetPartitions(schema) {
  var started = Date.now();
  var fastMs = CONFIG.sqlFastTimeoutMs || 45000;
  if (schema.fromPreferred) {
    var fastPack = await fetchDatasetPartitionsSqlFast(schema, fastMs);
    if (fastPack && fastPack.rows && fastPack.rows.length) {
      console.log('[3E-QA]', schema.alias, 'loaded via fast SQL in', Date.now() - started, 'ms');
      return fastPack;
    }
    var dataEarly = await fetchDatasetPartitionsDataApi(schema);
    if (dataEarly.rows && dataEarly.rows.length) {
      console.log('[3E-QA]', schema.alias, 'loaded via Data API in', Date.now() - started, 'ms');
      return dataEarly;
    }
  }
  if (schema.alias !== 'leads') {
    var sqlPack = await fetchDatasetPartitionsSql(schema);
    if (sqlPack && sqlPack.rows && sqlPack.rows.length) {
      console.log('[3E-QA]', schema.alias, 'loaded via SQL in', Date.now() - started, 'ms');
      return sqlPack;
    }
  }
  var dataPack = await fetchDatasetPartitionsDataApi(schema);
  console.log('[3E-QA]', schema.alias, 'loaded via Data API in', Date.now() - started, 'ms');
  return dataPack;
}

async function loadAllPartitionData() {
  var defs = CONFIG.datasets || [];
  var schemas = [];
  var packs = [];
  var warnings = [];
  SCHEMA = {};
  var i;
  for (i = 0; i < defs.length; i++) {
    var def = defs[i];
    setLoaderProgress(16 + i * 18, 'Loading ' + (def.label || def.alias) + '…');
    var schema = schemaFromDef(def);
    if (!schema.ok) schema = await probeDataset(def);
    SCHEMA[schema.alias] = schema;
    schemas.push(schema);
    if (!schema.ok) {
      warnings.push((schema.label || schema.alias) + ': ' + (schema.error || 'unavailable'));
      continue;
    }
    var pack = await fetchDatasetPartitions(schema);
    if ((!pack.rows || !pack.rows.length) && schema.fromPreferred) {
      console.warn('[3E-QA]', schema.alias, 'preferred columns returned no rows; probing schema');
      schema = await probeDataset(def);
      SCHEMA[schema.alias] = schema;
      schemas[schemas.length - 1] = schema;
      if (schema.ok) pack = await fetchDatasetPartitions(schema);
    }
    packs.push(pack);
    if (pack.error) warnings.push((schema.label || schema.alias) + ': ' + pack.error);
    if (pack.rows && pack.rows.length) break;
    if (!pack.error) warnings.push((schema.label || schema.alias) + ': 0 partition rows');
  }
  var raw = { packs: {}, warnings: warnings };
  packs.forEach(function (p) {
    raw.packs[p.alias] = p;
  });
  var parsed = 0;
  var ignored = 0;
  packs.forEach(function (p) {
    (p.rows || []).forEach(function (row) {
      parsed += 1;
      if (isIgnoredPartition(row.name)) ignored += 1;
    });
  });
  if (!parsed) {
    var schemaNotes = schemas.map(function (s) {
      return (s.label || s.alias) + ': partition=' + (s.partitionField || '—') +
        ' count=' + (s.countField || '—') +
        ' date=' + (s.dateField || '—') +
        (s.error ? ' (' + s.error + ')' : '');
    });
    throw new Error(
      'Connected to Domo, but no partition names came back.\n' +
      schemaNotes.concat(raw.warnings).join('\n') +
      '\nOpen the browser console (F12) and filter for [3E-QA].'
    );
  }
  if (parsed === ignored) {
    raw.warnings.push('Every returned partition name started with ' + CONFIG.ignorePartitionPrefix + ' and was hidden.');
  }
  return raw;
}

/* ---- Transform ---- */

function emptyFilterOptions() {
  return { year: [], campaign: [], partition: [], status: [], statusLabels: {} };
}

function collectYears(raw) {
  var years = {};
  Object.keys(raw.packs || {}).forEach(function (alias) {
    var pack = raw.packs[alias];
    (pack && pack.rows || []).forEach(function (row) {
      var name = row.name || readPartitionName(row, SCHEMA[alias] && SCHEMA[alias].partitionField, pack.dims);
      if (isIgnoredPartition(name)) return;
      var y = row.year != null
        ? normalizeCampaignYear(row.year)
        : (SCHEMA[alias] && SCHEMA[alias].yearField ? normalizeCampaignYear(row[SCHEMA[alias].yearField]) : '');
      var camp = row.campaignName != null
        ? resolveCampaignName(row.campaignName)
        : (SCHEMA[alias] ? readGroupedCampaignName(row, SCHEMA[alias], pack.dims) : '');
      if (y && campaignYearIsKept(y, camp)) years[y] = true;
    });
  });
  var minY = CONFIG.minCampaignYear ? normalizeCampaignYear(CONFIG.minCampaignYear) : '';
  return Object.keys(years).filter(function (y) {
    return !minY || y >= minY;
  }).sort();
}

function collectCampaignNames(raw) {
  var names = {};
  Object.keys(raw.packs || {}).forEach(function (alias) {
    var pack = raw.packs[alias];
    (pack && pack.rows || []).forEach(function (row) {
      var part = row.name || readPartitionName(row, SCHEMA[alias] && SCHEMA[alias].partitionField, pack.dims);
      if (isIgnoredPartition(part)) return;
      var y = row.year != null
        ? normalizeCampaignYear(row.year)
        : (SCHEMA[alias] && SCHEMA[alias].yearField ? normalizeCampaignYear(row[SCHEMA[alias].yearField]) : '');
      var n = row.campaignName != null
        ? resolveCampaignName(row.campaignName)
        : readGroupedCampaignName(row, SCHEMA[alias], pack.dims);
      if (y && !campaignYearIsKept(y, n)) return;
      if (n) names[n] = true;
    });
  });
  return Object.keys(names).sort(function (a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}

function collectPartitionNames(raw) {
  var names = {};
  Object.keys(raw.packs || {}).forEach(function (alias) {
    var pack = raw.packs[alias];
    (pack && pack.rows || []).forEach(function (row) {
      var n = row.name || readPartitionName(row, SCHEMA[alias] && SCHEMA[alias].partitionField, pack.dims);
      if (!n || isIgnoredPartition(n)) return;
      var y = row.year != null
        ? normalizeCampaignYear(row.year)
        : (SCHEMA[alias] && SCHEMA[alias].yearField ? normalizeCampaignYear(row[SCHEMA[alias].yearField]) : '');
      var camp = row.campaignName != null
        ? resolveCampaignName(row.campaignName)
        : readGroupedCampaignName(row, SCHEMA[alias], pack.dims);
      if (y && !campaignYearIsKept(y, camp)) return;
      names[n] = true;
    });
  });
  return Object.keys(names).sort(function (a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}

function resolvePrimaryPack(raw) {
  var preferred = CONFIG.primaryAlias || 'leads';
  var packs = raw.packs || {};
  function usable(alias) {
    return packs[alias] && packs[alias].rows && packs[alias].rows.length;
  }
  if (usable(preferred)) {
    return { alias: preferred, pack: packs[preferred], schema: SCHEMA[preferred] };
  }
  var keys = Object.keys(packs);
  var i;
  for (i = 0; i < keys.length; i++) {
    if (usable(keys[i])) {
      return { alias: keys[i], pack: packs[keys[i]], schema: SCHEMA[keys[i]] };
    }
  }
  if (packs[preferred]) return { alias: preferred, pack: packs[preferred], schema: SCHEMA[preferred] };
  if (keys[0]) return { alias: keys[0], pack: packs[keys[0]], schema: SCHEMA[keys[0]] };
  return null;
}

function buildPartitionRows(raw) {
  var resolved = resolvePrimaryPack(raw);
  if (!resolved || !resolved.pack) return [];
  var pack = resolved.pack;
  var schema = resolved.schema || {};
  var now = new Date();
  var seen = {};
  (pack.rows || []).forEach(function (row) {
    var name = row.name || readPartitionName(row, schema.partitionField, pack.dims);
    if (!name || isIgnoredPartition(name)) return;
    var year = row.year != null
      ? normalizeCampaignYear(row.year)
      : readGroupedYear(row, schema, pack.dims);
    var campaignName = resolveCampaignName(
      row.campaignName != null ? row.campaignName : readGroupedCampaignName(row, schema, pack.dims)
    );
    if (schema.yearField && !campaignYearIsKept(year, campaignName)) return;
    var key = rowKey(name, year, campaignName);
    var date = parseDomoDate(row.lastDate);
    if (!date && row._raw && schema.dateField) {
      date = readMaxDate(row._raw, schema.dateField, pack.dims);
    } else if (!date && schema.dateField) {
      date = readMaxDate(row, schema.dateField, pack.dims);
    }
    var count = row.records != null ? Number(row.records) || 0 : readAggNumber(row._raw || row, schema.countField, pack.dims);
    if (!seen[key]) {
      seen[key] = {
        name: name,
        year: year,
        campaignName: campaignName,
        campaign: formatCampaignLabel(year, campaignName),
        lastDate: date,
        records: count,
        source: resolved.alias
      };
    } else {
      seen[key].records += count;
      if (date && (!seen[key].lastDate || date > seen[key].lastDate)) seen[key].lastDate = date;
    }
  });
  return Object.keys(seen).map(function (k) {
    var rec = seen[k];
    rec.days = daysSince(rec.lastDate, now);
    rec.status = statusForDays(rec.days);
    rec.campaign = formatCampaignLabel(rec.year, rec.campaignName);
    rec.programLifecycle = recProgramLifecycle(rec);
    return rec;
  });
}

function getCheckedValues(containerId) {
  var el = $(containerId);
  if (!el) return [];
  var out = [];
  el.querySelectorAll('.filter-check-input:checked').forEach(function (inp) {
    out.push(inp.value);
  });
  return out;
}

function checklistIsAllSelected(containerId, selected) {
  var el = $(containerId);
  if (!el) return true;
  var total = el.querySelectorAll('.filter-check-input').length;
  if (!total) return true;
  return !selected || !selected.length || selected.length === total;
}

function weekFilterList() {
  return (CONFIG.weekFilters || []).slice();
}

function weekFilterById(id) {
  var list = weekFilterList();
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function weekFilterIds() {
  return weekFilterList().map(function (w) { return w.id; });
}

function weekFilterLabels() {
  var labels = {};
  weekFilterList().forEach(function (w) { labels[w.id] = w.label; });
  return labels;
}

function recMatchesWeekIds(rec, weekIds) {
  if (!weekIds || !weekIds.length) return true;
  var i;
  for (i = 0; i < weekIds.length; i++) {
    var b = weekFilterById(weekIds[i]);
    if (!b) continue;
    if (b.missing) {
      if (rec.days == null) return true;
      continue;
    }
    if (rec.days == null) continue;
    if (b.max == null) {
      if (rec.days >= b.min) return true;
    } else if (rec.days >= b.min && rec.days <= b.max) {
      return true;
    }
  }
  return false;
}

function getActiveDatePreset() {
  var btn = document.querySelector('.date-preset.active');
  return btn ? (btn.getAttribute('data-date-preset') || 'any') : 'any';
}

function getActiveFilters() {
  var campaigns = getCheckedValues('filter-campaign');
  var years = getCheckedValues('filter-year');
  var partitions = getCheckedValues('filter-partition');
  var statuses = getCheckedValues('filter-status');
  var weeks = getCheckedValues('filter-weeks');
  var fromEl = $('filter-date-from');
  var toEl = $('filter-date-to');
  return {
    campaigns: campaigns,
    years: years,
    partitions: partitions,
    statuses: statuses,
    weeks: weeks,
    dateFromRaw: fromEl ? fromEl.value : '',
    dateToRaw: toEl ? toEl.value : '',
    dateFrom: fromEl && fromEl.value ? parseInputDate(fromEl.value) : null,
    dateTo: toEl && toEl.value ? parseInputDate(toEl.value) : null,
    datePreset: getActiveDatePreset()
  };
}

function matchesDateFilter(rec, filters) {
  if (filters.datePreset === 'missing') return rec.lastDate == null;
  if (!rec.lastDate) {
    if (filters.dateFrom || filters.dateTo) return false;
    return filters.datePreset === 'any' || !filters.datePreset;
  }
  var day = startOfDay(rec.lastDate);
  if (filters.dateFrom && day < startOfDay(filters.dateFrom)) return false;
  if (filters.dateTo && day > startOfDay(filters.dateTo)) return false;
  return true;
}

function matchesPanelFilters(rec, filters) {
  if (!rec) return false;
  if (!checklistIsAllSelected('filter-campaign', filters.campaigns)) {
    if (filters.campaigns.indexOf(rec.campaignName) === -1) return false;
  }
  if (!checklistIsAllSelected('filter-year', filters.years)) {
    if (filters.years.indexOf(rec.year) === -1) return false;
  }
  if (!checklistIsAllSelected('filter-partition', filters.partitions)) {
    if (filters.partitions.indexOf(rec.name) === -1) return false;
  }
  if (!checklistIsAllSelected('filter-weeks', filters.weeks)) {
    if (!recMatchesWeekIds(rec, filters.weeks)) return false;
  }
  if (!checklistIsAllSelected('filter-status', filters.statuses)) {
    if (filters.statuses.indexOf(rec.status) === -1) return false;
  }
  if (!matchesDateFilter(rec, filters)) return false;
  return true;
}

function matchesRosterView(rec, rosterQuery) {
  var q = (rosterQuery != null ? rosterQuery : ROSTER_SEARCH) || '';
  q = String(q).trim().toLowerCase();
  if (!q) return true;
  var label = (rec.campaign || formatCampaignLabel(rec.year, rec.campaignName)).toLowerCase();
  var life = programLifecycleLabel(rec.programLifecycle).toLowerCase();
  return rec.name.toLowerCase().indexOf(q) !== -1 ||
    String(rec.campaignName || '').toLowerCase().indexOf(q) !== -1 ||
    String(rec.year || '').toLowerCase().indexOf(q) !== -1 ||
    label.indexOf(q) !== -1 ||
    (life && life.indexOf(q) !== -1);
}

function uniqueSortedNames(values) {
  var seen = {};
  (values || []).forEach(function (v) {
    var s = v == null ? '' : String(v).trim();
    if (s) seen[s] = true;
  });
  return Object.keys(seen).sort(function (a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}

function transformLiveData(raw, filters) {
  filters = filters || getActiveFilters();
  var all = buildPartitionRows(raw).filter(function (rec) {
    return recMatchesProgramTab(rec);
  });
  all.sort(function (a, b) {
    var da = a.days == null ? -1 : a.days;
    var db = b.days == null ? -1 : b.days;
    return db - da;
  });

  var visible = all.filter(function (rec) {
    return matchesPanelFilters(rec, filters);
  });

  var statusKeys = collectStatusKeys(all);
  var counts = { total: visible.length };
  statusKeys.forEach(function (s) { counts[s] = 0; });
  var dayValues = [];
  visible.forEach(function (rec) {
    counts[rec.status] = (counts[rec.status] || 0) + 1;
    if (rec.days != null) dayValues.push(rec.days);
  });

  var freshCount = 0;
  visible.forEach(function (rec) {
    if (rec.days != null && rec.days <= 7) freshCount += 1;
  });
  var onTimePct = counts.total ? Math.round((freshCount / counts.total) * 100) : 0;
  var lateCount = 0;
  visible.forEach(function (rec) {
    if (rec.days != null && rec.days > 56) lateCount += 1;
  });

  return {
    filters: filters,
    filterOptions: {
      year: uniqueSortedNames(all.map(function (r) { return r.year; })),
      campaign: uniqueSortedNames(all.map(function (r) { return r.campaignName; })),
      partition: uniqueSortedNames(all.map(function (r) { return r.name; })),
      status: statusKeys,
      statusLabels: statusLabelsFor(statusKeys)
    },
    all: all,
    visible: visible,
    counts: counts,
    onTimePct: onTimePct,
    lateCount: lateCount,
    medianDays: median(dayValues),
    warnings: raw.warnings || []
  };
}

/* ---- Charts ---- */

function setDefaults() {
  if (typeof Chart === 'undefined') return;
  syncChartPalette();
  Chart.defaults.font.family = "'Roboto', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = C.muted;
  Chart.defaults.animation.duration = 0;
  Chart.defaults.resizeDelay = 200;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = C.tooltipBg;
  Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
  Chart.defaults.plugins.tooltip.bodyColor = '#FFFFFF';
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.plugins.tooltip.padding = { top: 7, bottom: 7, left: 10, right: 10 };
}

function destroyCharts() {
  Object.keys(charts).forEach(function (k) {
    if (charts[k] && charts[k].destroy) charts[k].destroy();
  });
  charts = {};
}

function getOnTimeBandColors() {
  return [C.r1, C.r3, C.r2];
}

function createSemicircleBandGauge(canvasId, value, opts) {
  opts = opts || {};
  var el = $(canvasId);
  if (!el || typeof Chart === 'undefined') return null;
  var bands = opts.bands || CONFIG.onTimeGaugeBands || { lowMax: 70, midMax: 90 };
  var t1 = bands.lowMax != null ? bands.lowMax : 70;
  var t2 = bands.midMax != null ? bands.midMax : 90;
  var needlePct = Math.max(0, Math.min(Number(value) || 0, 100));
  var displayVal = opts.displayValue != null ? opts.displayValue : Math.round(Number(value) || 0);
  var segLow = t1;
  var segMid = t2 - t1;
  var segHigh = 100 - t2;
  var bandColors = opts.bandColors || getOnTimeBandColors();
  var borderW = opts.borderWidth != null ? opts.borderWidth : 3;

  return new Chart(el, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [segLow, segMid, segHigh],
        backgroundColor: bandColors,
        borderWidth: borderW,
        borderColor: C.card,
        spacing: 0
      }]
    },
    options: {
      rotation: -90,
      circumference: 180,
      cutout: '74%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    },
    plugins: [{
      id: 'needle',
      afterDraw: function (chart) {
        var meta = chart.getDatasetMeta(0);
        if (!meta.data || !meta.data[0]) return;
        var arc = meta.data[0];
        var angle = -Math.PI / 2 + (Math.PI * needlePct / 100);
        var ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.arc(arc.x, arc.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = C.r1;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(arc.x, arc.y);
        ctx.lineTo(arc.x + (arc.outerRadius - 6) * Math.cos(angle), arc.y + (arc.outerRadius - 6) * Math.sin(angle));
        ctx.strokeStyle = C.r1;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        if (opts.showValueLabel !== false) {
          var a = chart.chartArea;
          var cx = (a.left + a.right) / 2;
          ctx.font = "900 18px 'Archivo',sans-serif";
          ctx.fillStyle = C.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(displayVal + '%', cx, a.bottom);
        }
        ctx.restore();
      }
    }]
  });
}

function createStatusMixChart(data) {
  var el = $('chart-status-mix');
  if (!el || typeof Chart === 'undefined') return null;
  var labels = [];
  var values = [];
  var colors = [];
  CONFIG.statusOrder.forEach(function (s) {
    labels.push(statusLabel(s));
    values.push(data.counts[s] || 0);
    colors.push(statusColor(s));
  });
  return new Chart(el, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: C.card }]
    },
    options: {
      cutout: '62%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { boxWidth: 10, boxHeight: 10, padding: 10, color: C.text, font: { size: 11, weight: '600' } }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var n = ctx.raw || 0;
              var tot = data.counts.total || 0;
              var pct = tot ? Math.round((n / tot) * 100) : 0;
              return ' ' + n + '  (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

function createAgeBucketChart(data) {
  var el = $('chart-age-buckets');
  if (!el || typeof Chart === 'undefined') return null;
  var labels = data.buckets.map(function (b) { return b.label; });
  var values = data.buckets.map(function (b) { return b.value; });
  var colors = [C.r2, C.r3, C.r1, C.cat5, C.unknownStack, C.cat7];
  return new Chart(el, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 28 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: C.muted, font: { size: 10, weight: '600' } } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: C.muted },
          grid: { color: C.grid, drawBorder: false }
        }
      },
      plugins: {
        tooltip: {
          callbacks: { label: function (ctx) { return ' ' + ctx.raw + ' partitions'; } }
        }
      }
    }
  });
}

function createOldestChart(data) {
  var el = $('chart-oldest');
  if (!el || typeof Chart === 'undefined') return null;
  var rows = (data.oldest || []).slice().reverse();
  var labels = rows.map(function (r) { return r.name; });
  var values = rows.map(function (r) { return r.days; });
  var colors = rows.map(function (r) { return statusColor(r.status); });
  return new Chart(el, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 18 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: 'Days since last upload', color: C.muted, font: { size: 10, weight: '600' } },
          ticks: { precision: 0, color: C.muted },
          grid: { color: C.grid, drawBorder: false }
        },
        y: { grid: { display: false }, ticks: { color: C.text, font: { size: 11, weight: '600' } } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var rec = rows[ctx.dataIndex];
              return ' ' + ctx.raw + ' days · ' + formatDisplayDate(rec && rec.lastDate);
            }
          }
        }
      }
    }
  });
}

function kpiTrendHtml(pill, label) {
  if (!pill && !label) return '';
  var html = '';
  if (pill) html += '<span class="kpi-trend-pill">' + escapeHtml(pill) + '</span>';
  if (label) html += '<span class="kpi-trend-label">' + escapeHtml(label) + '</span>';
  return html;
}

function renderKpis(data) {
  var totalEl = $('kpi-total');
  if (totalEl) totalEl.textContent = String(data.counts.total);

  var medEl = $('kpi-median');
  if (medEl) {
    medEl.textContent = data.medianDays == null ? '—' : String(Math.round(data.medianDays * 10) / 10);
  }

  var lateEl = $('kpi-late');
  if (lateEl) lateEl.textContent = String(data.lateCount);
  var lateNote = $('kpi-late-note');
  if (lateNote) {
    lateNote.innerHTML = kpiTrendHtml(
      String(data.counts['days-15-28'] || 0) + ' at 15–28 days',
      (data.counts.missing || 0) + ' with no date'
    );
  }

  var otEl = $('kpi-ontime');
  if (otEl) otEl.textContent = data.onTimePct + '%';
}

function statusChip(status) {
  return '<span class="status-chip ' + statusChipClass(status) + '">' +
    escapeHtml(statusLabel(status)) + '</span>';
}

function programLifecycleLabel(life) {
  if (life === 'active') return 'Active';
  if (life === 'development') return 'Development';
  if (life === 'inactive') return 'Inactive';
  if (life === 'unmapped') return 'Unmapped';
  return '';
}

function programLifecycleChip(life) {
  var label = programLifecycleLabel(life);
  if (!label) return '';
  return '<span class="qa-program-pill qa-program-pill--' + escapeHtml(life) + '">' +
    escapeHtml(label) + '</span>';
}

function sortRoster(rows) {
  var key = SORT_KEY;
  var dir = SORT_DIR === 'asc' ? 1 : -1;
  return rows.slice().sort(function (a, b) {
    var av;
    var bv;
    if (key === 'name') {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    }
    if (key === 'campaign') {
      av = String(a.campaign || formatCampaignLabel(a.year, a.campaignName)).toLowerCase();
      bv = String(b.campaign || formatCampaignLabel(b.year, b.campaignName)).toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    }
    if (key === 'status') {
      return (statusSortValue(a.status) - statusSortValue(b.status)) * dir;
    }
    if (key === 'date') {
      av = a.lastDate ? a.lastDate.getTime() : 0;
      bv = b.lastDate ? b.lastDate.getTime() : 0;
      return (av - bv) * dir;
    }
    if (key === 'records') {
      return ((a.records || 0) - (b.records || 0)) * dir;
    }
    av = a.days == null ? -1 : a.days;
    bv = b.days == null ? -1 : b.days;
    return (av - bv) * dir;
  });
}

function renderRosterTable(data) {
  var body = $('roster-table-body');
  if (!body) return;
  var q = ROSTER_SEARCH;
  var rows = (data.visible || []).filter(function (rec) {
    return matchesRosterView(rec, q);
  });
  rows = sortRoster(rows);
  var countEl = $('roster-count');
  if (countEl) {
    countEl.textContent = rows.length + ' of ' + (data.visible || []).length + ' rows';
  }
  if (!rows.length) {
    var emptyMsg = (data.all && data.all.length)
      ? 'No partitions match the current filters.'
      : 'No partitions loaded. Open the yellow notice above, or press F12 and look for [3E-QA] logs.';
    body.innerHTML = '<tr><td class="qa-empty" colspan="5">' + emptyMsg + '</td></tr>';
    if (isQaDetailOpen()) refreshQaClientDetail();
    return;
  }
  body.innerHTML = rows.map(function (rec) {
    var attn = (rec.days == null || rec.days > 13) ? ' is-attention' : '';
    var id = qaRecId(rec);
    var selected = id && id === SELECTED_QA_REC_ID ? ' is-selected' : '';
    return '<tr class="row-clickable' + attn + selected + '" tabindex="0" data-qa-rec="' + escapeHtml(id) + '" aria-label="Open client details for ' + escapeHtml(rec.name) + '">' +
      '<td class="qa-name">' + escapeHtml(rec.name) + '</td>' +
      '<td><div class="qa-campaign-cell">' +
        '<span>' + escapeHtml(rec.campaign || formatCampaignLabel(rec.year, rec.campaignName) || '—') + '</span>' +
        programLifecycleChip(rec.programLifecycle) +
      '</div></td>' +
      '<td>' + escapeHtml(formatDisplayDate(rec.lastDate)) + '</td>' +
      '<td>' + statusChip(rec.status) + '</td>' +
      '<td class="qa-num">' + (rec.records ? rec.records.toLocaleString() : '—') + '</td>' +
    '</tr>';
  }).join('');
  if (isQaDetailOpen()) refreshQaClientDetail();
}

function qaRecId(rec) {
  if (!rec) return '';
  return [rec.name || '', rec.year || '', rec.campaignName || ''].map(function (part) {
    return encodeURIComponent(String(part));
  }).join('|');
}

function findQaRecById(id) {
  if (!id || !LAST_DASH_DATA) return null;
  var lists = [LAST_DASH_DATA.visible || [], LAST_DASH_DATA.all || []];
  var i;
  var j;
  var rec;
  for (i = 0; i < lists.length; i++) {
    for (j = 0; j < lists[i].length; j++) {
      rec = lists[i][j];
      if (qaRecId(rec) === id) return rec;
    }
  }
  return null;
}

function qaDetailDl(items) {
  if (!items || !items.length) return '<p class="detail-empty">—</p>';
  return '<dl class="detail-dl">' + items.map(function (item) {
    return '<div class="detail-dl-row"><dt>' + escapeHtml(item.label) + '</dt><dd>' + item.html + '</dd></div>';
  }).join('') + '</dl>';
}

function qaDetailSection(title, innerHtml) {
  return '<section class="detail-section"><h3 class="detail-section-title">' + escapeHtml(title) + '</h3>' + innerHtml + '</section>';
}

function formatQaFieldDate(v) {
  var d = parseDomoDate(v);
  if (d) return formatDisplayDate(d);
  var s = String(v == null ? '' : v).trim();
  return s || '—';
}

function qaDashboardLaunchHtml(firstActivity) {
  var Join = window.OpsJoin;
  if (Join && Join.dashboardAvailabilityDate && Join.formatAvailabilityDate) {
    return Join.formatAvailabilityDate(Join.dashboardAvailabilityDate(firstActivity));
  }
  var d = parseDomoDate(firstActivity);
  if (!d) return '—';
  var launch = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  launch.setDate(launch.getDate() + 14);
  return formatDisplayDate(launch);
}

function weekBandLabel(days) {
  if (days == null || !isFinite(days)) return 'No data';
  var list = weekFilterList();
  var i;
  for (i = 0; i < list.length; i++) {
    var b = list[i];
    if (b.missing) continue;
    if (b.max == null) {
      if (days >= b.min) return b.label;
    } else if (days >= b.min && days <= b.max) {
      return b.label;
    }
  }
  return statusLabel(statusForDays(days));
}

function preferredProgramRow(rec) {
  var matches = matchingProgramRows(rec);
  if (!matches.length) return null;
  var i;
  for (i = 0; i < matches.length; i++) {
    if (programRowLifecycle(matches[i]) === 'active') return matches[i];
  }
  return matches[0];
}

function clientCampaignRows(rec) {
  var all = (LAST_DASH_DATA && LAST_DASH_DATA.all) || [];
  return all.filter(function (row) {
    return partitionKeysOverlap(row.name, rec.name);
  }).sort(function (a, b) {
    var ca = String(a.campaign || formatCampaignLabel(a.year, a.campaignName) || '').toLowerCase();
    var cb = String(b.campaign || formatCampaignLabel(b.year, b.campaignName) || '').toLowerCase();
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    var da = a.days == null ? 1e9 : a.days;
    var db = b.days == null ? 1e9 : b.days;
    return da - db;
  });
}

function isQaDetailOpen() {
  var drawer = document.getElementById('qa-detail-drawer');
  return !!(drawer && drawer.classList.contains('is-open'));
}

function renderQaClientDetail(rec) {
  var body = document.getElementById('qa-detail-drawer-body');
  var title = document.getElementById('qa-detail-drawer-title');
  var sub = document.getElementById('qa-detail-drawer-sub');
  var openBtn = document.getElementById('btn-qa-open-program');
  var exportBar = document.getElementById('qaDetailExportBar');
  if (!body || !rec) return;

  var campaignLabel = rec.campaign || formatCampaignLabel(rec.year, rec.campaignName) || '—';
  if (title) title.textContent = rec.name || 'Client details';
  if (sub) sub.textContent = campaignLabel;

  var programRow = preferredProgramRow(rec);
  QA_DETAIL_PROGRAM_ROW = programRow;
  if (exportBar) exportBar.hidden = !programRow;
  if (openBtn) openBtn.disabled = !programRow;

  var uploadHtml = qaDetailDl([
    { label: 'Campaign', html: escapeHtml(campaignLabel) },
    { label: 'Campaign code', html: escapeHtml(rec.campaignName || '—') },
    { label: 'Campaign year', html: escapeHtml(rec.year || '—') },
    { label: 'Last upload', html: escapeHtml(formatDisplayDate(rec.lastDate)) },
    { label: 'Days since upload', html: escapeHtml(rec.days == null ? '—' : formatRelativeDays(rec.days)) },
    { label: 'Freshness', html: statusChip(rec.status) },
    { label: 'Week band', html: escapeHtml(weekBandLabel(rec.days)) },
    { label: 'Records', html: escapeHtml(rec.records ? rec.records.toLocaleString() : '—') },
    { label: 'Source', html: escapeHtml(rec.source || '—') }
  ]);

  var programHtml;
  if (!hostProgramRows().length) {
    programHtml = '<p class="detail-empty">Program activity has not loaded yet.</p>';
  } else if (!programRow) {
    programHtml = '<p class="detail-empty">No matching program for this partner, campaign, and year. Unmapped rows stay hidden while Program Status is Active only.</p>';
  } else {
    programHtml = qaDetailDl([
      { label: 'Program status', html: programLifecycleChip(programRowLifecycle(programRow)) || escapeHtml(String(programRowField(programRow, 'PROGRAM_STATUS') || '—')) },
      { label: 'Program name', html: escapeHtml(String(programRowField(programRow, 'PROGRAM_NAME') || programRowField(programRow, 'CAMPAIGN_SOLUTION') || '—')) },
      { label: 'Program ID', html: escapeHtml(String(programRowField(programRow, 'PROGRAM_ID') || '—')) },
      { label: 'Instance', html: escapeHtml(String(programRowField(programRow, 'INSTANCE_NUM') || '—')) },
      { label: 'Active flag', html: escapeHtml(String(programRowField(programRow, 'ACTIVE_FLAG') || '—')) },
      { label: 'First activity', html: escapeHtml(formatQaFieldDate(programRowField(programRow, 'FIRST_ACTIVITY'))) },
      { label: 'Last activity', html: escapeHtml(formatQaFieldDate(programRowField(programRow, 'LAST_ACTIVITY'))) },
      {
        label: 'Campaign dashboard availability',
        html: '<span title="Two weeks after first program activity.">' +
          escapeHtml(qaDashboardLaunchHtml(programRowField(programRow, 'FIRST_ACTIVITY'))) + '</span>'
      },
      { label: 'Days since touched', html: escapeHtml(String(programRowField(programRow, 'DAYS_SINCE_LAST_TOUCHED') || '—')) }
    ]);
  }

  var siblings = clientCampaignRows(rec);
  var currentId = qaRecId(rec);
  var campaignsHtml;
  if (siblings.length <= 1) {
    campaignsHtml = '<p class="detail-empty">No other loaded campaigns for this client.</p>';
  } else {
    campaignsHtml = '<ul class="qa-detail-campaign-list">' + siblings.map(function (row) {
      var id = qaRecId(row);
      var on = id === currentId;
      return '<li><button type="button" class="qa-detail-campaign-btn' + (on ? ' is-current' : '') + '" data-qa-rec="' + escapeHtml(id) + '"' +
        (on ? ' aria-current="page"' : '') + '>' +
        '<span class="qa-detail-campaign-name">' + escapeHtml(row.campaign || formatCampaignLabel(row.year, row.campaignName) || '—') + '</span>' +
        '<span class="qa-detail-campaign-meta">' + escapeHtml(formatDisplayDate(row.lastDate)) +
        ' · ' + escapeHtml(row.days == null ? 'No date' : formatRelativeDays(row.days)) + '</span>' +
        '</button></li>';
    }).join('') + '</ul>';
  }

  body.innerHTML =
    qaDetailSection('Client', qaDetailDl([
      { label: 'Partition', html: escapeHtml(rec.name || '—') },
      { label: 'Program mapping', html: hostProgramRows().length
        ? (programLifecycleChip(rec.programLifecycle) || escapeHtml('Unmapped'))
        : escapeHtml('—') }
    ])) +
    qaDetailSection('This upload', uploadHtml) +
    qaDetailSection('Matched program', programHtml) +
    qaDetailSection('Campaigns for this client', campaignsHtml);
}

function setQaClientDetailOpen(open, rec) {
  var drawer = document.getElementById('qa-detail-drawer');
  var overlay = document.getElementById('qa-detail-overlay');
  var closeBtn = document.getElementById('btn-close-qa-detail');
  if (!drawer) return;
  if (open && rec) {
    SELECTED_QA_REC_ID = qaRecId(rec);
    renderQaClientDetail(rec);
  } else if (!open) {
    SELECTED_QA_REC_ID = '';
    QA_DETAIL_PROGRAM_ROW = null;
  }
  drawer.classList.toggle('is-open', !!open);
  drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (overlay) {
    overlay.classList.toggle('is-open', !!open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  document.body.classList.toggle('detail-open', !!open);
  if (open && closeBtn) closeBtn.focus();
  if (LAST_DASH_DATA) {
    var body = $('roster-table-body');
    if (body) {
      body.querySelectorAll('tr.row-clickable').forEach(function (tr) {
        tr.classList.toggle('is-selected', open && tr.getAttribute('data-qa-rec') === SELECTED_QA_REC_ID);
      });
    }
  }
}

function openQaClientDetail(id) {
  var rec = findQaRecById(id);
  if (!rec) return false;
  setQaClientDetailOpen(true, rec);
  return true;
}

function closeQaClientDetail() {
  if (!isQaDetailOpen()) return;
  setQaClientDetailOpen(false);
}

function refreshQaClientDetail() {
  if (!isQaDetailOpen() || !SELECTED_QA_REC_ID) return;
  var rec = findQaRecById(SELECTED_QA_REC_ID);
  if (!rec) {
    closeQaClientDetail();
    return;
  }
  renderQaClientDetail(rec);
}

function openMatchedProgramInPdh() {
  if (!QA_DETAIL_PROGRAM_ROW || !host || typeof host.openProgramDetail !== 'function') return;
  var row = QA_DETAIL_PROGRAM_ROW;
  closeQaClientDetail();
  host.openProgramDetail(row);
}

function initQaDetailDrawer() {
  if (window._3eQaDetailBound) return;
  window._3eQaDetailBound = true;
  var overlay = document.getElementById('qa-detail-overlay');
  var closeBtn = document.getElementById('btn-close-qa-detail');
  var openBtn = document.getElementById('btn-qa-open-program');
  var drawer = document.getElementById('qa-detail-drawer');
  if (overlay) overlay.addEventListener('click', closeQaClientDetail);
  if (closeBtn) closeBtn.addEventListener('click', closeQaClientDetail);
  if (openBtn) openBtn.addEventListener('click', openMatchedProgramInPdh);
  if (drawer) {
    drawer.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.qa-detail-campaign-btn') : null;
      if (!btn) return;
      ev.preventDefault();
      openQaClientDetail(btn.getAttribute('data-qa-rec'));
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeQaClientDetail();
  });
  if (chapterRoot) {
    chapterRoot.addEventListener('keydown', function (ev) {
      var row = ev.target && ev.target.closest ? ev.target.closest('#roster-table tbody tr.row-clickable') : null;
      if (!row) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openQaClientDetail(row.getAttribute('data-qa-rec'));
      }
    });
  }
}

function updateSortButtons() {
  qaQueryAll('.qa-sort').forEach(function (btn) {
    var key = btn.getAttribute('data-sort');
    var on = key === SORT_KEY;
    btn.classList.toggle('is-sorted', on);
    btn.classList.toggle('is-asc', on && SORT_DIR === 'asc');
  });
}

function describeLoadedSchema(alias) {
  var s = SCHEMA[alias];
  if (!s) return alias + ': not probed';
  var pack = RAW && RAW.packs && RAW.packs[alias];
  var n = pack && pack.rows ? pack.rows.length : 0;
  return (s.label || alias) + ': partition=' + (s.partitionField || '—') +
    ', count=' + (s.countField || '—') +
    ', date=' + (s.dateField || 'none') +
    ', year=' + (s.yearField || 'none') +
    ', campaign=' + (s.campaignField || 'none') +
    ', campaignAlt=' + (s.campaignAltField || 'none') +
    ', parsed rows=' + n +
    (s.ok ? '' : ' (' + (s.error || 'unavailable') + ')');
}

function loadedYearCampaignPreview(limit) {
  limit = limit || 12;
  var years = {};
  var campaigns = {};
  Object.keys((RAW && RAW.packs) || {}).forEach(function (alias) {
    var pack = RAW.packs[alias];
    (pack && pack.rows || []).forEach(function (row) {
      if (row.year != null && String(row.year).trim() !== '') years[String(row.year).trim()] = true;
      if (row.campaignName != null && String(row.campaignName).trim() !== '') {
        campaigns[String(row.campaignName).trim()] = true;
      }
    });
  });
  function take(obj) {
    var keys = Object.keys(obj).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    var extra = keys.length > limit ? keys.length - limit : 0;
    return { shown: keys.slice(0, limit), extra: extra };
  }
  return { years: take(years), campaigns: take(campaigns) };
}

function renderDataDiag(data) {
  var el = $('qa-diag');
  if (!el) return;
  var all = (data && data.all) || [];
  var warnings = (data && data.warnings) || [];
  if (all.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  var tab = getActiveProgramTab();
  var loaded = 0;
  Object.keys(SCHEMA || {}).forEach(function (alias) {
    var pack = RAW && RAW.packs && RAW.packs[alias];
    if (pack && pack.rows) loaded += pack.rows.length;
  });
  var preview = loadedYearCampaignPreview();
  var bits = [
    '<p><strong>No partition rows to show for ' +
      escapeHtml(tab ? (tab.label + ' · ' + calendarYearToken(SELECTED_YEAR) + ' · ' + selectedYearLabel()) : 'this tab') +
      '.</strong> ' +
      (loaded
        ? (loaded + ' partition row(s) loaded — this tab’s campaign/year filter matched none. Try All.')
        : 'The KPI zeros mean the table is empty — not that every client uploaded today.') +
      '</p>'
  ];
  if (preview.years.shown.length) {
    bits.push('<p class="qa-diag-line">Loaded CAMPAIGN_YEAR values: ' +
      escapeHtml(preview.years.shown.join(', ')) +
      (preview.years.extra ? ' (+' + preview.years.extra + ' more)' : '') +
      '.</p>');
  }
  if (preview.campaigns.shown.length) {
    bits.push('<p class="qa-diag-line">Loaded PROGRAM_SOLUTION values: ' +
      escapeHtml(preview.campaigns.shown.join(', ')) +
      (preview.campaigns.extra ? ' (+' + preview.campaigns.extra + ' more)' : '') +
      '.</p>');
  }
  Object.keys(SCHEMA || {}).forEach(function (alias) {
    bits.push('<p class="qa-diag-line">' + escapeHtml(describeLoadedSchema(alias)) + '</p>');
  });
  if (warnings.length) {
    bits.push('<p class="qa-diag-line">' + escapeHtml(warnings.join(' · ')) + '</p>');
  }
  bits.push('<p class="qa-diag-line">Hard-refresh this card (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>), then open the browser console (F12) and filter for <code>[3E-QA]</code>.</p>');
  el.innerHTML = bits.join('');
  el.classList.remove('hidden');
  el.hidden = false;
}

function renderDashboard(data) {
  LAST_DASH_DATA = data;
  destroyCharts();
  syncChartPalette();
  renderDataDiag(data);
  renderRosterTable(data);
  updateSortButtons();
  updateFilterBarSummary();
  updateProgramChrome();
  syncChartExportControls();
}

/* ---- Filters ---- */

function renderChecklist(containerId, values, labels, selected) {
  var el = $(containerId);
  if (!el) return;
  var selectedSet = {};
  (selected || values).forEach(function (v) { selectedSet[v] = true; });
  el.innerHTML = values.map(function (v) {
    var lab = (labels && labels[v]) || v;
    var checked = selectedSet[v] ? ' checked' : '';
    return '<label class="filter-check">' +
      '<input type="checkbox" class="filter-check-input" value="' + escapeHtml(v) + '"' + checked + '>' +
      '<span class="filter-check-box"></span>' +
      '<span class="filter-check-label">' + escapeHtml(lab) + '</span>' +
    '</label>';
  }).join('');
}

function populateFilters(opts, reset) {
  var weekIds = weekFilterIds();
  var weekSelected = reset ? weekIds : getCheckedValues('filter-weeks');
  renderChecklist('filter-weeks', weekIds, weekFilterLabels(),
    weekSelected.length ? weekSelected : weekIds);
  updateFilterMetas();
}

function updateFilterMetas() {
  function meta(containerId, metaId, allLabel) {
    var el = $(containerId);
    var metaEl = $(metaId);
    if (!metaEl) return;
    var selected = getCheckedValues(containerId);
    var total = el ? el.querySelectorAll('.filter-check-input').length : 0;
    metaEl.textContent = !selected.length || selected.length === total ? (allLabel || 'All') : selected.length + ' selected';
  }
  meta('filter-campaign', 'filter-campaign-meta', 'All');
  meta('filter-year', 'filter-year-meta', 'All');
  meta('filter-partition', 'filter-partition-meta', 'All');
  meta('filter-status', 'filter-status-meta', 'All');
  var weekSel = getCheckedValues('filter-weeks');
  var weekTotal = $('filter-weeks') ? $('filter-weeks').querySelectorAll('.filter-check-input').length : 0;
  var badge = $('status-week-badge');
  if (badge) {
    var active = weekSel.length && weekTotal && weekSel.length !== weekTotal;
    badge.textContent = active ? String(weekSel.length) : '';
    badge.classList.toggle('hidden', !active);
  }
  var weekBtn = $('btn-status-weeks');
  if (weekBtn) weekBtn.classList.toggle('is-filtered', !!(weekSel.length && weekTotal && weekSel.length !== weekTotal));
}

function updateHeaderFilterNote() {
  var note = $('header-filter-note');
  if (!note) return;
  var tab = getActiveProgramTab();
  var yearBit = selectedYearLabel() + ' (' + calendarYearToken(SELECTED_YEAR) + ')';
  var name = tab && tab.allCampaigns
    ? 'all campaigns'
    : (tab ? tab.label : 'this program');
  note.textContent = slaNote() + ' Showing ' + name + ' for ' + yearBit + '. Partitions whose names start with z_ are hidden.';
}

function countActiveFilterGroups() {
  var n = 0;
  var filters = getActiveFilters();
  if (!checklistIsAllSelected('filter-campaign', filters.campaigns)) n += 1;
  if (!checklistIsAllSelected('filter-year', filters.years)) n += 1;
  if (!checklistIsAllSelected('filter-partition', filters.partitions)) n += 1;
  if (!checklistIsAllSelected('filter-weeks', filters.weeks)) n += 1;
  if (!checklistIsAllSelected('filter-status', filters.statuses)) n += 1;
  if (filters.datePreset && filters.datePreset !== 'any') n += 1;
  else if (filters.dateFromRaw || filters.dateToRaw) n += 1;
  return n;
}

function dateFilterSummary(filters) {
  if (filters.datePreset === '7') return 'Last 7 days';
  if (filters.datePreset === '14') return 'Last 14 days';
  if (filters.datePreset === '28') return 'Last 28 days';
  if (filters.datePreset === '56') return 'Last 56 days';
  if (filters.datePreset === 'older') return 'Older than 56 days';
  if (filters.datePreset === 'missing') return 'No upload date';
  if (filters.dateFromRaw || filters.dateToRaw) {
    if (filters.dateFromRaw && filters.dateToRaw) return filters.dateFromRaw + ' to ' + filters.dateToRaw;
    if (filters.dateFromRaw) return 'From ' + filters.dateFromRaw;
    return 'Through ' + filters.dateToRaw;
  }
  return '';
}

function updateFilterBarSummary() {
  var label = $('filter-bar-date-label');
  var filters = getActiveFilters();
  if (label) {
    var bits = ['Campaigns:'];
    if (!checklistIsAllSelected('filter-weeks', filters.weeks)) {
      var labels = weekFilterLabels();
      bits.push(filters.weeks.map(function (id) { return labels[id] || id; }).join(', '));
    }
    label.textContent = bits.join(' · ');
  }
  updateFilterMetas();
}

function setDatePreset(preset, writeInputs) {
  qaQueryAll('.date-preset').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-date-preset') === preset);
  });
  if (writeInputs === false) return;
  var fromEl = $('filter-date-from');
  var toEl = $('filter-date-to');
  if (!fromEl || !toEl) return;
  var today = startOfDay(new Date());
  if (preset === 'any' || preset === 'missing') {
    fromEl.value = '';
    toEl.value = '';
    return;
  }
  if (preset === '7' || preset === '14' || preset === '28' || preset === '56') {
    var days = parseInt(preset, 10);
    fromEl.value = formatDateInput(addDays(today, -(days - 1)));
    toEl.value = formatDateInput(today);
    return;
  }
  if (preset === 'older') {
    fromEl.value = '';
    toEl.value = formatDateInput(addDays(today, -57));
  }
}

function snapshotFilterState() {
  return {
    campaigns: getCheckedValues('filter-campaign'),
    years: getCheckedValues('filter-year'),
    statuses: getCheckedValues('filter-status'),
    weeks: getCheckedValues('filter-weeks'),
    partitions: getCheckedValues('filter-partition'),
    dateFrom: $('filter-date-from') ? $('filter-date-from').value : '',
    dateTo: $('filter-date-to') ? $('filter-date-to').value : '',
    datePreset: getActiveDatePreset()
  };
}

function restoreFilterState(snap) {
  if (!snap) return;
  function apply(containerId, values) {
    var el = $(containerId);
    if (!el) return;
    var set = {};
    (values || []).forEach(function (v) { set[v] = true; });
    var boxes = el.querySelectorAll('.filter-check-input');
    if (!values || !values.length) {
      boxes.forEach(function (inp) { inp.checked = true; });
      return;
    }
    boxes.forEach(function (inp) { inp.checked = !!set[inp.value]; });
  }
  apply('filter-campaign', snap.campaigns);
  apply('filter-year', snap.years);
  apply('filter-status', snap.statuses);
  apply('filter-weeks', snap.weeks);
  apply('filter-partition', snap.partitions);
  if ($('filter-date-from')) $('filter-date-from').value = snap.dateFrom || '';
  if ($('filter-date-to')) $('filter-date-to').value = snap.dateTo || '';
  setDatePreset(snap.datePreset || 'any', false);
  updateFilterBarSummary();
}

function resetFilterFormDefaults() {
  ['filter-campaign', 'filter-year', 'filter-weeks', 'filter-status', 'filter-partition'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.querySelectorAll('.filter-check-input').forEach(function (inp) { inp.checked = true; });
  });
  var search = $('filter-partition-search');
  if (search) search.value = '';
  filterChecklistBySearch('filter-partition', 'filter-partition-search');
  setDatePreset('any', true);
  updateFilterBarSummary();
}

function filterChecklistBySearch(listId, searchId) {
  var list = $(listId);
  var search = $(searchId);
  if (!list || !search) return;
  var q = String(search.value || '').trim().toLowerCase();
  list.querySelectorAll('.filter-check').forEach(function (row) {
    var label = row.querySelector('.filter-check-label');
    var text = label ? label.textContent.toLowerCase() : '';
    row.classList.toggle('is-hidden', q && text.indexOf(q) === -1);
  });
}

function initFilterSearch() {
  var search = $('filter-partition-search');
  if (!search) return;
  search.addEventListener('input', function () {
    filterChecklistBySearch('filter-partition', 'filter-partition-search');
  });
}

function initFilterAccordions() {
  qaQueryAll('.filter-accordion').forEach(function (acc) {
    acc.addEventListener('toggle', function () { updateFilterMetas(); });
  });
}

function collapseFilterAccordions() {
  qaQueryAll('.filter-accordion').forEach(function (acc) {
    acc.open = acc.id === 'filter-accordion-campaign' || acc.id === 'filter-accordion-partition';
  });
}

function applyClientFilters() {
  if (!RAW) return;
  renderDashboard(transformLiveData(RAW, getActiveFilters()));
}

function programTabSubtitle(tab) {
  if (!tab) return 'Last file upload by partition and campaign';
  var bits = [tab.label, calendarYearToken(SELECTED_YEAR), selectedYearLabel()];
  var f = hostFilters();
  if (f.statuses.length === 1 && f.statuses[0] === 'active') bits.push('Active programs');
  else if (f.statuses.length && !(Join.isAllProgramStatusesSelected && Join.isAllProgramStatusesSelected(f.statuses))) {
    bits.push(f.statuses.join(', '));
  }
  bits.push('Last file upload by partition');
  bits.push('Click a row for client details');
  return bits.filter(Boolean).join(' · ');
}

function persistSelectedYear() {
  try { localStorage.setItem(YEAR_FILTER_KEY, String(SELECTED_YEAR)); } catch (e) { /* ignore */ }
}

function syncHubYearFromPill(year) {
  if (!host || typeof host.setQaCalendarYear !== 'function') return;
  host.setQaCalendarYear(year);
}

function setSelectedYear(year, opts) {
  opts = opts || {};
  var next = Number(year);
  if (yearFilterOptions().indexOf(next) === -1) return false;
  if (next === SELECTED_YEAR && !opts.force) return false;
  SELECTED_YEAR = next;
  persistSelectedYear();
  syncHubYearFromPill(SELECTED_YEAR);
  renderYearPills();
  updateProgramChrome();
  if (opts.skipRender || !RAW) {
    updateFilterBarSummary();
    updateHeaderFilterNote();
    return true;
  }
  var seed = transformLiveData(RAW, getActiveFilters());
  populateFilters(seed.filterOptions, true);
  renderDashboard(transformLiveData(RAW, getActiveFilters()));
  return true;
}

function renderYearPills() {
  var wrap = $('qa-year-pills');
  if (!wrap) return;
  wrap.innerHTML = yearFilterOptions().map(function (year) {
    var on = year === SELECTED_YEAR;
    return '<button type="button" class="qa-year-pill' + (on ? ' is-active' : '') +
      '" data-year="' + year + '" role="radio" aria-checked="' + (on ? 'true' : 'false') + '">' +
      escapeHtml(calendarYearToken(year)) +
      '<span class="qa-year-pill-range">' + escapeHtml(formatCampaignYearLabel(String(year))) + '</span>' +
      '</button>';
  }).join('');
  wrap.querySelectorAll('.qa-year-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setSelectedYear(btn.getAttribute('data-year'));
    });
  });
}

function updateYearPillState() {
  qaQueryAll('.qa-year-pill').forEach(function (btn) {
    var on = Number(btn.getAttribute('data-year')) === SELECTED_YEAR;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function renderProgramTabButtons() {
  var wrap = chapterRoot ? chapterRoot.querySelector('.program-tabs') : document.querySelector('#campaignUploadQaChapter .program-tabs');
  if (!wrap) return;
  wrap.innerHTML = programTabList().map(function (tab) {
    var on = tab.id === ACTIVE_PROGRAM_TAB;
    return '<button type="button" class="program-tab' + (on ? ' active' : '') +
      '" role="tab" id="tab-' + escapeHtml(tab.id) +
      '" data-program-tab="' + escapeHtml(tab.id) +
      '" aria-selected="' + (on ? 'true' : 'false') + '">' +
      '<span class="program-tab-label">' + escapeHtml(tab.label) + '</span>' +
      '<span class="program-tab-year">' + escapeHtml(programTabYearLabel(tab)) + '</span>' +
      '</button>';
  }).join('');
  wrap.querySelectorAll('.program-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-program-tab');
      if (id && id !== ACTIVE_PROGRAM_TAB) applyProgramTab(id);
    });
  });
}

function updateProgramChrome() {
  var tab = getActiveProgramTab();
  var sub = $('roster-subtitle');
  if (sub) sub.textContent = programTabSubtitle(tab);
  qaQueryAll('.program-tab').forEach(function (btn) {
    var on = btn.getAttribute('data-program-tab') === ACTIVE_PROGRAM_TAB;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && btn.getAttribute('data-program-tab') === 'all') {
      var yearEl = btn.querySelector('.program-tab-year');
      if (yearEl) yearEl.textContent = selectedYearLabel();
    }
  });
  updateYearPillState();
}

function applyProgramTab(id) {
  var tab = programTabById(id);
  ACTIVE_PROGRAM_TAB = tab ? tab.id : ACTIVE_PROGRAM_TAB;
  try { localStorage.setItem(PROGRAM_TAB_KEY, ACTIVE_PROGRAM_TAB); } catch (e) { /* ignore */ }
  if (tab && !tab.allCampaigns && tab.keepCalendarYear != null) {
    SELECTED_YEAR = Number(tab.keepCalendarYear);
    persistSelectedYear();
    syncHubYearFromPill(SELECTED_YEAR);
  }
  updateProgramChrome();
  renderYearPills();
  if (!RAW) {
    updateFilterBarSummary();
    updateHeaderFilterNote();
    return;
  }
  var seed = transformLiveData(RAW, getActiveFilters());
  populateFilters(seed.filterOptions, true);
  renderDashboard(transformLiveData(RAW, getActiveFilters()));
}

function initProgramTabs() {
  try {
    var saved = localStorage.getItem(PROGRAM_TAB_KEY);
    if (saved && programTabById(saved)) ACTIVE_PROGRAM_TAB = saved;
  } catch (e) { /* ignore */ }
  if (!programTabById(ACTIVE_PROGRAM_TAB)) {
    var first = programTabList()[0];
    ACTIVE_PROGRAM_TAB = first ? first.id : ACTIVE_PROGRAM_TAB;
  }
  var tab = getActiveProgramTab();
  try {
    var savedYear = calendarYearFromValue(localStorage.getItem(YEAR_FILTER_KEY));
    if (savedYear && yearFilterOptions().indexOf(savedYear) >= 0) SELECTED_YEAR = savedYear;
    else if (tab && tab.keepCalendarYear != null) SELECTED_YEAR = Number(tab.keepCalendarYear);
  } catch (e) {
    if (tab && tab.keepCalendarYear != null) SELECTED_YEAR = Number(tab.keepCalendarYear);
  }
  renderYearPills();
  renderProgramTabButtons();
  updateProgramChrome();
}

function initFilterPopover() {
  var btn = $('btn-filter-panel');
  var overlay = $('filter-popover-overlay');
  var pop = $('filter-popover');
  var closeBtn = $('btn-close-filters');
  var applyBtn = $('btn-apply-filters');
  var resetBtn = $('btn-reset-filters');
  if (!btn || !overlay || !pop) return;

  var filterDraftSnapshot = null;

  function isFilterOpen() {
    return pop.classList.contains('is-open');
  }

  function openPop() {
    filterDraftSnapshot = snapshotFilterState();
    var search = $('filter-partition-search');
    if (search) search.value = '';
    filterChecklistBySearch('filter-partition', 'filter-partition-search');
    collapseFilterAccordions();
    overlay.classList.add('is-open');
    pop.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    pop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('filter-drawer-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function closePop(restoreDraft) {
    if (restoreDraft !== false && filterDraftSnapshot) restoreFilterState(filterDraftSnapshot);
    filterDraftSnapshot = null;
    overlay.classList.remove('is-open');
    pop.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    pop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('filter-drawer-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function () {
    if (!isFilterOpen()) openPop();
    else closePop(true);
  });
  overlay.addEventListener('click', function () { closePop(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { closePop(true); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isFilterOpen()) closePop(true);
  });
  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      filterDraftSnapshot = null;
      updateFilterBarSummary();
      applyClientFilters();
      closePop(false);
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function () { resetFilterFormDefaults(); });
  }
  initFilterSearch();
  initFilterAccordions();
  initDatePresets();
}

function initDatePresets() {
  qaQueryAll('.date-preset').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setDatePreset(btn.getAttribute('data-date-preset') || 'any', true);
    });
  });
  ['filter-date-from', 'filter-date-to'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      qaQueryAll('.date-preset').forEach(function (btn) {
        btn.classList.remove('active');
      });
    });
  });
}

function initHelpModal() {
  var btn = $('btn-help');
  var overlay = $('help-overlay');
  var modal = $('help-modal');
  var closeBtn = $('btn-close-help');
  if (!btn || !overlay || !modal) return;

  function isOpen() { return modal.classList.contains('is-open'); }
  function open() {
    overlay.classList.add('is-open');
    modal.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('help-open');
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    overlay.classList.remove('is-open');
    modal.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('help-open');
  }

  btn.addEventListener('click', function () { if (isOpen()) close(); else open(); });
  overlay.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) close();
  });
}

function clearRosterRowHover(scope) {
  var root = scope || chapterRoot || document;
  root.querySelectorAll('#roster-table tbody tr.is-row-hover').forEach(function (tr) {
    tr.classList.remove('is-row-hover');
  });
}

function initRosterRowHover() {
  var wrap = chapterRoot
    ? chapterRoot.querySelector('.qa-table-wrap--roster')
    : document.querySelector('#campaignUploadQaChapter .qa-table-wrap--roster');
  if (!wrap || wrap.dataset.rowHoverBound) return;
  wrap.dataset.rowHoverBound = '1';
  wrap.addEventListener('pointerover', function (ev) {
    var row = ev.target && ev.target.closest
      ? ev.target.closest('#roster-table tbody tr.row-clickable')
      : null;
    if (!row) return;
    if (row.classList.contains('is-row-hover')) return;
    clearRosterRowHover(wrap);
    row.classList.add('is-row-hover');
  });
  wrap.addEventListener('pointerout', function (ev) {
    var row = ev.target && ev.target.closest
      ? ev.target.closest('#roster-table tbody tr.row-clickable')
      : null;
    if (!row) return;
    var next = ev.relatedTarget;
    if (next && row.contains(next)) return;
    row.classList.remove('is-row-hover');
  });
  wrap.addEventListener('pointerleave', function () {
    clearRosterRowHover(wrap);
  });
}

function initRosterControls() {
  var search = $('roster-search');
  if (search) {
    search.addEventListener('input', function () {
      ROSTER_SEARCH = search.value || '';
      if (LAST_DASH_DATA) renderRosterTable(LAST_DASH_DATA);
    });
  }
  qaQueryAll('.qa-sort').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (SORT_KEY === key) SORT_DIR = SORT_DIR === 'desc' ? 'asc' : 'desc';
      else {
        SORT_KEY = key;
        SORT_DIR = (key === 'name' || key === 'campaign') ? 'asc' : 'desc';
      }
      if (LAST_DASH_DATA) {
        renderRosterTable(LAST_DASH_DATA);
        updateSortButtons();
      }
    });
  });
  initStatusWeekPopup();
  initExportList();
  initQaDetailDrawer();
  initRosterRowHover();
}

function placeStatusWeekPop() {
  var btn = $('btn-status-weeks');
  var pop = $('status-week-pop');
  if (!btn || !pop || pop.hidden) return;
  var r = btn.getBoundingClientRect();
  var width = Math.max(196, pop.offsetWidth || 196);
  var left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
  var top = r.bottom + 6;
  if (top + pop.offsetHeight > window.innerHeight - 8) {
    top = Math.max(8, r.top - pop.offsetHeight - 6);
  }
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

function setStatusWeekPopOpen(open) {
  var btn = $('btn-status-weeks');
  var pop = $('status-week-pop');
  if (!btn || !pop) return;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    requestAnimationFrame(placeStatusWeekPop);
  }
}

function initStatusWeekPopup() {
  var btn = $('btn-status-weeks');
  var pop = $('status-week-pop');
  if (!btn || !pop) return;
  if (pop.parentNode !== document.body) document.body.appendChild(pop);

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    setStatusWeekPopOpen(pop.hidden);
  });

  pop.addEventListener('click', function (e) {
    e.stopPropagation();
  });
  pop.addEventListener('change', function (e) {
    if (e.target && e.target.classList.contains('filter-check-input')) {
      applyClientFilters();
      updateFilterBarSummary();
    }
  });

  document.addEventListener('click', function (e) {
    if (pop.hidden) return;
    if (btn.contains(e.target) || pop.contains(e.target)) return;
    setStatusWeekPopOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setStatusWeekPopOpen(false);
  });
  window.addEventListener('resize', function () { placeStatusWeekPop(); });
  window.addEventListener('scroll', function () { placeStatusWeekPop(); }, true);
}

function setDates() {
  var now = new Date();
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var str = months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
  var header = $('header-updated-date');
  if (header) header.textContent = str;
}

/* ---- Export ---- */

function slugifyExportName(title) {
  return String(title || 'chart')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'chart';
}

function exportFilenameBase(title) {
  return slugifyExportName(title);
}

function getChartExportTitle(host) {
  var custom = host.getAttribute('data-export-title');
  if (custom) return custom.trim();
  var titleEl = host.querySelector('.box-title');
  return titleEl ? titleEl.textContent.trim() : 'Chart';
}

function resolveChartWrap(host) {
  if (!host) return null;
  if (host.classList && host.classList.contains('chart-wrap')) return host;
  return host.querySelector('.chart-wrap');
}

function getChartVisualElement(host) {
  var chartWrap = resolveChartWrap(host);
  if (!chartWrap) return null;
  return chartWrap.querySelector('canvas');
}

function getChartExportKey(host) {
  return host.getAttribute('data-export-key') || '';
}

function rowsToCsv(columns, rows) {
  function esc(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var lines = [columns.map(function (c) { return esc(c.header); }).join(',')];
  (rows || []).forEach(function (row) {
    lines.push(columns.map(function (c) { return esc(row[c.key]); }).join(','));
  });
  return lines.join('\n');
}

function downloadBlob(blob, filename) {
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1200);
}

function downloadCanvasPng(canvas, filename) {
  canvas.toBlob(function (blob) {
    if (blob) downloadBlob(blob, filename + '.png');
  }, 'image/png');
}

function getCardCaptureBackground(el) {
  var node = el;
  while (node && node !== document.body) {
    var bg = window.getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(bg)) return bg;
    node = node.parentElement;
  }
  return window.getComputedStyle(document.body).backgroundColor || '#ffffff';
}

function downloadElementImage(el, filename) {
  if (typeof html2canvas !== 'function') {
    console.warn('[3E-QA] Image export unavailable — html2canvas failed to load.');
    return;
  }
  var control = el.querySelector(':scope > .chart-export');
  var prevVisibility = control ? control.style.visibility : null;
  if (control) control.style.visibility = 'hidden';
  function restore() {
    if (control) control.style.visibility = prevVisibility || '';
  }
  html2canvas(el, {
    backgroundColor: getCardCaptureBackground(el),
    scale: 2,
    useCORS: true,
    logging: false
  }).then(function (canvas) {
    restore();
    downloadCanvasPng(canvas, filename);
  }).catch(function (err) {
    restore();
    console.warn('[3E-QA] Card image export failed:', err);
  });
}

function downloadChartImage(host) {
  var filename = exportFilenameBase(getChartExportTitle(host));
  if (host.getAttribute('data-export-mode') !== 'card') {
    var visual = getChartVisualElement(host);
    if (visual && visual.tagName === 'CANVAS') {
      downloadCanvasPng(visual, filename);
      return;
    }
  }
  downloadElementImage(host, filename);
}

function rosterExportColumns() {
  return [
    { key: 'partition', header: 'Partition' },
    { key: 'campaign', header: 'Campaign' },
    { key: 'programStatus', header: 'Program status' },
    { key: 'lastUpload', header: 'Last upload' },
    { key: 'status', header: 'Status' },
    { key: 'days', header: 'Days' },
    { key: 'records', header: 'Records' }
  ];
}

function sortExportRoster(rows) {
  return (rows || []).slice().sort(function (a, b) {
    var ca = String(a.campaign || formatCampaignLabel(a.year, a.campaignName) || '').toLowerCase();
    var cb = String(b.campaign || formatCampaignLabel(b.year, b.campaignName) || '').toLowerCase();
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    var da = a.days == null ? 1e9 : a.days;
    var db = b.days == null ? 1e9 : b.days;
    if (db !== da) return db - da;
    var na = String(a.name || '').toLowerCase();
    var nb = String(b.name || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });
}

function rosterExportRows(list) {
  return sortExportRoster(list).map(function (r) {
    return {
      partition: r.name,
      campaign: r.campaign || formatCampaignLabel(r.year, r.campaignName) || '',
      programStatus: programLifecycleLabel(r.programLifecycle) || '',
      lastUpload: r.lastDate ? formatDisplayDate(r.lastDate) : '',
      status: statusLabel(r.status),
      days: r.days == null ? '' : r.days,
      records: r.records || 0
    };
  });
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function exportListFilename(scope, ext) {
  var d = new Date();
  var stamp = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  var label = scope === 'view' ? 'over-10-days-current-view' : 'over-10-days';
  var tab = getActiveProgramTab();
  var tabBit = tab ? tab.id + '-' : '';
  return 'campaign-qa-' + tabBit + label + '-' + stamp + '.' + (ext || 'xlsx');
}

function recIsExportLate(rec) {
  return !!(rec && rec.days != null && rec.days > 10);
}

function getRosterExportSource(scope) {
  var d = LAST_DASH_DATA;
  if (!d) return [];
  var rows = scope === 'view'
    ? (d.visible || []).filter(function (rec) {
        return matchesRosterView(rec, ROSTER_SEARCH);
      })
    : (d.all || []);
  return rows.filter(recIsExportLate);
}

function recCampaignLabel(rec) {
  return rec.campaign || formatCampaignLabel(rec.year, rec.campaignName) || '';
}

function exportProgramHeadline() {
  var tab = getActiveProgramTab();
  if (!tab) return 'Campaign QA · Partition Uploads';
  return 'Campaign QA · ' + tab.label + ' · ' + calendarYearToken(SELECTED_YEAR) + ' · ' + selectedYearLabel();
}

function xlArgb(hex) {
  return 'FF' + String(hex || '').replace('#', '').toUpperCase();
}

function xlThinBorder() {
  var edge = { style: 'thin', color: { argb: xlArgb('#E8E6E0') } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function xlStatusFill(days) {
  if (days > 13) {
    return {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb('#E65100') } },
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    };
  }
  return {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb('#FFD100') } },
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: xlArgb('#161616') } }
  };
}

function buildPartitionWorkbook(recs, scope) {
  var wb = new ExcelJS.Workbook();
  wb.creator = '3 Enrollment Marketing';
  wb.created = new Date();
  wb.modified = new Date();

  var tab = getActiveProgramTab();
  var sheetName = tab ? String(tab.label).slice(0, 31) : 'Over 10 days';
  var headline = exportProgramHeadline();

  var ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 }
    },
    properties: { tabColor: { argb: xlArgb('#FFD100') } }
  });

  ws.columns = [
    { key: 'partition', width: 34 },
    { key: 'campaign', width: 24 },
    { key: 'lastUpload', width: 16 },
    { key: 'status', width: 14 },
    { key: 'days', width: 10 },
    { key: 'records', width: 14 }
  ];

  ws.mergeCells('A1:F1');
  var title = ws.getCell('A1');
  title.value = headline;
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: xlArgb('#161616') } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  [1, 2, 3, 4, 5, 6].forEach(function (col) {
    ws.getCell(1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb('#FFD100') } };
    ws.getCell(1, col).font = title.font;
    ws.getCell(1, col).alignment = title.alignment;
  });
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:F2');
  var sub = ws.getCell('A2');
  var scopeNote = scope === 'view' ? 'Current view' : 'All matching partitions';
  sub.value = 'More than 10 days since last upload  ·  ' + scopeNote + '  ·  ' +
    recs.length + (recs.length === 1 ? ' partition' : ' partitions') + '  ·  ' +
    formatDisplayDate(new Date());
  sub.font = { name: 'Calibri', size: 11, color: { argb: xlArgb('#56565A') } };
  sub.alignment = { vertical: 'middle', horizontal: 'left' };
  [1, 2, 3, 4, 5, 6].forEach(function (col) {
    ws.getCell(2, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb('#FAFAF8') } };
    ws.getCell(2, col).font = sub.font;
    ws.getCell(2, col).alignment = sub.alignment;
  });
  ws.getRow(2).height = 20;

  ws.mergeCells('A3:F3');
  var legend = ws.getCell('A3');
  legend.value = 'Yellow = 11–13 days     Orange = more than 13 days';
  legend.font = { name: 'Calibri', size: 10, italic: true, color: { argb: xlArgb('#9A9A95') } };
  legend.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(3).height = 16;

  var headers = ['Partition', 'Campaign', 'Last upload', 'Status', 'Days', 'Records'];
  var headerRow = ws.getRow(4);
  headers.forEach(function (label, i) {
    headerRow.getCell(i + 1).value = label;
  });
  headerRow.height = 22;
  headerRow.eachCell(function (cell) {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb('#141416') } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: xlArgb('#141416') } },
      left: { style: 'thin', color: { argb: xlArgb('#141416') } },
      bottom: { style: 'medium', color: { argb: xlArgb('#FFD100') } },
      right: { style: 'thin', color: { argb: xlArgb('#141416') } }
    };
  });
  ws.getCell('A4').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell('B4').alignment = { vertical: 'middle', horizontal: 'left' };

  recs.forEach(function (rec, i) {
    var rowNum = 5 + i;
    var row = ws.getRow(rowNum);
    var alt = i % 2 === 1;
    var bg = alt ? xlArgb('#F4F3EF') : xlArgb('#FFFFFF');
    var statusStyle = xlStatusFill(rec.days);
    var campaign = recCampaignLabel(rec);

    row.height = 20;
    row.getCell(1).value = rec.name || '';
    row.getCell(2).value = campaign;
    row.getCell(3).value = rec.lastDate
      ? new Date(Date.UTC(rec.lastDate.getFullYear(), rec.lastDate.getMonth(), rec.lastDate.getDate()))
      : null;
    row.getCell(4).value = statusLabel(rec.status);
    row.getCell(5).value = rec.days;
    row.getCell(6).value = rec.records || 0;

    row.eachCell(function (cell, col) {
      cell.font = { name: 'Calibri', size: 11, color: { argb: xlArgb('#18181A') } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = xlThinBorder();
      cell.alignment = { vertical: 'middle' };
      if (col === 1) cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: xlArgb('#18181A') } };
      if (col === 3) {
        cell.numFmt = 'mmm d, yyyy';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (col === 4) {
        cell.fill = statusStyle.fill;
        cell.font = statusStyle.font;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (col === 5) cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (col === 6) {
        cell.numFmt = '#,##0';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });
  });

  var lastRow = 4 + recs.length;
  ws.autoFilter = 'A4:F' + lastRow;
  ws.headerFooter.oddFooter = '&L3 Enrollment Marketing&CCampaign QA&R&P of &N';

  return wb.xlsx.writeBuffer();
}

function xmlEsc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ssDate(d) {
  if (!d) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T00:00:00.000';
}

function downloadPartitionListHtml(recs, scope, filename) {
  var scopeNote = scope === 'view' ? 'Current view' : 'All matching partitions';
  var rowsXml = recs.map(function (rec, i) {
    var style = rec.days > 13 ? 'Overdue' : 'Aging';
    var rowStyle = i % 2 ? 'Alt' : 'Data';
    var dateCell = rec.lastDate
      ? '<Cell ss:StyleID="' + rowStyle + 'Center"><Data ss:Type="DateTime">' + ssDate(rec.lastDate) + '</Data></Cell>'
      : '<Cell ss:StyleID="' + rowStyle + 'Center"><Data ss:Type="String"></Data></Cell>';
    return '<Row ss:Height="18">' +
      '<Cell ss:StyleID="' + rowStyle + 'Bold"><Data ss:Type="String">' + xmlEsc(rec.name || '') + '</Data></Cell>' +
      '<Cell ss:StyleID="' + rowStyle + '"><Data ss:Type="String">' + xmlEsc(recCampaignLabel(rec)) + '</Data></Cell>' +
      dateCell +
      '<Cell ss:StyleID="' + style + '"><Data ss:Type="String">' + xmlEsc(statusLabel(rec.status)) + '</Data></Cell>' +
      '<Cell ss:StyleID="' + rowStyle + 'Center"><Data ss:Type="Number">' + rec.days + '</Data></Cell>' +
      '<Cell ss:StyleID="' + rowStyle + 'Num"><Data ss:Type="Number">' + (rec.records || 0) + '</Data></Cell>' +
    '</Row>';
  }).join('');

  var xml = '<?xml version="1.0"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:html="http://www.w3.org/TR/REC-html40">' +
    '<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">' +
    '<Author>3 Enrollment Marketing</Author>' +
    '<Company>3 Enrollment Marketing</Company>' +
    '</DocumentProperties>' +
    '<Styles>' +
    '<Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="Title"><Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#161616"/><Interior ss:Color="#FFD100" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/></Style>' +
    '<Style ss:ID="Sub"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#56565A"/><Interior ss:Color="#FAFAF8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="Legend"><Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#9A9A95"/><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="Head"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#141416" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#FFD100"/></Borders></Style>' +
    '<Style ss:ID="HeadLeft"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#141416" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#FFD100"/></Borders></Style>' +
    '<Style ss:ID="Data"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="DataBold"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#18181A"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="DataCenter"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><NumberFormat ss:Format="mmm d, yyyy"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders></Style>' +
    '<Style ss:ID="DataNum"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/><Alignment ss:Vertical="Center" ss:Horizontal="Right"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders></Style>' +
    '<Style ss:ID="Alt"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Interior ss:Color="#F4F3EF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="AltBold"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#18181A"/><Interior ss:Color="#F4F3EF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders><Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="AltCenter"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Interior ss:Color="#F4F3EF" ss:Pattern="Solid"/><NumberFormat ss:Format="mmm d, yyyy"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders></Style>' +
    '<Style ss:ID="AltNum"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#18181A"/><Interior ss:Color="#F4F3EF" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/><Alignment ss:Vertical="Center" ss:Horizontal="Right"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8E6E0"/></Borders></Style>' +
    '<Style ss:ID="Aging"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#161616"/><Interior ss:Color="#FFD100" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>' +
    '<Style ss:ID="Overdue"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#E65100" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>' +
    '</Styles>' +
    '<Worksheet ss:Name="' + xmlEsc((getActiveProgramTab() && getActiveProgramTab().label) || 'Over 10 days') + '">' +
    '<Table ss:ExpandedColumnCount="6" ss:ExpandedRowCount="' + (4 + recs.length) + '" x:FullColumns="1" x:FullRows="1">' +
    '<Column ss:Width="180"/>' +
    '<Column ss:Width="130"/>' +
    '<Column ss:Width="90"/>' +
    '<Column ss:Width="80"/>' +
    '<Column ss:Width="55"/>' +
    '<Column ss:Width="80"/>' +
    '<Row ss:Height="28"><Cell ss:MergeAcross="5" ss:StyleID="Title"><Data ss:Type="String">' + xmlEsc(exportProgramHeadline()) + '</Data></Cell></Row>' +
    '<Row ss:Height="18"><Cell ss:MergeAcross="5" ss:StyleID="Sub"><Data ss:Type="String">' +
      xmlEsc('More than 10 days since last upload  ·  ' + scopeNote + '  ·  ' + recs.length +
        (recs.length === 1 ? ' partition' : ' partitions') + '  ·  ' + formatDisplayDate(new Date())) +
    '</Data></Cell></Row>' +
    '<Row ss:Height="16"><Cell ss:MergeAcross="5" ss:StyleID="Legend"><Data ss:Type="String">Yellow = 11–13 days     Orange = more than 13 days</Data></Cell></Row>' +
    '<Row ss:Height="20">' +
      '<Cell ss:StyleID="HeadLeft"><Data ss:Type="String">Partition</Data></Cell>' +
      '<Cell ss:StyleID="HeadLeft"><Data ss:Type="String">Campaign</Data></Cell>' +
      '<Cell ss:StyleID="Head"><Data ss:Type="String">Last upload</Data></Cell>' +
      '<Cell ss:StyleID="Head"><Data ss:Type="String">Status</Data></Cell>' +
      '<Cell ss:StyleID="Head"><Data ss:Type="String">Days</Data></Cell>' +
      '<Cell ss:StyleID="Head"><Data ss:Type="String">Records</Data></Cell>' +
    '</Row>' +
    rowsXml +
    '</Table>' +
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' +
    '<FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>' +
    '</WorksheetOptions>' +
    '</Worksheet></Workbook>';

  downloadBlob(new Blob([xml], { type: 'application/vnd.ms-excel' }), filename);
}

function partitionRecExportCells(rec) {
  return [
    rec.name || '',
    recCampaignLabel(rec),
    rec.lastDate ? formatDisplayDate(rec.lastDate) : '',
    statusLabel(rec.status),
    rec.days == null ? '' : rec.days,
    rec.records || 0
  ];
}

function exportCampaignQaChapterReport() {
  var OER = global.OpsExportReport;
  if (!OER || typeof ExcelJS === 'undefined') {
    console.warn('[3E-QA] Excel export requires ExcelJS.');
    downloadPartitionList('all');
    return;
  }
  var d = LAST_DASH_DATA;
  if (!d) {
    console.warn('[3E-QA] Export skipped — dashboard not ready.');
    return;
  }
  var subtitle = exportProgramHeadline();
  var blocks = [];
  var kpiDs = getChartExportDataset('kpi-total');
  if (kpiDs && kpiDs.rows && kpiDs.rows.length) {
    blocks.push({
      title: 'Upload freshness summary',
      headers: ['Metric', 'Value'],
      rows: kpiDs.rows.map(function (r) { return [r.metric, r.value]; }),
      colAlign: ['left', 'right']
    });
  }
  var rosterHeaders = ['Partition', 'Campaign', 'Program status', 'Last upload', 'Status', 'Days', 'Records'];
  var fullRoster = rosterExportRows(d.visible || []);
  if (fullRoster.length) {
    blocks.push({
      title: 'Roster (current view)',
      headers: rosterHeaders,
      rows: fullRoster.map(function (r) {
        return [r.partition, r.campaign, r.programStatus, r.lastUpload, r.status, r.days, r.records];
      }),
      colAlign: ['left', 'left', 'left', 'left', 'left', 'right', 'right']
    });
  }
  var lateRecs = sortExportRoster(getRosterExportSource('all'));
  if (lateRecs.length) {
    blocks.push({
      title: 'Partitions over 10 days',
      headers: ['Partition', 'Campaign', 'Last upload', 'Status', 'Days', 'Records'],
      rows: lateRecs.map(partitionRecExportCells),
      colAlign: ['left', 'left', 'left', 'left', 'right', 'right']
    });
  }
  if (!blocks.length) {
    console.warn('[3E-QA] Export skipped — no data.');
    return;
  }
  var wb = OER.createWorkbook();
  OER.addConsolidatedSheet(wb, {
    name: 'All Together',
    docTitle: 'Campaign Upload QA',
    subtitle: subtitle,
    blocks: blocks
  });
  blocks.forEach(function (block) {
    OER.addDataSheet(wb, {
      name: block.title.slice(0, 31),
      docTitle: 'Campaign Upload QA',
      sectionTitle: block.title,
      subtitle: subtitle,
      headers: block.headers,
      rows: block.rows,
      colAlign: block.colAlign
    });
  });
  OER.downloadWorkbook(wb, 'campaign-qa-report-' + OER.fileStamp() + '.xlsx').catch(function (err) {
    console.warn('[3E-QA] Chapter export failed, using partition list fallback:', err);
    downloadPartitionList('all');
  });
}

function downloadPartitionList(scope) {
  var recs = sortExportRoster(getRosterExportSource(scope));
  if (!recs.length) {
    console.warn('[3E-QA] Export skipped — no partitions to download.');
    return;
  }
  function fallback(err) {
    if (err) console.warn('[3E-QA] Excel workbook export failed, using styled spreadsheet fallback:', err);
    downloadPartitionListHtml(recs, scope, exportListFilename(scope, 'xls'));
  }
  if (typeof ExcelJS === 'undefined') {
    fallback();
    return;
  }
  buildPartitionWorkbook(recs, scope).then(function (buffer) {
    downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      exportListFilename(scope, 'xlsx')
    );
  }).catch(fallback);
}

function closeExportListMenu() {
  var btn = $('btn-export-list');
  var menu = $('export-list-menu');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function initExportList() {
  var btn = $('btn-export-list');
  var menu = $('export-list-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !menu.hidden;
    closeAllChartExportMenus(null);
    if (open) closeExportListMenu();
    else {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
  });
  menu.querySelectorAll('.qa-export-action').forEach(function (action) {
    action.addEventListener('click', function (e) {
      e.stopPropagation();
      downloadPartitionList(action.getAttribute('data-export-scope') || 'all');
      closeExportListMenu();
    });
  });
  document.addEventListener('click', closeExportListMenu);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeExportListMenu();
  });
}

function getChartExportDataset(exportKey) {
  var d = LAST_DASH_DATA;
  if (!d) return null;
  var rosterCols = rosterExportColumns();
  if (exportKey === 'kpi-total' || exportKey === 'kpi-median' || exportKey === 'kpi-late' || exportKey === 'kpi-ontime') {
    return {
      columns: [
        { key: 'metric', header: 'Metric' },
        { key: 'value', header: 'Value' }
      ],
      rows: [
        { metric: 'Rows in view', value: d.counts.total },
        { metric: 'Today–7 days', value: (function () {
          var n = 0; var i; for (i = 0; i <= 7; i++) n += d.counts['day-' + i] || 0; return n;
        })() },
        { metric: '8–14 days', value: (function () {
          var n = 0; var i; for (i = 8; i <= 14; i++) n += d.counts['day-' + i] || 0; return n;
        })() },
        { metric: '15–28 days', value: d.counts['days-15-28'] },
        { metric: '29–56 days', value: d.counts['days-29-56'] },
        { metric: 'Stale', value: d.counts.stale },
        { metric: 'No data', value: d.counts.missing },
        { metric: 'Median days', value: d.medianDays == null ? '' : d.medianDays }
      ]
    };
  }
  if (exportKey === 'partition-roster') {
    return { columns: rosterCols, rows: rosterExportRows((d.visible || []).filter(recIsExportLate)) };
  }
  return null;
}

function exportKeyHasData(exportKey) {
  var ds = getChartExportDataset(exportKey);
  return !!(ds && ds.rows && ds.rows.length);
}

function downloadChartCsv(host) {
  var title = getChartExportTitle(host);
  var dataset = getChartExportDataset(getChartExportKey(host));
  if (!dataset || !dataset.rows || !dataset.rows.length) return;
  var csv = '\uFEFF' + rowsToCsv(dataset.columns, dataset.rows);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), exportFilenameBase(title) + '.csv');
}

function closeAllChartExportMenus(exceptMenu) {
  qaQueryAll('.chart-export-menu.is-open').forEach(function (menu) {
    if (menu !== exceptMenu) menu.classList.remove('is-open');
  });
  qaQueryAll('.chart-export-btn[aria-expanded="true"]').forEach(function (btn) {
    if (!exceptMenu || btn.nextElementSibling !== exceptMenu) {
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function buildExportControl(host) {
  if (!host) return;
  var existing = host.querySelector(':scope > .chart-export');
  if (existing) return;
  var exportKey = host.getAttribute('data-export-key') || '';
  var actions =
    '<button type="button" class="chart-export-action" data-export-kind="image" role="menuitem">Download image</button>';
  if (exportKeyHasData(exportKey)) {
    actions += '<button type="button" class="chart-export-action" data-export-kind="data" role="menuitem">Download data</button>';
  }
  var wrap = document.createElement('div');
  wrap.className = 'chart-export';
  wrap.innerHTML =
    '<button type="button" class="chart-export-btn" aria-label="Download" title="Download" aria-haspopup="true" aria-expanded="false">' +
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M8 2.5v7M5.5 7 8 9.5 10.5 7M3 12.5h10" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
    '</button>' +
    '<div class="chart-export-menu" role="menu">' + actions + '</div>';
  host.appendChild(wrap);
  var btn = wrap.querySelector('.chart-export-btn');
  var menu = wrap.querySelector('.chart-export-menu');
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = menu.classList.contains('is-open');
    closeAllChartExportMenus(null);
    if (!open) {
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
  menu.querySelectorAll('.chart-export-action').forEach(function (action) {
    action.addEventListener('click', function (e) {
      e.stopPropagation();
      if (action.getAttribute('data-export-kind') === 'image') downloadChartImage(host);
      else downloadChartCsv(host);
      closeAllChartExportMenus(null);
    });
  });
}

function ensureCardExportControl(card) {
  if (!card) return;
  card.classList.add('chart-export-host');
  card.setAttribute('data-export-mode', 'card');
  buildExportControl(card);
}

function syncChartExportControls() {
  qaQueryAll('#dashboard [data-export-card]').forEach(function (card) {
    ensureCardExportControl(card);
  });
}

function initChartExports() {
  syncChartExportControls();
  document.addEventListener('click', function () { closeAllChartExportMenus(null); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllChartExportMenus(null);
  });
}

async function refreshLiveDataOriginal() {
  try {
    RAW = await loadAllPartitionData();
    var seed = transformLiveData(RAW, getActiveFilters());
    populateFilters(seed.filterOptions);
    var data = transformLiveData(RAW, getActiveFilters());
    renderDashboard(data);
    setDates();
  } catch (err) {
    console.error('[3E-QA] Refresh failed:', err);
  }
}

function bindDomoDataUpdate() {
  if (typeof domo === 'undefined' || typeof domo.onDataUpdate !== 'function') return;
  if (window._3eQaDataUpdateBound) return;
  window._3eQaDataUpdateBound = true;
  domo.onDataUpdate(function (alias) {
    console.log('[3E-QA] Dataset updated in Domo:', alias, '— refreshing dashboard.');
    if (typeof refreshLiveDataEmbedded === 'function') refreshLiveDataEmbedded();
    else refreshLiveDataOriginal();
  });
}

function applyChecklistValues(containerId, values) {
  var el = $(containerId);
  if (!el || !values || !values.length) return false;
  var set = {};
  values.forEach(function (v) { set[v] = true; });
  var boxes = el.querySelectorAll('.filter-check-input');
  if (!boxes.length) return false;
  var matched = 0;
  boxes.forEach(function (inp) {
    if (set[inp.value]) matched += 1;
  });
  if (!matched) return false;
  boxes.forEach(function (inp) { inp.checked = !!set[inp.value]; });
  return true;
}

var qaHubScopeSig = '';

function setChecklistSelection(containerId, values) {
  var el = $(containerId);
  if (!el) return false;
  var boxes = el.querySelectorAll('.filter-check-input');
  if (!boxes.length) return false;
  if (!values || !values.length) {
    boxes.forEach(function (inp) { inp.checked = false; });
    return true;
  }
  var set = {};
  values.forEach(function (v) { set[v] = true; });
  boxes.forEach(function (inp) { inp.checked = !!set[inp.value]; });
  return true;
}

function syncQaPartitionChecklistFromHub(f) {
  var scope = f.scopePartners || [];
  var el = $('filter-partition');
  if (!el) return false;
  var available = [];
  el.querySelectorAll('.filter-check-input').forEach(function (inp) {
    available.push(inp.value);
  });
  if (!available.length) return false;
  var picked = Join.pickKnownPartners ? Join.pickKnownPartners(scope, available) : scope.slice();
  return setChecklistSelection('filter-partition', picked);
}

function applyHostFilters() {
  if (!host || typeof host.getFilters !== 'function' || !state.ready || !RAW) return false;
  invalidateProgramStatusIndex();
  var f = hostFilters();
  var sig = host.getScopeSignature ? host.getScopeSignature(f) : '';
  var scopeChanged = sig !== qaHubScopeSig;
  if (scopeChanged) {
    qaHubScopeSig = sig;
    syncQaPartitionChecklistFromHub(f);
  }
  if (f.years && f.years.length === 1) {
    var rawYear = String(f.years[0]).toUpperCase().replace(/\s+/g, '');
    var hubYear = rawYear === 'CY25' ? 2025 : calendarYearFromValue(f.years[0]);
    var tab = getActiveProgramTab();
    if (hubYear && yearFilterOptions().indexOf(hubYear) >= 0 && (!tab || tab.allCampaigns) && hubYear !== SELECTED_YEAR) {
      SELECTED_YEAR = hubYear;
      persistSelectedYear();
      renderYearPills();
    }
  }
  updateFilterBarSummary();
  renderDashboard(transformLiveData(RAW, getActiveFilters()));
  return true;
}

function applyLoadedQa(raw) {
  RAW = raw;
  var data = transformLiveData(RAW, getActiveFilters());
  populateFilters(data.filterOptions);
  renderDashboard(data);
  applyHostFilters();
  if (data.warnings && data.warnings.length) {
    console.warn('[3E-QA] Partial load:', data.warnings.join(' | '));
  }
  return data;
}

function refreshLiveDataQuiet() {
  loadAllPartitionData().then(function (raw) {
    writeQaCache(raw, SCHEMA);
    RAW = raw;
    if (tabActive) applyLoadedQa(raw);
    else {
      RAW = raw;
      LAST_DASH_DATA = transformLiveData(RAW, getActiveFilters());
    }
    if (host && typeof host.onCommandCenterRefresh === 'function') host.onCommandCenterRefresh();
    console.log('[3E-QA] Background refresh complete.');
  }).catch(function (err) {
    console.warn('[3E-QA] Background refresh failed:', err);
  });
}

async function bootQa() {
  if (state.ready || state.loading) return;
  state.loading = true;
  initDataLoader();
  setLoaderProgress(8, 'Starting Campaign Upload QA…');
  setDefaults();
  setDates();
  updateFilterBarSummary();
  initProgramTabs();
  initRosterControls();
  initChartExports();

  if (typeof domo === 'undefined') {
    showDataLoadError('Domo SDK (domo) is not available. Open this design from Domo, not as a local file.');
    state.loading = false;
    return;
  }

  try {
    var cached = readQaCache();
    if (cached && cached.raw) {
      SCHEMA = cached.schema || SCHEMA;
      setLoaderProgress(40, 'Showing recent Campaign Upload QA…');
      applyLoadedQa(cached.raw);
      await finishDataLoader();
      bindDomoDataUpdate();
      window._3eQaRefreshFn = refreshLiveDataEmbedded;
      state.ready = true;
      state.error = '';
      hostStatus('Campaign Upload QA loaded.', 'ok');
      chapterRefresh();
      state.loading = false;
      refreshLiveDataQuiet();
      return;
    }
    setLoaderProgress(12, 'Connecting to Domo…');
    RAW = await loadAllPartitionData();
    writeQaCache(RAW, SCHEMA);
    setLoaderProgress(72, 'Processing partitions…');
    applyLoadedQa(RAW);
    await finishDataLoader();
    bindDomoDataUpdate();
    window._3eQaRefreshFn = refreshLiveDataEmbedded;
    state.ready = true;
    state.error = '';
    hostStatus('Campaign Upload QA loaded.', 'ok');
    chapterRefresh();
  } catch (err) {
    console.error('[3E-QA] Init failed:', err);
    RAW = null;
    LAST_DASH_DATA = null;
    populateFilters(emptyFilterOptions());
    state.error = err.message || String(err);
    showDataLoadError(state.error);
    hostStatus('Campaign Upload QA failed: ' + state.error, 'error');
    chapterRefresh();
  } finally {
    state.loading = false;
  }
}

function refreshLiveDataEmbedded() {
  if (!tabActive) return;
  clearQaCache();
  state.ready = false;
  bootQa();
}


  global.PartnerCampaignUploadQaTab = {
    init: function (h) {
      host = h;
      chapterRoot = document.getElementById('campaignUploadQaChapter');
    },
    activate: function () {
      tabActive = true;
      invalidateProgramStatusIndex();
      if (!state.ready && !state.loading) return bootQa();
      applyHostFilters();
    },
    deactivate: function () {
      tabActive = false;
      closeQaClientDetail();
      destroyCharts();
      if (state.ready) qaLoading(false);
    },
    refresh: function () {
      if (!tabActive) return;
      clearQaCache();
      state.ready = false;
      return bootQa();
    },
    onFiltersChanged: function () {
      if (!state.ready) return;
      applyHostFilters();
    },
    handleClick: function (ev) {
      if (!tabActive) return false;
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return false;
      if (t.closest('button, a, input, label, .qa-sort, .qa-col-filter-btn, .qa-export')) return false;
      var row = t.closest('#roster-table tbody tr.row-clickable');
      if (!row) return false;
      return openQaClientDetail(row.getAttribute('data-qa-rec'));
    },
    isLoading: function () { return state.loading; },
    getRowCount: function () {
      return LAST_DASH_DATA && LAST_DASH_DATA.visible ? LAST_DASH_DATA.visible.length : 0;
    },
    getHubStat: function () {
      if (LAST_DASH_DATA && LAST_DASH_DATA.lateCount != null) {
        return { value: LAST_DASH_DATA.lateCount, label: 'late uploads' };
      }
      return { value: null, label: 'late uploads' };
    },
    prefetchForCommandCenter: function () {
      if (state.ready || state.loading) return Promise.resolve();
      return Promise.resolve(bootQa());
    },
    getCommandCenterIssues: function () {
      if (!LAST_DASH_DATA || !LAST_DASH_DATA.visible) return [];
      var out = [];
      (LAST_DASH_DATA.visible || []).forEach(function (rec) {
        if (!rec || !rec.partition) return;
        var days = rec.days;
        if (days == null && rec.missing) {
          out.push({
            severity: 'high',
            partner: rec.partition,
            campaign: rec.campaign || '',
            year: rec.year || '',
            issue: 'Upload QA: no source file data',
            chapter: 'campaignUploadQa'
          });
          return;
        }
        if (days != null && days > 56) {
          out.push({
            severity: 'high',
            partner: rec.partition,
            campaign: rec.campaign || '',
            year: rec.year || '',
            issue: 'Upload late (' + days + ' days since file)',
            chapter: 'campaignUploadQa'
          });
        } else if (days != null && days > 28) {
          out.push({
            severity: 'medium',
            partner: rec.partition,
            campaign: rec.campaign || '',
            year: rec.year || '',
            issue: 'Upload aging (' + days + ' days)',
            chapter: 'campaignUploadQa'
          });
        }
      });
      return out;
    },
    getError: function () { return state.error; },
    exportChapterReport: function () {
      if (typeof exportCampaignQaChapterReport === 'function') exportCampaignQaChapterReport();
    }
  };
})(window);
