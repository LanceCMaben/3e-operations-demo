/**
 * 3E Operations — Domo App Framework
 * Rebuild of Analyzer page 559098403.
 * Progressive load: programs first, then year/partner-scoped SQL for the other tables.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var STALE_WARM = 14;
  var STALE_HOT = 30;
  var ROW_CAP = 10000;
  var NEED_SCOPE_MSG = 'Select a campaign year or partner to load this table. Latest year is selected on first open.';

  var ALIASES = {
    programs: { alias: 'programs', id: '59afa2d3-bbd8-4ed8-9e1c-c474f6fe7c46' },
    partnerFiles: { alias: 'partnerFiles', id: '79b16d1a-be4d-441d-a6ec-619156b764cf' },
    downloads: { alias: 'downloads', id: '422fec3e-c1f1-4e9d-baba-2e8365cb6289' },
    loadHistory: { alias: 'loadHistory', id: 'cf232f03-3941-4bfe-b4c6-8e5709c6c1a2' },
    leads: { alias: 'leads', id: 'e4871332-8b50-4d6a-8021-dcb29669f5b8' }
  };

  /** Aliases mapped on this card (manifest.json). Optional datasets omitted here are not fetched. */
  var CARD_DATASET_ALIASES = {
    programs: true,
    partnerFiles: true,
    downloads: true,
    loadHistory: true,
    leads: true,
    printBatches: true,
    campaignQaInsights: true,
    programMeta: true,
    emailSkew: true,
    pageViews: true
  };

  var PROGRAMS_KEYS = [
    'PARTITION', 'PROGRAM_SOLUTION', 'CAMPAIGN_YEAR', 'INSTANCE_NUM',
    'PROGRAM_STATUS', 'ACTIVE_FLAG', 'FIRST_ACTIVITY', 'LAST_ACTIVITY',
    'DAYS_SINCE_LAST_TOUCHED', 'PROGRAM_ID', 'CAMPAIGN_SOLUTION', 'PROGRAM_NAME',
    'NEVER_RUN', 'STALE', 'LAST_UPDATED'
  ];

  var ACTIVITY_COLS = [
    { key: 'PARTITION', label: 'Partner' },
    { key: 'INSTANCE_NUM', label: 'Inst#' },
    { key: 'PROGRAM_SOLUTION', label: 'Campaign' },
    { key: 'CAMPAIGN_YEAR', label: 'Campaign Year' },
    { key: 'PROGRAM_STATUS', label: 'Program Status', kind: 'status' },
    { key: 'FIRST_ACTIVITY', label: 'First Activity', kind: 'date' },
    { key: 'LAST_ACTIVITY', label: 'Most Recent/Last Activity', kind: 'date' },
    { key: 'DAYS_SINCE_LAST_TOUCHED', label: 'Days Last Touched', kind: 'stale' }
  ];

  var FILE_COL_PREF = [
    { key: 'PARTITION', label: 'Partner' },
    { key: 'CAMPAIGN', label: 'Campaign' },
    { key: 'PROGRAM_SOLUTION', label: 'Campaign' },
    { key: 'CY', label: 'Campaign Year' },
    { key: 'CAMPAIGN_YEAR', label: 'Campaign Year' },
    { key: 'SOURCE_FILE_DATE', label: 'Source File Date', kind: 'date' },
    { key: 'SOURCE_FILE', label: 'Source File' },
    { key: 'SOURCE_FILE_NAME', label: 'Source File' },
    { key: 'FILETYPE', label: 'File Type' },
    { key: 'FILE_NAME', label: 'File' },
    { key: 'TOTAL', label: 'Total Records', kind: 'num' },
    { key: 'APP_ST', label: 'App Started', kind: 'num' },
    { key: 'APP_SUB', label: 'App Submits', kind: 'num' },
    { key: 'APP_COMP', label: 'Apps Complete', kind: 'num' },
    { key: 'ADM', label: 'Admits', kind: 'num' },
    { key: 'DEP', label: 'Deposits', kind: 'num' },
    { key: 'ENR', label: 'Enrollments', kind: 'num' },
    { key: 'FAFSA', label: 'FAFSA', kind: 'num' },
    { key: 'VISIT', label: 'Visits', kind: 'num' },
    { key: 'APP_STXSUB', label: 'App Strt not Submitted', kind: 'num' },
    { key: 'DEC_DEL', label: 'Dec Delivered', kind: 'num' },
    { key: 'PAR', label: 'Parents', kind: 'num' },
    { key: 'MAJ_DATA', label: 'Maj 1/2', kind: 'num' }
  ];

  /* Analyzer card 336003091 (PDH Partner Downloads) on VW_PARTNER_DOWNLOADS_KMK. */
  var DOWNLOAD_KEYS = [
    'EVENT_DATE', 'DOWNLOAD_DATE', 'CLIENT', 'PARTITION', 'PARTNER',
    'CAMPAIGN', 'PROGRAM_SOLUTION', 'CY', 'CAMPAIGN_YEAR', 'FILE_NAME', 'FILE_PATH'
  ];
  var DOWNLOAD_COL_PREF = [
    { key: 'EVENT_DATE', label: 'Download Date', kind: 'date' },
    { key: 'CLIENT', label: 'Partner' },
    { key: 'CAMPAIGN', label: 'Campaign' },
    { key: 'CY', label: 'Campaign Year' },
    { key: 'FILE_NAME', label: 'File' }
  ];

  var LOAD_COLS = [
    { key: 'PARTITION', label: 'Partner' },
    { key: 'PROGRAM_SOLUTION', label: 'Campaign' },
    { key: 'CAMPAIGN_YEAR', label: 'Campaign Year' },
    { key: 'MEMBER_DATE', label: 'Date', kind: 'date' },
    { key: 'TOTAL', label: 'Records Loaded', kind: 'num' },
    { key: 'RUNNING_TOTAL', label: 'Running Total', kind: 'num' }
  ];

  var TOTALS_COLS = [
    { key: 'PARTITION', label: 'Partner' },
    { key: 'PROGRAM_SOLUTION', label: 'Campaign' },
    { key: 'CAMPAIGN_YEAR', label: 'Campaign Year' },
    { key: 'INSTANCE_NUM', label: 'Records', kind: 'num' }
  ];

  var TOTALS_KEYS = ['PARTITION', 'PROGRAM_SOLUTION', 'CAMPAIGN_YEAR', 'INSTANCE_NUM'];

  var Join = window.OpsJoin || {};
  var NUMERIC_HINT = /^(TOTAL|APP_|ADM|DEP|ENR|VISIT|PAR|FAFSA|MAJ_|DEC_|INSTANCE|COUNT|RECORDS|RUNNING)/i;
  var DATE_HINT = /(DATE|ACTIVITY)$/i;
  var FILTER_SKIP = { ACTIVE_FLAG: true, PROGRAM_ID: true, CAMPAIGN_SOLUTION: true, _search: true };

  var PANELS = {
    activity: { prefix: 'activity', emptyId: 'activityEmpty', preferred: ACTIVITY_COLS, sortKey: 'activity', subtitleId: 'activitySubtitle', noun: 'program row', title: 'Program Activity' },
    files: { prefix: 'files', emptyId: 'filesEmpty', preferred: FILE_COL_PREF, sortKey: 'files', subtitleId: 'filesSubtitle', noun: 'file row', title: 'Partner Data Files Detail' },
    downloads: { prefix: 'downloads', emptyId: 'downloadsEmpty', preferred: DOWNLOAD_COL_PREF, sortKey: 'downloads', subtitleId: 'downloadsSubtitle', noun: 'download row', title: 'Partner Downloads', strict: true },
    load: { prefix: 'load', emptyId: 'loadEmpty', preferred: LOAD_COLS, sortKey: 'load', subtitleId: 'loadSubtitle', noun: 'load row', title: 'Daily Load Details' },
    totals: { prefix: 'totals', emptyId: 'totalsEmpty', preferred: TOTALS_COLS, sortKey: 'totals', subtitleId: 'totalsSubtitle', noun: 'campaign total row', title: 'Campaign Totals' }
  };

  var HEAVY = ['files', 'downloads', 'load', 'totals'];

  var CHAPTERS = ['hub', 'partnerDataHealth', 'printBatches', 'campaignUploadQa', 'campaignTimelines', 'campaignLoadHistory', 'programMeta', 'insightsActivity', 'howWeBuild', 'workQueue'];
  /** Hidden from nav/hub and deep links; code kept until chapter is validated. */
  var TABLED_CHAPTERS = ['workQueue'];
  var APP_BRAND_TITLE = '3E Operations';
  var CHAPTER_DISPLAY_TITLES = {
    hub: 'Operations Overview',
    workQueue: 'Launch Readiness',
    partnerDataHealth: 'Partner Data Health',
    printBatches: 'Print Batches',
    campaignUploadQa: 'Campaign Upload QA',
    campaignTimelines: 'Campaign Timelines',
    campaignLoadHistory: 'Campaign Load History',
    programMeta: 'Program Meta',
    insightsActivity: 'Insights Activity',
    howWeBuild: 'Documentation'
  };
  var SHARED_FILTER_CHAPTERS = ['hub', 'partnerDataHealth', 'campaignUploadQa'];
  var LOCAL_FILTER_CHAPTERS = ['printBatches', 'campaignTimelines', 'campaignLoadHistory', 'programMeta'];
  var EMBEDDED_CHAPTERS = [
    { id: 'printBatches', global: 'PartnerPrintBatchesTab' },
    { id: 'campaignUploadQa', global: 'PartnerCampaignUploadQaTab' },
    { id: 'campaignTimelines', global: 'PartnerCampaignTimelinesTab' },
    { id: 'campaignLoadHistory', global: 'PartnerCampaignLoadHistoryTab' },
    { id: 'programMeta', global: 'PartnerProgramMetaTab' },
    { id: 'insightsActivity', global: 'PartnerInsightsUsageTab' }
  ];
  var CHAPTER_EXPORT_IDS = [
    'partnerDataHealth', 'insightsActivity', 'campaignUploadQa', 'printBatches',
    'programMeta', 'campaignTimelines', 'campaignLoadHistory'
  ];

  function isChapterTabled(name) {
    return TABLED_CHAPTERS.indexOf(name) >= 0;
  }

  function applyTabledChapterChrome() {
    TABLED_CHAPTERS.forEach(function (id) {
      var btn = document.querySelector('.chapter-nav-btn[data-chapter="' + id + '"]');
      if (btn) btn.hidden = true;
      var card = document.querySelector('.hub-card[data-chapter="' + id + '"]');
      if (card) card.hidden = true;
    });
  }

  function hubScopePartners() {
    if (state.hubScopeSuppressed) return [];
    if (state.filters.partners.length) return state.filters.partners.slice();
    if (state.portalPartners && state.portalPartners.length) return state.portalPartners.slice();
    return [];
  }

  function hubScopeSignature(f) {
    f = f || getHubFilters();
    var p = (f.scopePartners || []).slice().sort().join('\0');
    var c = (f.campaigns || []).slice().sort().join('\0');
    var y = (f.years || []).slice().sort().join('\0');
    var s = (f.statuses || []).slice().sort().join('\0');
    return p + '|' + c + '|' + y + '|' + s;
  }

  function getHubFilters() {
    return {
      years: state.filters.years.slice(),
      partners: state.filters.partners.slice(),
      campaigns: state.filters.campaigns.slice(),
      statuses: (state.filters.statuses || []).slice(),
      search: state.filters.search,
      portalPartners: state.portalPartners,
      hubScopeSuppressed: !!state.hubScopeSuppressed,
      scopePartners: hubScopePartners()
    };
  }

  function getEmbeddedModule(chapterId) {
    for (var i = 0; i < EMBEDDED_CHAPTERS.length; i++) {
      if (EMBEDDED_CHAPTERS[i].id === chapterId) {
        return window[EMBEDDED_CHAPTERS[i].global] || null;
      }
    }
    return null;
  }

  function chapterIsEmbedded(name) {
    for (var i = 0; i < EMBEDDED_CHAPTERS.length; i++) {
      if (EMBEDDED_CHAPTERS[i].id === name) return true;
    }
    return false;
  }

  var activeEmbeddedChapterId = null;

  function deactivateEmbeddedModule(id) {
    if (!id) return;
    var mod = getEmbeddedModule(id);
    if (mod && mod.deactivate) mod.deactivate();
  }

  var STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'development', label: 'Development' }
  ];

  function defaultStatusSelection() {
    return Join.defaultProgramStatusSelection
      ? Join.defaultProgramStatusSelection()
      : STATUS_OPTIONS.map(function (o) { return o.value; });
  }

  function isAllStatusesSelected(values) {
    var sel = (values || []).slice();
    if (!sel.length) return true;
    return Join.isAllProgramStatusesSelected
      ? Join.isAllProgramStatusesSelected(sel)
      : false;
  }

  function updateStatusTriggerLabel(labelEl, values) {
    if (!labelEl) return;
    var sel = (values || []).slice();
    if (!sel.length || isAllStatusesSelected(sel)) {
      labelEl.textContent = 'All statuses';
      return;
    }
    var labels = statusLabels(sel);
    if (sel.length === 1) {
      labelEl.textContent = labels[0] || sel[0];
      return;
    }
    labelEl.textContent = labels.join(', ');
  }

  function effectiveStatusFilter(values) {
    return Join.effectiveProgramStatusFilter
      ? Join.effectiveProgramStatusFilter(values)
      : ((values && values.length) ? values.slice() : null);
  }

  function ensureStatusSelection(values) {
    return (values || []).slice();
  }

  var els = {
    overlay: document.getElementById('appLoadingOverlay'),
    overlayLabel: document.getElementById('appLoadingLabel'),
    partnerTrigger: document.getElementById('partnerTrigger'),
    partnerTriggerLabel: document.getElementById('partnerTriggerLabel'),
    partnerMenu: document.getElementById('partnerMenu'),
    campaignTrigger: document.getElementById('campaignTrigger'),
    campaignTriggerLabel: document.getElementById('campaignTriggerLabel'),
    campaignMenu: document.getElementById('campaignMenu'),
    yearTrigger: document.getElementById('yearTrigger'),
    yearTriggerLabel: document.getElementById('yearTriggerLabel'),
    yearMenu: document.getElementById('yearMenu'),
    statusTrigger: document.getElementById('statusTrigger'),
    statusTriggerLabel: document.getElementById('statusTriggerLabel'),
    statusMenu: document.getElementById('statusMenu'),
    applyFilters: document.getElementById('btnApplyFilters'),
    resetFilters: document.getElementById('btnResetFilters')
  };

  var state = {
    programs: [],
    partnerFiles: [],
    downloads: [],
    loadHistory: [],
    totals: [],
    filters: {
      partners: [],
      campaigns: [],
      years: [],
      statuses: defaultStatusSelection(),
      search: ''
    },
    draft: {
      partners: [],
      campaigns: [],
      years: [],
      statuses: defaultStatusSelection(),
      search: ''
    },
    portalPartners: null,
    hubScopeSuppressed: false,
    didDefaultYear: false,
    ready: false,
    activeChapter: 'hub',
    activeTab: 'activity',
    pages: { activity: 0, files: 0, downloads: 0, load: 0, totals: 0 },
    sorts: {
      activity: { key: 'PARTITION', dir: 'asc' },
      files: { key: 'SOURCE_FILE_DATE', dir: 'desc' },
      downloads: { key: 'EVENT_DATE', dir: 'desc' },
      load: { key: 'MEMBER_DATE', dir: 'desc' },
      totals: { key: 'INSTANCE_NUM', dir: 'desc' }
    },
    colCache: {},
    loading: { activity: true, files: false, downloads: false, load: false, totals: false },
    errors: { activity: '', files: '', downloads: '', load: '', totals: '' },
    sliceKey: { files: null, downloads: null, load: null, totals: null },
    fetchGen: { files: 0, downloads: 0, load: 0, totals: 0 },
    heavyInflightKey: { files: null, downloads: null, load: null, totals: null },
    capped: { files: false, downloads: false, load: false },
    scopeCounts: { files: null, downloads: null, load: null, totals: null },
    pageRows: { activity: [], files: [], downloads: [], load: [], totals: [] },
    selectedProgramKey: null,
    selectedProgramRow: null,
    selectedFileRow: null
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeSql(s) {
    return String(s == null ? '' : s).replace(/'/g, "''");
  }

  function trimStr(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function setAppLoading(active, label) {
    if (!els.overlay) return;
    if (label && els.overlayLabel) els.overlayLabel.textContent = label;
    els.overlay.classList.toggle('is-active', !!active);
    els.overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    els.overlay.setAttribute('aria-busy', active ? 'true' : 'false');
  }

  function setStatus() {
    /* Global chapter status line removed — panels and overlays carry loading UX. */
  }

  function columnName(col) {
    if (col == null) return '';
    if (typeof col === 'string') return col;
    if (typeof col === 'object') {
      if (col.name != null) return String(col.name);
      if (col.column != null) return String(col.column);
      if (col.field != null) return String(col.field);
    }
    return String(col);
  }

  function parseSqlResp(resp) {
    if (resp && Array.isArray(resp.columns) && Array.isArray(resp.rows)) {
      return { cols: resp.columns.map(columnName), rows: resp.rows };
    }
    if (Array.isArray(resp) && resp.length && Array.isArray(resp[0])) {
      return { cols: resp[0].map(columnName), rows: resp.slice(1) };
    }
    if (Array.isArray(resp) && resp.length && typeof resp[0] === 'object') {
      var c = Object.keys(resp[0]);
      return { cols: c, rows: resp.map(function (r) { return c.map(function (k) { return r[k]; }); }) };
    }
    return { cols: [], rows: [] };
  }

  function colIdx(cols, name) {
    var upper = String(name).toUpperCase();
    for (var i = 0; i < cols.length; i++) {
      if (String(cols[i]).toUpperCase() === upper) return i;
    }
    return -1;
  }

  function rowsFromSql(raw, keys) {
    var parsed = parseSqlResp(raw);
    return parsed.rows.map(function (row) {
      var o = {};
      (keys || parsed.cols).forEach(function (f) {
        var i = colIdx(parsed.cols, f);
        if (Array.isArray(row)) o[f] = i >= 0 ? row[i] : null;
        else if (row && typeof row === 'object') {
          o[f] = row[f] !== undefined ? row[f] : (i >= 0 ? row[parsed.cols[i]] : null);
        } else o[f] = null;
      });
      if (!keys) {
        parsed.cols.forEach(function (f, i) {
          if (o[f] === undefined) o[f] = Array.isArray(row) ? row[i] : row[f];
        });
      }
      return o;
    });
  }

  function normalizePayloadRows(payload) {
    if (payload && Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
      return rowsFromSql(payload);
    }
    if (Array.isArray(payload) && payload.length && typeof payload[0] === 'object' && !Array.isArray(payload[0])) {
      return payload;
    }
    if (Array.isArray(payload) && payload.length && Array.isArray(payload[0])) {
      return rowsFromSql(payload);
    }
    if (payload && Array.isArray(payload.rows)) return payload.rows;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function withTimeout(promise, ms, label) {
    var settled = false;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error((label || 'Request') + ' timed out after ' + ms + 'ms'));
      }, ms);
      promise.then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function errMessage(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    var msg = err.message || err.statusReason || err.statusText || '';
    var detail = '';
    if (typeof err.responseText === 'string' && err.responseText) detail = err.responseText;
    else if (typeof err.body === 'string' && err.body) detail = err.body;
    else if (err.error != null && String(err.error) !== msg) detail = String(err.error);
    detail = detail ? String(detail).replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    if (detail && detail !== msg) {
      if (!msg || msg === 'Error') return detail;
      return msg + ' — ' + detail;
    }
    return msg || String(err);
  }

  function tryAliases(spec, fn, skipId) {
    var names = [spec.alias];
    if (spec.id && !skipId) names.push(spec.id);
    function next(i) {
      if (i >= names.length) return Promise.reject(new Error('No data from ' + spec.alias));
      return fn(names[i]).catch(function (err) {
        if (i + 1 >= names.length) return Promise.reject(err);
        if (window.OpsUi && OpsUi.shouldFallbackToDatasetId && !OpsUi.shouldFallbackToDatasetId(err)) {
          return Promise.reject(err);
        }
        return next(i + 1).catch(function (idErr) {
          var prefer = window.OpsUi && OpsUi.errorAfterDatasetIdFallback;
          return Promise.reject(prefer ? prefer(err, idErr) : idErr);
        });
      });
    }
    return next(0);
  }

  function fetchViaDataApi(spec, fields, filterStr) {
    return tryAliases(spec, function (alias) {
      var url = '/data/v1/' + encodeURIComponent(alias) + '?limit=' + ROW_CAP;
      if (fields && fields.length) url += '&fields=' + encodeURIComponent(fields.join(','));
      if (filterStr) url += '&filter=' + encodeURIComponent(filterStr);
      return withTimeout(domo.get(url), 45000, spec.alias + ' Data API').then(function (payload) {
        return normalizePayloadRows(payload);
      });
    }, !!filterStr);
  }

  function fetchViaSql(spec, sql, keys, timeoutMs) {
    var alias = spec.alias;
    var q = sql.replace(/\{alias\}/g, alias);
    return withTimeout(
      domo.post('/sql/v1/' + alias, q, { contentType: 'text/plain' }),
      timeoutMs || 60000,
      spec.alias + ' SQL'
    ).then(function (raw) {
      if (raw && typeof raw === 'object' && !Array.isArray(raw) &&
          (raw.error || raw.status === 'error') && !raw.columns && !raw.rows) {
        throw new Error(raw.error || raw.message || spec.alias + ' SQL error');
      }
      return keys ? rowsFromSql(raw, keys) : rowsFromSql(raw);
    });
  }

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    var s = String(v).trim();
    if (!s || s.indexOf('1900-01-01') === 0) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) return new Date(Number(m2[3]), Number(m2[1]) - 1, Number(m2[2]));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function formatDate(v) {
    var d = parseDate(v);
    if (!d) return trimStr(v) || '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatNum(n) {
    if (n == null || n === '') return '—';
    var num = typeof n === 'number' ? n : Number(String(n).replace(/,/g, ''));
    if (!isFinite(num)) return String(n);
    return Math.round(num).toLocaleString('en-US');
  }

  function formatCompact(n) {
    if (n == null || n === '') return '—';
    var num = typeof n === 'number' ? n : Number(String(n).replace(/,/g, ''));
    if (!isFinite(num)) return String(n);
    var abs = Math.abs(num);
    var out;
    if (abs >= 1000000) {
      out = (num / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    } else if (abs >= 10000) {
      out = (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    } else {
      out = Math.round(num).toLocaleString('en-US');
    }
    return out;
  }

  function toNumber(v) {
    if (v == null || v === '') return 0;
    var n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  function isActiveRow(row) {
    var v = row.ACTIVE_FLAG;
    if (v == null || v === '') {
      var status = trimStr(row.PROGRAM_STATUS).toUpperCase();
      if (status.indexOf('DEVELOPMENT') >= 0 || status.indexOf('DEVELOP') >= 0) return false;
      if (status) return status.indexOf('ACTIVE') >= 0 && status.indexOf('INACTIVE') < 0;
      return false;
    }
    var s = String(v).trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'ACTIVE';
  }

  function programLifecycle(row) {
    var status = trimStr(rowVal(row, 'PROGRAM_STATUS')).toUpperCase();
    if (status.indexOf('DEVELOPMENT') >= 0 || status.indexOf('DEVELOP') >= 0) return 'development';
    if (status.indexOf('INACTIVE') >= 0) return 'inactive';
    if (isActiveRow(row)) return 'active';
    if (status.indexOf('ACTIVE') >= 0) return 'inactive';
    return 'inactive';
  }

  function matchesSelected(value, selected) {
    if (!selected || !selected.length) return true;
    var v = trimStr(value);
    if (!v) return false;
    for (var i = 0; i < selected.length; i++) {
      if (selected[i] === v) return true;
      if (sameText(selected[i], v)) return true;
    }
    return false;
  }

  function compactJoinKey(v) {
    return Join.compactJoinKey ? Join.compactJoinKey(v) : trimStr(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function partitionKeysOverlap(a, b) {
    if (Join.partitionKeysOverlap) return Join.partitionKeysOverlap(a, b);
    var na = compactJoinKey(a);
    var nb = compactJoinKey(b);
    if (!na || !nb) return false;
    return na === nb;
  }

  function canonicalCampaignCode(v) {
    return Join.canonicalCampaignCode ? Join.canonicalCampaignCode(v) : trimStr(v).toUpperCase();
  }

  function yearsEquivalent(a, b) {
    if (Join.yearsEquivalent) return Join.yearsEquivalent(a, b);
    return sameText(a, b);
  }

  function matchesSelectedYears(value, selected) {
    if (Join.matchesSelectedYears) return Join.matchesSelectedYears(value, selected);
    if (!selected || !selected.length) return true;
    return matchesSelected(value, selected);
  }

  function matchesSelectedCampaigns(value, selected) {
    if (Join.matchesSelectedCampaigns) return Join.matchesSelectedCampaigns(value, selected);
    return matchesSelected(value, selected);
  }

  function matchesSelectedPartners(value, selected) {
    if (Join.matchesSelectedPartners) return Join.matchesSelectedPartners(value, selected);
    return matchesSelected(value, selected);
  }

  function sameText(a, b) {
    return trimStr(a).toLowerCase() === trimStr(b).toLowerCase();
  }

  function matchesDownloadPartner(row, selected) {
    if (!selected || !selected.length) return true;
    var client = trimStr(rowVal(row, 'CLIENT'));
    var partition = trimStr(rowVal(row, 'PARTITION'));
    var file = trimStr(rowVal(row, 'FILE_NAME'));
    var path = trimStr(rowVal(row, 'FILE_PATH')).replace(/\\/g, '/');
    var i;
    for (i = 0; i < selected.length; i++) {
      var p = trimStr(selected[i]);
      if (!p) continue;
      if (sameText(client, p) || sameText(partition, p)) return true;
      if (partitionKeysOverlap(client, p) || partitionKeysOverlap(partition, p)) return true;
      var lower = p.toLowerCase();
      if (file.toLowerCase().indexOf('_' + lower + '_') >= 0) return true;
      if (path.toLowerCase().indexOf('/' + lower) >= 0) return true;
    }
    return false;
  }

  function sqlInList(values) {
    return values.map(function (v) { return "'" + escapeSql(v) + "'"; }).join(',');
  }

  function appendFieldFilter(clauses, field, values) {
    if (!values || !values.length) return;
    if (values.length === 1) {
      clauses.push(field + " = '" + escapeSql(values[0]) + "'");
    } else {
      clauses.push(field + ' IN (' + sqlInList(values) + ')');
    }
  }

  function leadsPartnerOrClientClause() {
    var partners = partnerListForQuery();
    if (!partners.length) return '';
    var parts = [];
    partners.forEach(function (p) {
      var v = escapeSql(trimStr(p));
      if (!v) return;
      parts.push("PARTITION = '" + v + "'");
      parts.push("CLIENT = '" + v + "'");
    });
    return parts.length ? '(' + parts.join(' OR ') + ')' : '';
  }

  function campaignValuesForQuery() {
    if (Join.campaignQueryValues) return Join.campaignQueryValues(state.filters.campaigns);
    return state.filters.campaigns;
  }

  function sqlWhereLeadsTotals(opts) {
    opts = opts || {};
    var clauses = [];
    if (opts.client === false) {
      appendFieldFilter(clauses, 'PARTITION', partnerListForQuery());
    } else {
      var partnerSql = leadsPartnerOrClientClause();
      if (partnerSql) clauses.push(partnerSql);
      else appendFieldFilter(clauses, 'PARTITION', partnerListForQuery());
    }
    appendFieldFilter(clauses, 'PROGRAM_SOLUTION', campaignValuesForQuery());
    appendFieldFilter(clauses, 'CAMPAIGN_YEAR', state.filters.years);
    return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  }

  function dedupeTotalsRowsForProgram(rows, partner) {
    if (!rows || rows.length <= 1) return rows || [];
    var exact = rows.filter(function (r) { return sameText(scopePartner(r), partner); });
    if (exact.length === 1) return exact;
    var byKey = {};
    rows.forEach(function (r) {
      var k = scopeCampaign(r) + '\0' + scopeYear(r);
      var n = toNumber(rowVal(r, 'INSTANCE_NUM')) || 0;
      if (!byKey[k] || n >= byKey[k].n) byKey[k] = { row: r, n: n };
    });
    return Object.keys(byKey).map(function (k) { return byKey[k].row; });
  }

  function rowVal(row, key) {
    if (!row) return '';
    if (row[key] !== undefined) return row[key];
    var upper = String(key).toUpperCase();
    for (var k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k) && String(k).toUpperCase() === upper) return row[k];
    }
    return '';
  }

  function firstRowVal(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = trimStr(rowVal(row, keys[i]));
      if (v) return v;
    }
    return '';
  }

  function campaignYearToken(value) {
    return Join.campaignYearToken ? Join.campaignYearToken(value) : '';
  }

  function isDownloadRow(row) {
    if (Join.isDownloadEventRow) return Join.isDownloadEventRow(row);
    if (!row) return false;
    if (row._download) return true;
    return !!(trimStr(rowVal(row, 'EVENT_DATE')) &&
      (trimStr(rowVal(row, 'FILE_PATH')) || trimStr(rowVal(row, 'IP_ADDRESS'))));
  }

  function yearTokenFromFileName(name) {
    return Join.yearTokenFromFileName ? Join.yearTokenFromFileName(name) : '';
  }

  function downloadYearToken(row) {
    var token = campaignYearToken(rowVal(row, 'CY'));
    if (token) return token;
    token = campaignYearToken(rowVal(row, 'CAMPAIGN_YEAR'));
    if (token) return token;
    return yearTokenFromFileName(firstRowVal(row, ['FILE_NAME', 'SOURCE_FILE_NAME']));
  }

  function decorateDownloadRow(row) {
    if (Join.normalizeDownloadRow) Join.normalizeDownloadRow(row);
    else row._download = true;
    var year = downloadYearToken(row);
    if (year) {
      row.CAMPAIGN_YEAR = year;
      if (!campaignYearToken(rowVal(row, 'CY'))) row.CY = year;
    }
    return row;
  }

  function scopePartner(row) {
    if (isDownloadRow(row)) return firstRowVal(row, ['CLIENT', 'PARTITION', 'PARTNER']);
    return firstRowVal(row, ['PARTITION', 'CLIENT', 'PARTNER', 'PROGRAM_PARTITION']);
  }

  function scopeCampaign(row) {
    return firstRowVal(row, ['CAMPAIGN', 'PROGRAM_SOLUTION', 'CAMPAIGN_SOLUTION', 'PROGRAM']);
  }

  function scopeYear(row) {
    if (isDownloadRow(row)) return downloadYearToken(row);
    var fields = ['CAMPAIGN_YEAR', 'YEAR', 'PROGRAM_YEAR', 'CY'];
    var i;
    for (i = 0; i < fields.length; i++) {
      var token = campaignYearToken(rowVal(row, fields[i]));
      if (token) return token;
    }
    return yearTokenFromFileName(firstRowVal(row, ['SOURCE_FILE', 'SOURCE_FILE_NAME', 'FILE_NAME']));
  }

  function fileSourceName(row) {
    return firstRowVal(row, ['SOURCE_FILE', 'SOURCE_FILE_NAME']);
  }

  function fileTypeName(row) {
    return firstRowVal(row, ['FILETYPE', 'FILE_NAME']);
  }

  function normalizeScopeFields(row) {
    if (!row || typeof row !== 'object') return row;
    if (!trimStr(rowVal(row, 'PARTITION'))) {
      var partner = scopePartner(row);
      if (partner) row.PARTITION = partner;
    }
    if (!trimStr(rowVal(row, 'PROGRAM_SOLUTION'))) {
      var campaign = scopeCampaign(row);
      if (campaign) row.PROGRAM_SOLUTION = campaign;
    }
    if (!trimStr(rowVal(row, 'CAMPAIGN_YEAR'))) {
      var year = scopeYear(row);
      if (year) row.CAMPAIGN_YEAR = year;
    }
    return row;
  }

  function uniqueSorted(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) {
      var s = trimStr(v);
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    out.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
    return out;
  }

  function yearSortKey(year) {
    var m = String(year || '').toUpperCase().match(/^CY\s*(\d{2,4})$/);
    if (!m) return 0;
    var n = Number(m[1]);
    return n < 100 ? 2000 + n : n;
  }

  function fillSelect(el, values, allLabel, selected) {
    if (!el) return;
    var html = '<option value="">' + escapeHtml(allLabel) + '</option>';
    values.forEach(function (v) {
      html += '<option value="' + escapeHtml(v) + '"' + (v === selected ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
    });
    el.innerHTML = html;
    if (selected && values.indexOf(selected) >= 0) el.value = selected;
    else el.value = '';
  }

  function updateMultiLabel(labelEl, selected, allLabel, noun) {
    if (!labelEl) return;
    if (!selected.length) {
      labelEl.textContent = allLabel;
      return;
    }
    if (selected.length === 1) {
      labelEl.textContent = selected[0];
      return;
    }
    labelEl.textContent = selected.length + ' ' + noun + ' selected';
  }

  var menuSearchQueries = {};
  var MENU_SEARCH_PLACEHOLDER = 'Search…';
  var MENU_RENDER_CAP = 80;

  function menuOptionValue(opt) {
    return typeof opt === 'string' ? opt : opt.value;
  }

  function menuOptionLabel(opt) {
    return typeof opt === 'string' ? opt : opt.label;
  }

  function clearMenuSearchQueries() {
    menuSearchQueries = {};
  }

  function renderMultiMenu(menuEl, options, selectedKey, selectedValues, onChange, emptyLabel, clearSelectionFn) {
    if (!menuEl) return;
    var prevQuery = menuSearchQueries[menuEl.id] || '';
    var searchWasFocused = menuEl.contains(document.activeElement) &&
      document.activeElement.classList &&
      document.activeElement.classList.contains('multi-select-search-input');
    var mount = window.OpsFilterMenu && window.OpsFilterMenu.mountPinnedHead
      ? window.OpsFilterMenu.mountPinnedHead(menuEl, {
        placeholder: MENU_SEARCH_PLACEHOLDER,
        searchValue: prevQuery,
        optionCount: (options || []).length,
        selectedCount: selectedValues.length,
        onClear: function () {
          state.draft[selectedKey] = typeof clearSelectionFn === 'function'
            ? clearSelectionFn()
            : [];
          menuSearchQueries[menuEl.id] = '';
          onChange();
        }
      })
      : null;
    var listEl = mount ? mount.optionsEl : null;
    var searchInput = mount ? mount.searchInput : null;
    if (!listEl) {
      menuEl.innerHTML = '';
      listEl = menuEl;
    }

    var normalized = (options || []).map(function (opt) {
      var label = menuOptionLabel(opt);
      return {
        value: menuOptionValue(opt),
        label: label,
        labelLower: trimStr(label).toLowerCase()
      };
    });
    var selectedMap = {};
    (selectedValues || []).forEach(function (v) { selectedMap[v] = true; });

    function appendOption(parent, opt) {
      var row = document.createElement('label');
      row.className = 'multi-select-option';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = opt.value;
      input.checked = !!selectedMap[opt.value];
      input.addEventListener('change', function () {
        var list = state.draft[selectedKey].slice();
        var idx = list.indexOf(opt.value);
        if (input.checked) {
          if (idx < 0) list.push(opt.value);
        } else if (idx >= 0) {
          list.splice(idx, 1);
        }
        state.draft[selectedKey] = list;
        onChange();
      });
      var text = document.createElement('span');
      text.textContent = opt.label;
      row.appendChild(input);
      row.appendChild(text);
      parent.appendChild(row);
    }

    function paintOptions(query) {
      listEl.textContent = '';
      if (!normalized.length) {
        var empty = document.createElement('div');
        empty.className = 'multi-select-empty';
        empty.textContent = emptyLabel || 'No options';
        listEl.appendChild(empty);
        return;
      }
      var q = trimStr(query).toLowerCase();
      var shown = [];
      var matchCount = 0;
      var i;
      for (i = 0; i < normalized.length; i++) {
        var opt = normalized[i];
        if (q && opt.labelLower.indexOf(q) < 0) continue;
        matchCount++;
        shown.push(opt);
      }
      if (!matchCount) {
        var none = document.createElement('div');
        none.className = 'multi-select-empty';
        none.textContent = 'No matches';
        listEl.appendChild(none);
        return;
      }
      var capped = shown.length > MENU_RENDER_CAP;
      if (capped) shown = shown.slice(0, MENU_RENDER_CAP);
      var frag = document.createDocumentFragment();
      shown.forEach(function (opt) { appendOption(frag, opt); });
      if (capped) {
        var more = document.createElement('div');
        more.className = 'multi-select-more';
        more.textContent = 'Showing ' + MENU_RENDER_CAP + ' of ' + matchCount + '. Keep typing to narrow.';
        frag.appendChild(more);
      }
      listEl.appendChild(frag);
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        menuSearchQueries[menuEl.id] = searchInput.value;
        menuEl.classList.toggle('is-search-active', !!trimStr(searchInput.value));
        paintOptions(searchInput.value);
      });
      paintOptions(prevQuery);
      if (searchWasFocused) searchInput.focus();
    } else {
      paintOptions(prevQuery);
    }
  }

  function isScopeMenuEl(menu) {
    if (!menu || !menu.id) return false;
    return menu.id === 'partnerMenu' || menu.id === 'campaignMenu' || menu.id === 'yearMenu';
  }

  function scopeMenuPairs() {
    return [
      { trigger: els.partnerTrigger, menu: els.partnerMenu },
      { trigger: els.campaignTrigger, menu: els.campaignMenu },
      { trigger: els.yearTrigger, menu: els.yearMenu }
    ];
  }

  function scopeFilterClusterEl() {
    return document.getElementById('pdhScopeFilterCluster');
  }

  function isScopeFilterClusterOpen() {
    var cluster = scopeFilterClusterEl();
    return !!(cluster && cluster.classList.contains('is-linked-open'));
  }

  function setScopeMenusOpen(open) {
    var needsPopulate = false;
    scopeMenuPairs().forEach(function (pair) {
      if (!pair.menu || !pair.trigger) return;
      pair.menu.hidden = !open;
      pair.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      var field = pair.trigger.closest('.field-multi');
      if (field) field.classList.toggle('is-open', open);
      if (open && pair.menu.childNodes.length === 0) needsPopulate = true;
    });
    if (open && needsPopulate) populateFilters();
    var cluster = scopeFilterClusterEl();
    if (cluster) cluster.classList.toggle('is-linked-open', open);
    var bar = document.querySelector('#sharedFiltersChrome .filters-bar');
    if (bar) bar.classList.toggle('is-scope-filters-open', open);
  }

  function closeMultiMenus(exceptMenu) {
    var scopeHold = exceptMenu && isScopeMenuEl(exceptMenu);
    [
      { trigger: els.partnerTrigger, menu: els.partnerMenu, field: els.partnerTrigger && els.partnerTrigger.closest('.field-multi') },
      { trigger: els.campaignTrigger, menu: els.campaignMenu, field: els.campaignTrigger && els.campaignTrigger.closest('.field-multi') },
      { trigger: els.yearTrigger, menu: els.yearMenu, field: els.yearTrigger && els.yearTrigger.closest('.field-multi') },
      { trigger: els.statusTrigger, menu: els.statusMenu, field: els.statusTrigger && els.statusTrigger.closest('.field-multi') }
    ].forEach(function (pair) {
      if (!pair.menu || pair.menu === exceptMenu) return;
      if (scopeHold && isScopeMenuEl(pair.menu)) return;
      pair.menu.hidden = true;
      if (pair.trigger) pair.trigger.setAttribute('aria-expanded', 'false');
      if (pair.field) pair.field.classList.remove('is-open');
    });
    if (!scopeHold) setScopeMenusOpen(false);
  }

  function toggleMultiMenu(trigger, menu) {
    if (!trigger || !menu) return;
    if (isScopeMenuEl(menu)) {
      if (!menu.hidden) {
        setScopeMenusOpen(false);
        return;
      }
      closeMultiMenus(menu);
      setScopeMenusOpen(true);
      return;
    }
    var field = trigger.closest('.field-multi');
    var open = menu.hidden;
    setScopeMenusOpen(false);
    closeMultiMenus(open ? menu : null);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (field) field.classList.toggle('is-open', open);
    if (open && menu.childNodes.length === 0) populateFilters();
  }

  function initMultiSelectTriggers() {
    [
      { trigger: els.partnerTrigger, menu: els.partnerMenu },
      { trigger: els.campaignTrigger, menu: els.campaignMenu },
      { trigger: els.yearTrigger, menu: els.yearMenu },
      { trigger: els.statusTrigger, menu: els.statusMenu }
    ].forEach(function (pair) {
      if (!pair.trigger || !pair.menu) return;
      pair.menu.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      pair.trigger.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleMultiMenu(pair.trigger, pair.menu);
      });
    });
    document.addEventListener('click', function (ev) {
      var cluster = scopeFilterClusterEl();
      if (cluster && cluster.contains(ev.target)) return;
      closeMultiMenus(null);
    });
  }

  function indexRows(rows) {
    (rows || []).forEach(normalizeScopeFields);
    return rows || [];
  }

  function keysFromRows(rows) {
    var seen = {};
    var keys = [];
    var scan = (rows || []).slice(0, 30);
    scan.forEach(function (row) {
      Object.keys(row || {}).forEach(function (k) {
        if (seen[k] || k.charAt(0) === '_') return;
        seen[k] = true;
        keys.push(k);
      });
    });
    return keys;
  }

  function colsForRows(rows, preferred, opts) {
    var present = {};
    keysFromRows(rows).forEach(function (k) { present[String(k).toUpperCase()] = k; });
    var cols = [];
    var used = {};
    (preferred || []).forEach(function (spec) {
      var actual = present[spec.key.toUpperCase()];
      if (!actual || used[actual.toUpperCase()]) return;
      if (cols.some(function (c) { return c.label === spec.label; })) return;
      used[actual.toUpperCase()] = true;
      cols.push({ key: actual, label: spec.label, kind: spec.kind });
    });
    if (opts && opts.strict) return cols;
    keysFromRows(rows).forEach(function (k) {
      if (used[k.toUpperCase()] || FILTER_SKIP[k.toUpperCase()] || FILTER_SKIP[k]) return;
      var kind = NUMERIC_HINT.test(k) ? 'num' : (DATE_HINT.test(k) ? 'date' : 'text');
      cols.push({ key: k, label: k.replace(/_/g, ' '), kind: kind });
    });
    return cols;
  }

  function colsForTable(tableKey, rows, preferred) {
    if (state.colCache[tableKey] && state.colCache[tableKey].length) return state.colCache[tableKey];
    var meta = PANELS[tableKey] || {};
    var cols = colsForRows(rows, preferred, meta);
    if (rows && rows.length && cols.length) state.colCache[tableKey] = cols;
    return cols;
  }

  function effectivePartners() {
    var selected = state.filters.partners.slice();
    if (state.portalPartners && state.portalPartners.length) {
      if (!selected.length) return state.portalPartners.slice();
      var allow = {};
      state.portalPartners.forEach(function (p) { allow[String(p).toLowerCase()] = true; });
      return selected.filter(function (p) { return allow[String(p).toLowerCase()]; });
    }
    return selected;
  }

  function partnerListForQuery() {
    return effectivePartners();
  }

  function canFetchHeavy() {
    return !!(state.filters.years.length || state.filters.partners.length ||
      (state.portalPartners && state.portalPartners.length));
  }

  function currentSliceKey() {
    return [
      state.filters.partners.join('|'),
      state.filters.campaigns.join('|'),
      state.filters.years.join('|'),
      state.filters.statuses.join('|'),
      (state.portalPartners || []).join('|')
    ].join('\0');
  }

  function sqlWhere(opts) {
    opts = opts || {};
    var clauses = [];
    var partnerField = opts.partnerField || 'PARTITION';
    appendFieldFilter(clauses, partnerField, partnerListForQuery());
    appendFieldFilter(clauses, opts.campaignField || 'PROGRAM_SOLUTION', campaignValuesForQuery());
    if (opts.year !== false) appendFieldFilter(clauses, 'CAMPAIGN_YEAR', state.filters.years);
    return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  }

  function dataApiFilter(opts) {
    opts = opts || {};
    var parts = [];
    var partners = partnerListForQuery();
    if (partners.length === 1) {
      parts.push("PARTITION = '" + escapeSql(partners[0]) + "'");
    }
    var campaignValues = campaignValuesForQuery();
    if (state.filters.campaigns.length === 1 && campaignValues.length === 1) {
      parts.push((opts.campaignField || 'PROGRAM_SOLUTION') + " = '" + escapeSql(campaignValues[0]) + "'");
    }
    if (opts.year !== false && state.filters.years.length === 1) {
      parts.push("CAMPAIGN_YEAR = '" + escapeSql(state.filters.years[0]) + "'");
    }
    return parts.join(' AND ');
  }

  function isIgnoredPartition(name) {
    if (Join.isIgnoredPartition) return Join.isIgnoredPartition(name);
    var s = trimStr(name);
    return s && s.toLowerCase().indexOf('z_') === 0;
  }

  function matchesFilters(row, opts, filterOverride) {
    var f = filterOverride || state.filters;
    var partner = scopePartner(row);
    if (isIgnoredPartition(partner)) return false;
    var campaign = scopeCampaign(row);
    var year = scopeYear(row);
    var download = isDownloadRow(row);
    if (state.portalPartners && state.portalPartners.length) {
      if (download) {
        if (!matchesDownloadPartner(row, state.portalPartners)) return false;
      } else {
        var okPortal = false;
        for (var i = 0; i < state.portalPartners.length; i++) {
          if (partner.toLowerCase() === String(state.portalPartners[i]).toLowerCase()) { okPortal = true; break; }
        }
        if (!okPortal) return false;
      }
    }
    if (download) {
      if (!matchesDownloadPartner(row, f.partners.length ? f.partners : null)) return false;
    } else if (!matchesSelected(partner, f.partners.length ? f.partners : null)) {
      return false;
    }
    if (!matchesSelectedCampaigns(campaign, f.campaigns.length ? f.campaigns : null)) return false;
    if (opts && opts.status) {
      var statusList = effectiveStatusFilter(f.statuses);
      if (statusList && statusList.indexOf(programLifecycle(row)) < 0) return false;
    }
    if (f.years.length && opts && opts.requireYear) {
      if (!year || !matchesSelectedYears(year, f.years)) return false;
    } else if (year && !matchesSelectedYears(year, f.years.length ? f.years : null)) {
      return false;
    }
    return true;
  }

  function sortRows(rows, spec, cols) {
    var key = spec.key;
    var dir = spec.dir === 'desc' ? -1 : 1;
    var col = null;
    for (var i = 0; i < (cols || []).length; i++) {
      if (cols[i].key === key) { col = cols[i]; break; }
    }
    var numeric = col && (col.kind === 'num' || col.kind === 'compact' || col.kind === 'stale');
    var dated = col && col.kind === 'date';
    return rows.slice().sort(function (a, b) {
      var av = displayMetricRaw(a, key);
      var bv = displayMetricRaw(b, key);
      if (numeric) return (toNumber(av) - toNumber(bv)) * dir;
      if (dated) {
        var ad = parseDate(av); var bd = parseDate(bv);
        var at = ad ? ad.getTime() : 0; var bt = bd ? bd.getTime() : 0;
        return (at - bt) * dir;
      }
      return trimStr(av).localeCompare(trimStr(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }

  function statusChipHtml(status) {
    var s = trimStr(status);
    if (!s) return '—';
    var kind = 'neutral';
    var u = s.toUpperCase();
    if (u.indexOf('INACTIVE') >= 0) kind = 'inactive';
    else if (u.indexOf('DEVELOPMENT') >= 0 || u.indexOf('DEVELOP') >= 0) kind = 'development';
    else if (u.indexOf('ACTIVE') >= 0) kind = 'active';
    return '<span class="status-chip status-chip--' + kind + '">' + escapeHtml(s) + '</span>';
  }

  function staleClass(days) {
    var n = toNumber(days);
    if (n >= STALE_HOT) return 'stale-hot';
    if (n >= STALE_WARM) return 'stale-warm';
    return '';
  }

  function programKey(row) {
    return [
      trimStr(rowVal(row, 'PARTITION')),
      trimStr(rowVal(row, 'PROGRAM_SOLUTION')),
      trimStr(rowVal(row, 'CAMPAIGN_YEAR')),
      trimStr(rowVal(row, 'INSTANCE_NUM'))
    ].join('|');
  }

  function findProgramByKey(key) {
    if (!key) return null;
    for (var i = 0; i < state.programs.length; i++) {
      if (programKey(state.programs[i]) === key) return state.programs[i];
    }
    return state.selectedProgramRow;
  }

  function sameProgram(a, b) {
    if (!a || !b) return false;
    if (scopePartner(a) !== scopePartner(b)) return false;
    if (scopeCampaign(a) !== scopeCampaign(b)) return false;
    var ya = scopeYear(a);
    var yb = scopeYear(b);
    if (ya && yb && ya !== yb) return false;
    return true;
  }

  function lastActivityTime(row) {
    var d = parseDate(rowVal(row, 'LAST_ACTIVITY')) ||
      parseDate(rowVal(row, 'SOURCE_FILE_DATE')) ||
      parseDate(rowVal(row, 'MEMBER_DATE')) ||
      parseDate(rowVal(row, 'EVENT_DATE'));
    return d ? d.getTime() : 0;
  }

  var programsByPartnerCache = null;

  function partnerBucketKey(name) {
    var alias = Join.partnerAliasId ? Join.partnerAliasId(name) : '';
    if (alias) return 'a:' + alias;
    var compact = Join.compactJoinKey ? Join.compactJoinKey(name) : trimStr(name).toLowerCase();
    return compact ? 'k:' + compact : '';
  }

  function programsForPartner(name) {
    if (!programsByPartnerCache || programsByPartnerCache.src !== state.programs) {
      var map = {};
      (state.programs || []).forEach(function (p) {
        var key = partnerBucketKey(scopePartner(p));
        if (!key) return;
        if (!map[key]) map[key] = [];
        map[key].push(p);
      });
      programsByPartnerCache = { src: state.programs, map: map };
    }
    var key = partnerBucketKey(name);
    return key && programsByPartnerCache.map[key] ? programsByPartnerCache.map[key] : [];
  }

  function resolveProgramRow(sourceRow, tableName) {
    if (!sourceRow) return null;
    if (tableName === 'activity') return sourceRow;
    var partner = scopePartner(sourceRow);
    var campaign = scopeCampaign(sourceRow);
    var year = scopeYear(sourceRow);
    var bucket = programsForPartner(partner);
    var matches = [];
    var i;
    for (i = 0; i < bucket.length; i++) {
      var p = bucket[i];
      if (!partitionKeysOverlap(scopePartner(p), partner) && scopePartner(p) !== partner) continue;
      if (!matchesSelectedCampaigns(scopeCampaign(p), campaign ? [campaign] : null)) continue;
      var py = scopeYear(p);
      if (year && py && !yearsEquivalent(py, year)) continue;
      matches.push(p);
    }
    if (year) {
      var yearHits = matches.filter(function (p) { return yearsEquivalent(scopeYear(p), year); });
      if (yearHits.length) matches = yearHits;
    }
    if (effectiveStatusFilter(state.filters.statuses)) {
      matches = matches.filter(function (p) {
        return matchesFilters(p, { status: true });
      });
    }
    if (!matches.length) return sourceRow;
    matches.sort(function (a, b) { return lastActivityTime(b) - lastActivityTime(a); });
    return matches[0];
  }

  function rowFromClickable(el) {
    if (!el) return null;
    var table = el.getAttribute('data-table');
    var idx = parseInt(el.getAttribute('data-row-idx'), 10);
    var rows = state.pageRows[table] || [];
    if (!table || !isFinite(idx) || idx < 0 || idx >= rows.length) return null;
    return { row: rows[idx], table: table };
  }

  function openDetailFromClickable(el) {
    var hit = rowFromClickable(el);
    if (!hit) return;
    state.selectedFileRow = hit.table === 'files' ? hit.row : null;
    openProgramDetail(resolveProgramRow(hit.row, hit.table));
  }

  function rowsForProgram(dataset, programRow) {
    var partner = trimStr(rowVal(programRow, 'PARTITION'));
    var campaign = trimStr(rowVal(programRow, 'PROGRAM_SOLUTION'));
    var year = trimStr(rowVal(programRow, 'CAMPAIGN_YEAR'));
    var rows = dataset.filter(function (r) {
      if (isDownloadRow(r)) {
        if (!matchesDownloadPartner(r, [partner])) return false;
      } else if (scopePartner(r) !== partner && !partitionKeysOverlap(scopePartner(r), partner)) {
        return false;
      }
      if (!matchesSelectedCampaigns(scopeCampaign(r), [campaign])) return false;
      var rowYear = scopeYear(r);
      if (rowYear && year && !yearsEquivalent(rowYear, year)) return false;
      return true;
    });
    if (dataset === state.totals) rows = dedupeTotalsRowsForProgram(rows, partner);
    return rows;
  }

  function getDashboardExceptions() {
    if (window.OpsCommandCenter && typeof window.OpsCommandCenter.getExceptions === 'function') {
      return window.OpsCommandCenter.getExceptions();
    }
    return [];
  }

  function formatLaunchDate(firstActivity, programRow) {
    var Join = window.OpsJoin;
    if (!Join) return '—';
    var ex = getDashboardExceptions();
    if (programRow && Join.effectiveCampaignAvailabilityDate) {
      return Join.formatAvailabilityDate(Join.effectiveCampaignAvailabilityDate(programRow, state.programs, ex));
    }
    if (!Join.dashboardAvailabilityDate) return '—';
    return Join.formatAvailabilityDate(Join.dashboardAvailabilityDate(firstActivity));
  }

  function formatCrossCampaignAvailability(row) {
    var Join = window.OpsJoin;
    if (!Join) return null;
    var partner = trimStr(rowVal(row, 'PARTITION'));
    var year = scopeYear(row);
    var ex = getDashboardExceptions();
    var when = Join.effectiveCrossCampaignAvailabilityDate
      ? Join.effectiveCrossCampaignAvailabilityDate(state.programs, partner, year, ex)
      : (Join.crossCampaignAvailabilityDate ? Join.crossCampaignAvailabilityDate(state.programs, partner, year) : null);
    if (!when) return null;
    return Join.formatAvailabilityDate(when);
  }

  function availabilityTitleCampaign() {
    return 'Campaign client dashboard: two weeks after this program\u2019s first activity (FIRST_ACTIVITY).';
  }

  function availabilityTitleCross() {
    return 'Cross-campaign client dashboards: two weeks after CNVA first activity for this partner and campaign year.';
  }

  function truthyFlag(v) {
    var s = trimStr(v).toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y';
  }

  function detailSection(title, innerHtml) {
    return '<section class="detail-section"><h3 class="detail-section-title">' + escapeHtml(title) + '</h3>' + innerHtml + '</section>';
  }

  function detailDl(items) {
    if (!items.length) return '<p class="detail-empty">—</p>';
    return '<dl class="detail-dl">' + items.map(function (item) {
      return '<div class="detail-dl-row"><dt>' + escapeHtml(item.label) + '</dt><dd>' + item.html + '</dd></div>';
    }).join('') + '</dl>';
  }

  function detailMetricGrid(cols, row) {
    if (!row) return '<p class="detail-empty">No file data for this program.</p>';
    var items = cols.filter(function (c) { return c.kind === 'compact' || c.kind === 'num'; });
    if (!items.length) return '<p class="detail-empty">No metrics available.</p>';
    return '<div class="detail-metric-grid">' + items.map(function (c) {
      var cell = cellHtml(row, c);
      var title = cell.title ? ' title="' + escapeHtml(cell.title) + '"' : '';
      return '<div class="detail-metric"' + title + '><span class="detail-metric-label">' + escapeHtml(c.label) +
        '</span><span class="detail-metric-value">' + cell.html + '</span></div>';
    }).join('') + '</div>';
  }

  function heavyScopeHint() {
    if (canFetchHeavy()) return '';
    return '<p class="detail-note">' + escapeHtml(NEED_SCOPE_MSG) + '</p>';
  }

  function heavyLoadingNote(name) {
    if (!state.loading[name]) return '';
    return '<p class="detail-note">Loading ' + name + ' data…</p>';
  }

  function exportTimestamp() {
    return new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function safeFilePart(s) {
    return trimStr(s).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'export';
  }

  function exportDatePart(row, fileRow) {
    var d = fileRow ? parseDate(rowVal(fileRow, 'SOURCE_FILE_DATE')) : parseDate(rowVal(row, 'LAST_ACTIVITY'));
    if (!d) d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function exportFileNamePart(row, fileRow) {
    if (fileRow) {
      var name = fileSourceName(fileRow) || fileTypeName(fileRow);
      if (name) return safeFilePart(name.replace(/\.[^.]+$/, ''));
    }
    return safeFilePart(rowVal(row, 'PROGRAM_SOLUTION')) || 'program';
  }

  function buildExportFilename(row, fileRow) {
    return safeFilePart(rowVal(row, 'PARTITION')) + '_' +
      exportFileNamePart(row, fileRow) + '_' +
      exportDatePart(row, fileRow) + '.xls';
  }

  function exportCellValue(row, col) {
    var raw = displayMetricRaw(row, col.key);
    if (col.kind === 'status') return trimStr(raw);
    if (col.kind === 'stale' || col.kind === 'num' || col.kind === 'compact') return formatNum(raw);
    if (col.kind === 'date') return formatDate(raw);
    return trimStr(raw);
  }

  function exportRawNumber(v) {
    var n = toNumber(v);
    return isFinite(n) ? n : '';
  }

  function exportSpreadsheetStyles() {
    return [
      'body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #1a1a1a; }',
      'table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }',
      'td, th { border: 1px solid #d8dde3; padding: 6px 10px; vertical-align: top; }',
      '.cover-title { font-size: 18pt; font-weight: 700; color: #1a1a1a; padding: 0 0 4px; border: none; }',
      '.cover-sub { font-size: 11pt; color: #6b7280; border: none; padding: 2px 0; }',
      '.cover-meta { font-size: 10pt; color: #6b7280; border: none; padding: 8px 0 0; }',
      '.section-title td { background: #ffd100; color: #1a1a1a; font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border-color: #e6bc00; padding: 7px 10px; }',
      '.kv-label { background: #f3f6f5; font-weight: 600; width: 34%; color: #374151; }',
      '.kv-value { background: #ffffff; }',
      '.table-head th { background: #76b8b1; color: #1a1a1a; font-weight: 700; text-align: left; }',
      '.num { text-align: right; mso-number-format: "#,##0"; }',
      '.text { text-align: left; }',
      '.zebra-even td { background: #fafafa; }',
      '.note td { background: #fff8dc; color: #7a6200; font-style: italic; }',
      '.warn td { background: #fff4b8; color: #9a7b00; font-weight: 600; }',
      '.spacer td { border: none; height: 10px; padding: 0; }'
    ].join('\n');
  }

  function exportHtmlTable(rowsHtml) {
    return '<table cellspacing="0" cellpadding="0">' + rowsHtml + '</table>';
  }

  function exportCoverBlock(title, subtitle, metaLines) {
    var rows = [
      '<tr><td class="cover-title" colspan="6">' + escapeHtml(title) + '</td></tr>',
      '<tr><td class="cover-sub" colspan="6">' + escapeHtml(subtitle) + '</td></tr>'
    ];
    (metaLines || []).forEach(function (line) {
      rows.push('<tr><td class="cover-meta" colspan="6">' + escapeHtml(line) + '</td></tr>');
    });
    rows.push('<tr class="spacer"><td colspan="6"></td></tr>');
    return exportHtmlTable(rows.join(''));
  }

  function exportSectionTitle(label) {
    return exportHtmlTable('<tr class="section-title"><td colspan="6">' + escapeHtml(label) + '</td></tr>');
  }

  function exportKeyValueTable(pairs) {
    var rows = pairs.map(function (pair, idx) {
      var cls = idx % 2 === 1 ? ' class="zebra-even"' : '';
      return '<tr' + cls + '><td class="kv-label">' + escapeHtml(pair[0]) + '</td><td class="kv-value" colspan="5">' +
        escapeHtml(String(pair[1] == null ? '' : pair[1])) + '</td></tr>';
    });
    return exportHtmlTable(rows.join(''));
  }

  function exportNoteRow(message) {
    return exportHtmlTable('<tr class="note"><td colspan="6">' + escapeHtml(message) + '</td></tr>');
  }

  function exportDataTable(headers, bodyRows, colClasses) {
    var head = '<tr class="table-head">' + headers.map(function (h, i) {
      var cls = colClasses && colClasses[i] ? ' class="' + colClasses[i] + '"' : '';
      return '<th' + cls + '>' + escapeHtml(h) + '</th>';
    }).join('') + '</tr>';
    var body = bodyRows.map(function (cells, rowIdx) {
      var trCls = rowIdx % 2 === 1 ? ' class="zebra-even"' : '';
      return '<tr' + trCls + '>' + cells.map(function (cell, i) {
        var cls = colClasses && colClasses[i] ? ' class="' + colClasses[i] + '"' : '';
        return '<td' + cls + '>' + escapeHtml(String(cell == null ? '' : cell)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return exportHtmlTable(head + body);
  }

  function buildExportDocument(title, subtitle, metaLines, sectionsHtml) {
    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
      '<style>' + exportSpreadsheetStyles() + '</style></head><body>' +
      exportCoverBlock(title, subtitle, metaLines) +
      sectionsHtml +
      '</body></html>';
  }

  function downloadSpreadsheet(filename, html) {
    var blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function currentFilterMetaLines() {
    var f = state.filters;
    var lines = [];
    lines.push(f.partners.length ? 'Partner: ' + f.partners.join(', ') : 'Partner: all');
    lines.push(f.campaigns.length ? 'Campaign: ' + f.campaigns.join(', ') : 'Campaign: all');
    lines.push(f.years.length ? 'Year: ' + f.years.join(', ') : 'Year: all');
    if (f.statuses.length && !isAllStatusesSelected(f.statuses)) {
      lines.push('Status: ' + f.statuses.join(', '));
    }
    if (state.portalPartners && state.portalPartners.length) {
      lines.push('Portal partition: ' + state.portalPartners.join(', '));
    }
    return lines;
  }

  function setTableExportEnabled(name, enabled) {
    var btn = document.querySelector('#partnerDataHealthChapter [data-export-table="' + name + '"]');
    if (btn) btn.disabled = !enabled;
  }

  function exportPanelTable(name) {
    var meta = PANELS[name];
    if (!meta || state.loading[name]) return;
    var rows = name === 'load' ? getLoadDisplayRows() : getFiltered(name);
    if (!rows.length) return;
    var cols = colsForTable(name, rows, meta.preferred);
    if (!cols.length) return;
    var numericKinds = { num: true, compact: true, stale: true };
    var body = rows.map(function (row) {
      return cols.map(function (c) {
        if (numericKinds[c.kind]) return exportRawNumber(displayMetricRaw(row, c.key));
        return exportCellValue(row, c);
      });
    });
    var html = buildExportDocument(
      '3E Operations',
      meta.title,
      currentFilterMetaLines().concat([
        rows.length.toLocaleString('en-US') + ' ' + meta.noun + (rows.length === 1 ? '' : 's'),
        'Exported ' + exportTimestamp()
      ]),
      exportSectionTitle(meta.title) + exportDataTable(
        cols.map(function (c) { return c.label; }),
        body,
        cols.map(function (c) { return numericKinds[c.kind] ? 'num' : ''; })
      )
    );
    downloadSpreadsheet(safeFilePart(meta.title) + '_' + exportDatePart({}, null) + '.xls', html);
  }

  function panelExportBodyRows(rows, cols) {
    var numericKinds = { num: true, compact: true, stale: true };
    return rows.map(function (row) {
      return cols.map(function (c) {
        if (numericKinds[c.kind]) return exportRawNumber(displayMetricRaw(row, c.key));
        return exportCellValue(row, c);
      });
    });
  }

  function colAlignForExportCols(cols) {
    var numericKinds = { num: true, compact: true, stale: true };
    return cols.map(function (c) { return numericKinds[c.kind] ? 'right' : 'left'; });
  }

  function buildPartnerDataHealthExportBlocks() {
    var panelOrder = ['activity', 'files', 'downloads', 'load', 'totals'];
    var blocks = [];
    panelOrder.forEach(function (name) {
      if (state.loading[name]) return;
      var meta = PANELS[name];
      var rows = name === 'load' ? getLoadDisplayRows() : getFiltered(name);
      if (!rows.length) return;
      var cols = colsForTable(name, rows, meta.preferred);
      if (!cols.length) return;
      var headers = cols.map(function (c) { return c.label; });
      var body = panelExportBodyRows(rows, cols);
      var colAlign = colAlignForExportCols(cols);
      blocks.push({
        title: meta.title,
        headers: headers,
        rows: body,
        colAlign: colAlign
      });
    });
    return blocks;
  }

  function exportPartnerDataHealthChapterReport() {
    var OER = window.OpsExportReport;
    if (!OER || typeof ExcelJS === 'undefined') {
      setStatus('Excel export requires ExcelJS.', 'error');
      return;
    }
    var blocks = buildPartnerDataHealthExportBlocks();
    var subtitle = currentFilterMetaLines().join('  ·  ');
    if (!blocks.length) {
      setStatus('No data to export for the current filters.', 'error');
      return;
    }
    var wb = OER.createWorkbook();
    OER.addConsolidatedSheet(wb, {
      name: 'All Together',
      docTitle: 'Partner Data Health',
      subtitle: subtitle,
      blocks: blocks
    });
    blocks.forEach(function (block) {
      OER.addDataSheet(wb, {
        name: block.title.slice(0, 31),
        docTitle: 'Partner Data Health',
        sectionTitle: block.title,
        subtitle: subtitle,
        headers: block.headers,
        rows: block.rows,
        colAlign: block.colAlign
      });
    });
    OER.downloadWorkbook(wb, 'partner-data-health-report-' + OER.fileStamp() + '.xlsx')
      .then(function () {
        setStatus('Exported Partner Data Health report.');
      })
      .catch(function (err) {
        console.warn('[PDH] Chapter export failed:', err);
        setStatus('Export failed.', 'error');
      });
  }

  function exportFullOperationsReport() {
    var OER = window.OpsExportReport;
    if (!OER || typeof ExcelJS === 'undefined') {
      setStatus('Excel export requires ExcelJS.', 'error');
      return;
    }
    if (!state.ready) {
      setStatus('Data is still loading.', 'error');
      return;
    }
    var subtitle = currentFilterMetaLines().join('  ·  ');
    var blocks = [];
    var cc = window.OpsCommandCenter;
    if (!isChapterTabled('workQueue') && cc && typeof cc.getWorkQueueExportBlocks === 'function') {
      blocks = blocks.concat(cc.getWorkQueueExportBlocks());
    }
    blocks = blocks.concat(buildPartnerDataHealthExportBlocks());
    if (!blocks.length) {
      setStatus('No data to export for the current Overview scope.', 'error');
      return;
    }
    var wb = OER.createWorkbook();
    OER.addConsolidatedSheet(wb, {
      name: 'All Together',
      docTitle: '3E Operations',
      subtitle: subtitle,
      blocks: blocks
    });
    blocks.forEach(function (block) {
      OER.addDataSheet(wb, {
        name: block.title.slice(0, 31),
        docTitle: '3E Operations',
        sectionTitle: block.title,
        subtitle: subtitle,
        headers: block.headers,
        rows: block.rows,
        colAlign: block.colAlign
      });
    });
    OER.downloadWorkbook(wb, '3e-operations-report-' + OER.fileStamp() + '.xlsx')
      .then(function () {
        setStatus('Exported full 3E Operations report.');
      })
      .catch(function (err) {
        console.warn('[3E Ops] Full export failed:', err);
        setStatus('Export failed.', 'error');
      });
  }

  function runChapterExportReport() {
    var id = state.activeChapter;
    if (id === 'hub') {
      exportFullOperationsReport();
      return;
    }
    if (id === 'workQueue') {
      if (window.OpsCommandCenter && typeof window.OpsCommandCenter.exportWorkQueueCsv === 'function') {
        window.OpsCommandCenter.exportWorkQueueCsv();
        setStatus('Exported Launch Readiness queue.');
      }
      return;
    }
    if (id === 'partnerDataHealth') {
      exportPartnerDataHealthChapterReport();
      return;
    }
    var mod = getEmbeddedModule(id);
    if (mod && typeof mod.exportChapterReport === 'function') {
      mod.exportChapterReport();
      return;
    }
    setStatus('Export is not available on this chapter.', 'error');
  }

  function updateHeaderExportButton() {
    var btn = document.getElementById('btnExportChapterReport');
    if (!btn) return;
    var id = state.activeChapter;
    btn.hidden = CHAPTER_EXPORT_IDS.indexOf(id) < 0;
    if (btn.hidden) return;
    var disabled = false;
    if (id === 'partnerDataHealth') {
      disabled = !state.ready || state.loading.activity;
    } else if (id === 'hub' || id === 'workQueue') {
      disabled = !state.ready;
      if (!disabled && id === 'hub' && window.OpsCommandCenter && typeof window.OpsCommandCenter.isLoading === 'function') {
        disabled = window.OpsCommandCenter.isLoading();
      }
    } else {
      var mod = getEmbeddedModule(id);
      if (mod && typeof mod.isLoading === 'function' && mod.isLoading()) disabled = true;
    }
    btn.disabled = disabled;
  }

  var exportConfirmReturnFocus = null;

  function setExportConfirmOpen(open) {
    var modal = document.getElementById('export-confirm-modal');
    var overlay = document.getElementById('export-confirm-overlay');
    if (!modal) return;
    modal.classList.toggle('is-open', open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (overlay) {
      overlay.classList.toggle('is-open', open);
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    document.body.classList.toggle('export-confirm-open', open);
    if (open) {
      var confirmBtn = document.getElementById('btn-export-confirm');
      if (confirmBtn) confirmBtn.focus();
    } else if (exportConfirmReturnFocus) {
      exportConfirmReturnFocus.focus();
      exportConfirmReturnFocus = null;
    }
  }

  function initExportConfirmModal() {
    var cancel = document.getElementById('btn-export-cancel');
    var confirm = document.getElementById('btn-export-confirm');
    var close = document.getElementById('btn-close-export-confirm');
    var overlay = document.getElementById('export-confirm-overlay');
    function closeModal() { setExportConfirmOpen(false); }
    if (cancel) cancel.addEventListener('click', closeModal);
    if (close) close.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', closeModal);
    if (confirm) {
      confirm.addEventListener('click', function () {
        closeModal();
        runChapterExportReport();
      });
    }
  }

  function initHeaderExportButton() {
    var btn = document.getElementById('btnExportChapterReport');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      if (state.activeChapter === 'hub') {
        exportConfirmReturnFocus = btn;
        setExportConfirmOpen(true);
        return;
      }
      runChapterExportReport();
    });
    updateHeaderExportButton();
  }

  function getProgramDetailBundle(row) {
    var fileRows = rowsForProgram(state.partnerFiles, row);
    fileRows.sort(function (a, b) {
      var ad = parseDate(rowVal(a, 'SOURCE_FILE_DATE'));
      var bd = parseDate(rowVal(b, 'SOURCE_FILE_DATE'));
      return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
    });
    var pinned = state.selectedFileRow;
    var latestFile = fileRows[0] || null;
    if (pinned && sameProgram(pinned, row)) {
      latestFile = pinned;
    }
    var downloadRows = rowsForProgram(state.downloads, row).slice().sort(function (a, b) {
      var ad = parseDate(rowVal(a, 'EVENT_DATE'));
      var bd = parseDate(rowVal(b, 'EVENT_DATE'));
      return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
    });
    var loadRows = addRunningTotal(rowsForProgram(state.loadHistory, row));
    var totalRows = rowsForProgram(state.totals, row);
    return {
      row: row,
      latestFile: latestFile,
      downloadRows: downloadRows,
      loadRows: loadRows,
      totalRows: totalRows
    };
  }

  function updateDetailExportButtons(bundle) {
    var fileBtn = document.getElementById('btn-export-file-csv');
    if (!fileBtn) return;
    fileBtn.disabled = !(bundle && bundle.latestFile && !state.loading.files);
  }

  function exportProgramDetailCsv() {
    var row = state.selectedProgramRow;
    if (!row) return;
    var bundle = getProgramDetailBundle(row);
    var partner = trimStr(rowVal(row, 'PARTITION'));
    var campaign = trimStr(rowVal(row, 'PROGRAM_SOLUTION'));
    var year = trimStr(rowVal(row, 'CAMPAIGN_YEAR'));
    var campaignSolution = trimStr(rowVal(row, 'CAMPAIGN_SOLUTION')) || trimStr(rowVal(row, 'PROGRAM_NAME'));
    var days = toNumber(rowVal(row, 'DAYS_SINCE_LAST_TOUCHED'));
    var sections = [];

    sections.push(exportSectionTitle('Program Summary'));
    sections.push(exportKeyValueTable([
      ['Partner', partner],
      ['Campaign', campaign],
      ['Campaign Year', year],
      ['Program Name', campaignSolution],
      ['Instance', rowVal(row, 'INSTANCE_NUM')],
      ['Program ID', rowVal(row, 'PROGRAM_ID')],
      ['Program Status', rowVal(row, 'PROGRAM_STATUS')],
      ['Active Flag', rowVal(row, 'ACTIVE_FLAG')],
      ['First Activity', formatDate(rowVal(row, 'FIRST_ACTIVITY'))],
      ['Last Activity', formatDate(rowVal(row, 'LAST_ACTIVITY'))],
      ['Campaign Dashboard Availability', formatLaunchDate(rowVal(row, 'FIRST_ACTIVITY'), row)],
      ['Cross-Campaign Availability (CNVA)', formatCrossCampaignAvailability(row) || '—'],
      ['Days Since Last Touched', formatNum(days)],
      ['Last Updated', formatDate(rowVal(row, 'LAST_UPDATED'))],
      ['Never Run', truthyFlag(rowVal(row, 'NEVER_RUN')) ? 'Yes' : 'No'],
      ['Stale Flag', truthyFlag(rowVal(row, 'STALE')) ? 'Yes' : 'No']
    ]));

    sections.push(exportSectionTitle('Latest Partner File'));
    if (bundle.latestFile) {
      var fileCols = colsForTable('files', [bundle.latestFile], FILE_COL_PREF);
      var fileHeaders = fileCols.map(function (c) { return c.label; });
      var fileClasses = fileCols.map(function (c) {
        return c.kind === 'num' || c.kind === 'compact' ? 'num' : 'text';
      });
      sections.push(exportDataTable(fileHeaders, [
        fileCols.map(function (c) {
          if (c.kind === 'num' || c.kind === 'compact') return exportRawNumber(displayMetricRaw(bundle.latestFile, c.key));
          return exportCellValue(bundle.latestFile, c);
        })
      ], fileClasses));
    } else {
      sections.push(exportNoteRow(state.loading.files ? 'File data still loading.' : 'No partner file row for this program.'));
    }

    sections.push(exportSectionTitle('Downloads'));
    if (bundle.downloadRows.length) {
      sections.push(exportDataTable(
        ['Download Date', 'Partner', 'Campaign', 'Campaign Year', 'File'],
        bundle.downloadRows.map(function (dr) {
          return [
            formatDate(rowVal(dr, 'EVENT_DATE')),
            trimStr(rowVal(dr, 'CLIENT')) || scopePartner(dr),
            scopeCampaign(dr),
            scopeYear(dr),
            firstRowVal(dr, ['FILE_NAME', 'SOURCE_FILE_NAME'])
          ];
        }),
        ['text', 'text', 'text', 'text', 'text']
      ));
    } else {
      sections.push(exportNoteRow(state.loading.downloads ? 'Download data still loading.' : 'No downloads for this program.'));
    }

    sections.push(exportSectionTitle('Daily Load'));
    if (bundle.loadRows.length) {
      sections.push(exportDataTable(
        ['Date', 'Records Loaded', 'Running Total'],
        bundle.loadRows.map(function (lr) {
          return [
            formatDate(rowVal(lr, 'MEMBER_DATE')),
            exportRawNumber(rowVal(lr, 'TOTAL')),
            exportRawNumber(rowVal(lr, 'RUNNING_TOTAL'))
          ];
        }),
        ['text', 'num', 'num']
      ));
    } else {
      sections.push(exportNoteRow(state.loading.load ? 'Load data still loading.' : 'No daily load rows for this program.'));
    }

    sections.push(exportSectionTitle('Campaign Total'));
    if (bundle.totalRows.length) {
      sections.push(exportKeyValueTable([
        ['Records in leads_programs_xpl', formatNum(rowVal(bundle.totalRows[0], 'INSTANCE_NUM'))]
      ]));
    } else {
      sections.push(exportNoteRow(state.loading.totals ? 'Totals still loading.' : 'No campaign total for this program.'));
    }

    var html = buildExportDocument(
      '3E Operations',
      'Program Detail Report',
      [
        partner + ' · ' + campaign + (year ? ' · ' + year : ''),
        campaignSolution ? 'Program: ' + campaignSolution : '',
        'Exported ' + exportTimestamp()
      ].filter(Boolean),
      sections.join('')
    );
    downloadSpreadsheet(buildExportFilename(row, bundle.latestFile), html);
  }

  function exportLatestFileSummaryCsv() {
    var row = state.selectedProgramRow;
    if (!row) return;
    var bundle = getProgramDetailBundle(row);
    if (!bundle.latestFile) return;
    var partner = trimStr(rowVal(row, 'PARTITION'));
    var campaign = trimStr(rowVal(row, 'PROGRAM_SOLUTION'));
    var year = trimStr(rowVal(row, 'CAMPAIGN_YEAR'));
    var fileCols = colsForTable('files', [bundle.latestFile], FILE_COL_PREF);
    var metaCols = fileCols.filter(function (c) { return c.kind !== 'compact' && c.kind !== 'num'; });
    var metricCols = fileCols.filter(function (c) { return c.kind === 'compact' || c.kind === 'num'; });
    var sections = [];

    sections.push(exportSectionTitle('File Details'));
    sections.push(exportKeyValueTable(metaCols.map(function (c) {
      return [c.label, exportCellValue(bundle.latestFile, c)];
    })));

    if (metricCols.length) {
      sections.push(exportSectionTitle('Funnel Metrics'));
      sections.push(exportDataTable(
        metricCols.map(function (c) { return c.label; }),
        [metricCols.map(function (c) { return exportRawNumber(displayMetricRaw(bundle.latestFile, c.key)); })],
        metricCols.map(function () { return 'num'; })
      ));
    }

    var html = buildExportDocument(
      '3E Operations',
      'Latest Partner File Report',
      [
        partner + ' · ' + campaign + (year ? ' · ' + year : ''),
        'Source: ' + (fileSourceName(bundle.latestFile) || fileTypeName(bundle.latestFile) || 'Latest file'),
        'Exported ' + exportTimestamp()
      ],
      sections.join('')
    );
    downloadSpreadsheet(buildExportFilename(row, bundle.latestFile), html);
  }

  function renderProgramDetail(row) {
    var body = document.getElementById('detailDrawerBody');
    var title = document.getElementById('detail-drawer-title');
    var sub = document.getElementById('detailDrawerSub');
    if (!body || !row) return;

    var partner = scopePartner(row) || trimStr(rowVal(row, 'PARTITION'));
    var campaign = scopeCampaign(row);
    var year = scopeYear(row);
    var campaignSolution = trimStr(rowVal(row, 'CAMPAIGN_SOLUTION')) || trimStr(rowVal(row, 'PROGRAM_NAME'));
    if (title) title.textContent = partner || 'Program details';
    if (sub) {
      sub.textContent = [campaign, year, campaignSolution].filter(Boolean).join(' · ');
    }

    var days = toNumber(rowVal(row, 'DAYS_SINCE_LAST_TOUCHED'));
    var staleCls = staleClass(days);
    var daysHtml = escapeHtml(formatNum(days));
    if (staleCls) {
      daysHtml = '<span class="detail-stale ' + staleCls + '">' + daysHtml + '</span>';
    }

    var identity = detailDl([
      { label: 'Partner', html: escapeHtml(partner || '—') },
      { label: 'Campaign', html: escapeHtml(campaign || '—') },
      { label: 'Campaign year', html: escapeHtml(year || '—') },
      { label: 'Program name', html: escapeHtml(campaignSolution || '—') },
      { label: 'Instance', html: escapeHtml(trimStr(rowVal(row, 'INSTANCE_NUM')) || '—') },
      { label: 'Program ID', html: escapeHtml(trimStr(rowVal(row, 'PROGRAM_ID')) || '—') },
      { label: 'Status', html: statusChipHtml(rowVal(row, 'PROGRAM_STATUS')) },
      { label: 'Active flag', html: escapeHtml(trimStr(rowVal(row, 'ACTIVE_FLAG')) || '—') }
    ]);

    var flagsHtml = '<div class="detail-flags">' +
      '<span class="detail-flag' + (truthyFlag(rowVal(row, 'NEVER_RUN')) ? ' detail-flag--warn' : '') + '">Never run: ' +
      (truthyFlag(rowVal(row, 'NEVER_RUN')) ? 'Yes' : 'No') + '</span>' +
      '<span class="detail-flag' + (truthyFlag(rowVal(row, 'STALE')) ? ' detail-flag--warn' : '') + '">Stale flag: ' +
      (truthyFlag(rowVal(row, 'STALE')) ? 'Yes' : 'No') + '</span></div>';

    var campaignAvail = formatLaunchDate(rowVal(row, 'FIRST_ACTIVITY'), row);
    var crossAvail = formatCrossCampaignAvailability(row);
    var activityRows = [
      { label: 'First activity', html: escapeHtml(formatDate(rowVal(row, 'FIRST_ACTIVITY'))) },
      { label: 'Last activity', html: escapeHtml(formatDate(rowVal(row, 'LAST_ACTIVITY'))) },
      {
        label: 'Campaign dashboard availability',
        html: '<span class="detail-hint" title="' + escapeHtml(availabilityTitleCampaign()) + '">' +
          escapeHtml(campaignAvail) + '</span>'
      }
    ];
    if (crossAvail) {
      activityRows.push({
        label: 'Cross-campaign availability',
        html: '<span class="detail-hint" title="' + escapeHtml(availabilityTitleCross()) + '">' +
          escapeHtml(crossAvail) + ' <span class="detail-muted">(CNVA anchor)</span></span>'
      });
    }
    activityRows.push(
      { label: 'Days since touched', html: daysHtml },
      { label: 'Last updated', html: escapeHtml(formatDate(rowVal(row, 'LAST_UPDATED'))) }
    );
    var activity = detailDl(activityRows);

    var scopeHint = heavyScopeHint();
    var bundle = getProgramDetailBundle(row);
    var latestFile = bundle.latestFile;
    updateDetailExportButtons(bundle);
    var fileMeta = detailDl(latestFile ? [
      { label: 'Source file date', html: escapeHtml(formatDate(rowVal(latestFile, 'SOURCE_FILE_DATE'))) },
      { label: 'Source file', html: escapeHtml(fileSourceName(latestFile) || '—') },
      { label: 'File type', html: escapeHtml(fileTypeName(latestFile) || '—') }
    ] : []);
    var fileMetrics = state.loading.files ? '' : detailMetricGrid(FILE_COL_PREF, latestFile);
    var stxNote = '';
    if (latestFile && !state.loading.files) {
      var stx = startedNotSubmitted(latestFile);
      if (stx.floored) {
        stxNote = '<p class="detail-note">App Strt not Submitted was ' + escapeHtml(formatNum(stx.source)) +
          ' in the partner file because submits exceeded starts. Shown as 0.</p>';
      }
    }

    var downloadRows = bundle.downloadRows;
    var downloadsHtml;
    if (state.loading.downloads) {
      downloadsHtml = heavyLoadingNote('downloads');
    } else if (!downloadRows.length) {
      downloadsHtml = '<p class="detail-empty">No downloads for this program.</p>';
    } else {
      downloadsHtml = '<p class="detail-summary">' + downloadRows.length.toLocaleString('en-US') + ' download event' +
        (downloadRows.length === 1 ? '' : 's') + '</p><ul class="detail-list">' +
        downloadRows.slice(0, 8).map(function (dr) {
          var who = trimStr(rowVal(dr, 'CLIENT')) || scopePartner(dr) || scopeCampaign(dr) || 'Download';
          var file = firstRowVal(dr, ['FILE_NAME', 'SOURCE_FILE_NAME']);
          return '<li><span class="detail-list-date">' + escapeHtml(formatDate(rowVal(dr, 'EVENT_DATE'))) +
            '</span> ' + escapeHtml(who) +
            (file ? ' · ' + escapeHtml(file) : '') + '</li>';
        }).join('') + (downloadRows.length > 8 ? '<li class="detail-list-more">+' + (downloadRows.length - 8) + ' more in Partner Downloads</li>' : '') + '</ul>';
    }

    var loadRows = bundle.loadRows;
    var loadHtml;
    if (state.loading.load) {
      loadHtml = heavyLoadingNote('load');
    } else if (!loadRows.length) {
      loadHtml = '<p class="detail-empty">No daily load rows for this program.</p>';
    } else {
      var lastLoad = loadRows[loadRows.length - 1];
      loadHtml = '<p class="detail-summary">Running total: <strong>' + escapeHtml(formatNum(rowVal(lastLoad, 'RUNNING_TOTAL'))) +
        '</strong></p><ul class="detail-list">' +
        loadRows.slice(-8).reverse().map(function (lr) {
          return '<li><span class="detail-list-date">' + escapeHtml(formatDate(rowVal(lr, 'MEMBER_DATE'))) +
            '</span> +' + escapeHtml(formatNum(rowVal(lr, 'TOTAL'))) +
            ' <span class="detail-list-muted">(total ' + escapeHtml(formatNum(rowVal(lr, 'RUNNING_TOTAL'))) + ')</span></li>';
        }).join('') + '</ul>';
    }

    var totalRows = bundle.totalRows;
    var totalHtml;
    if (state.loading.totals) {
      totalHtml = heavyLoadingNote('totals');
    } else if (!totalRows.length) {
      totalHtml = '<p class="detail-empty">No campaign total for this program.</p>';
    } else {
      totalHtml = detailDl([
        { label: 'Records in leads_programs_xpl', html: escapeHtml(formatNum(rowVal(totalRows[0], 'INSTANCE_NUM'))) }
      ]);
    }

    body.innerHTML =
      detailSection('Program identity', identity) +
      detailSection('Activity', activity + flagsHtml) +
      detailSection('Partner file funnel', scopeHint + heavyLoadingNote('files') + fileMeta + stxNote + fileMetrics) +
      detailSection('Downloads', scopeHint + downloadsHtml) +
      detailSection('Daily load', scopeHint + loadHtml) +
      detailSection('Campaign total', scopeHint + totalHtml);
  }

  function setProgramDetailOpen(open, row) {
    var drawer = document.getElementById('detail-drawer');
    var overlay = document.getElementById('detail-overlay');
    var closeBtn = document.getElementById('btn-close-detail');
    if (!drawer) return;
    if (open && row) {
      state.selectedProgramKey = programKey(row);
      state.selectedProgramRow = row;
      renderProgramDetail(row);
    } else if (!open) {
      state.selectedProgramKey = null;
      state.selectedProgramRow = null;
      state.selectedFileRow = null;
    }
    drawer.classList.toggle('is-open', !!open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (overlay) {
      overlay.classList.toggle('is-open', !!open);
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    document.body.classList.toggle('detail-open', !!open);
    if (open && closeBtn) closeBtn.focus();
    if (state.activeChapter === 'partnerDataHealth') syncSelectedProgramRows();
  }

  function syncSelectedProgramRows() {
    var rows = document.querySelectorAll('#partnerDataHealthChapter tr.row-clickable');
    var i;
    for (i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var hit = rowFromClickable(tr);
      var on = !!(hit && state.selectedProgramRow && sameProgram(hit.row, state.selectedProgramRow));
      tr.classList.toggle('is-selected', on);
    }
  }

  function openProgramDetail(row) {
    if (!row) return;
    setProgramDetailOpen(true, row);
  }

  function refreshProgramDetailIfOpen() {
    var drawer = document.getElementById('detail-drawer');
    if (!drawer || !drawer.classList.contains('is-open') || !state.selectedProgramKey) return;
    var row = findProgramByKey(state.selectedProgramKey);
    if (row) {
      state.selectedProgramRow = row;
      renderProgramDetail(row);
    }
  }

  function addRunningTotal(rows) {
    var dated = rows.slice().sort(function (a, b) {
      var ad = parseDate(rowVal(a, 'MEMBER_DATE'));
      var bd = parseDate(rowVal(b, 'MEMBER_DATE'));
      return (ad ? ad.getTime() : 0) - (bd ? bd.getTime() : 0);
    });
    var run = 0;
    return dated.map(function (row) {
      var copy = {};
      Object.keys(row).forEach(function (k) { copy[k] = row[k]; });
      run += toNumber(rowVal(row, 'TOTAL'));
      copy.RUNNING_TOTAL = run;
      return copy;
    });
  }

  var statusPassCache = null;

  function statusPassKey(row) {
    var partner = partnerBucketKey(scopePartner(row));
    var campaign = canonicalCampaignCode(scopeCampaign(row));
    var year = scopeYear(row);
    var yearKey = campaignYearToken(year) || trimStr(year);
    return partner + '\0' + campaign + '\0' + yearKey;
  }

  function heavyRowPassesProgramStatus(row, tableName) {
    var statusList = effectiveStatusFilter(state.filters.statuses);
    if (!statusList) return true;
    var sig = statusList.join('|');
    if (!statusPassCache || statusPassCache.src !== state.programs || statusPassCache.sig !== sig) {
      statusPassCache = { src: state.programs, sig: sig, map: {} };
    }
    var key = statusPassKey(row);
    if (Object.prototype.hasOwnProperty.call(statusPassCache.map, key)) return statusPassCache.map[key];
    var prog = resolveProgramRow(row, tableName);
    var pass = !prog || prog === row || matchesFilters(prog, { status: true });
    statusPassCache.map[key] = pass;
    return pass;
  }

  function getFiltered(name) {
    if (name === 'activity') {
      return state.programs.filter(function (r) { return matchesFilters(r, { status: true }); });
    }
    if (name === 'files') {
      return state.partnerFiles.filter(function (r) {
        return matchesFilters(r) && heavyRowPassesProgramStatus(r, 'files');
      });
    }
    if (name === 'downloads') {
      return state.downloads.filter(function (r) {
        return matchesFilters(r, { requireYear: true }) && heavyRowPassesProgramStatus(r, 'downloads');
      });
    }
    if (name === 'load') {
      return state.loadHistory.filter(function (r) {
        return matchesFilters(r) && heavyRowPassesProgramStatus(r, 'load');
      });
    }
    if (name === 'totals') {
      return state.totals.filter(function (r) {
        return matchesFilters(r) && heavyRowPassesProgramStatus(r, 'totals');
      });
    }
    return [];
  }

  /* APP_STXSUB is started minus submitted. Submits can exceed starts (UAlbany and similar), which makes the source negative. The count cannot be below zero. */
  function startedNotSubmitted(row) {
    var raw = rowVal(row, 'APP_STXSUB');
    if (Join.floorStartedNotSubmitted) return Join.floorStartedNotSubmitted(raw);
    if (raw == null || String(raw).trim() === '') return { value: raw, floored: false, source: null };
    var n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
    if (!isFinite(n) || n >= 0) return { value: raw, floored: false, source: isFinite(n) ? n : null };
    return { value: 0, floored: true, source: n };
  }

  function displayMetricRaw(row, key) {
    if (String(key || '').toUpperCase() !== 'APP_STXSUB') return rowVal(row, key);
    return startedNotSubmitted(row).value;
  }

  function cellHtml(row, col) {
    var raw = displayMetricRaw(row, col.key);
    var cls = [];
    var text;
    var title = '';
    if (col.kind === 'status') {
      return { cls: '', html: statusChipHtml(raw) };
    }
    if (col.kind === 'stale') {
      cls.push('num');
      var sc = staleClass(raw);
      if (sc) cls.push(sc);
      text = formatNum(raw);
    } else if (col.kind === 'compact') {
      cls.push('num');
      text = formatCompact(raw);
      title = formatNum(raw);
    } else if (col.kind === 'num') {
      cls.push('num');
      text = formatNum(raw);
      if (String(col.key).toUpperCase() === 'APP_STXSUB') {
        var stx = startedNotSubmitted(row);
        if (stx.floored) {
          title = 'Source count was ' + formatNum(stx.source) + ' because submits exceeded starts. Shown as 0.';
        }
      }
    } else if (col.kind === 'date') {
      text = formatDate(raw);
    } else {
      text = trimStr(raw) || '—';
    }
    return {
      cls: cls.length ? ' class="' + cls.join(' ') + '"' : '',
      html: escapeHtml(text),
      title: title && title !== text ? title : ''
    };
  }

  function setPanelMode(name, mode, message) {
    var meta = PANELS[name];
    var skeleton = document.getElementById(meta.prefix + 'Skeleton');
    var wrap = document.getElementById(meta.prefix + 'TableWrap');
    var empty = document.getElementById(meta.emptyId);
    var pager = document.getElementById(meta.prefix + 'Pager');
    var head = document.getElementById(meta.prefix + 'Head');
    var body = document.getElementById(meta.prefix + 'Body');
    if (skeleton) skeleton.hidden = mode !== 'loading';
    if (wrap) wrap.hidden = mode === 'loading';
    if (pager) pager.hidden = mode !== 'ready';
    if (empty) {
      empty.hidden = mode === 'ready' || mode === 'loading';
      if (mode === 'loading' && window.OpsUi && OpsUi.setPanelEmpty) {
        OpsUi.setPanelEmpty(empty, message || 'Loading…', 'loading');
      } else if (message) {
        empty.classList.remove('is-loading');
        empty.textContent = message;
      }
    }
    if (mode !== 'ready') {
      if (head) head.innerHTML = '';
      if (body) body.innerHTML = '';
    }
  }

  function renderTable(name, rows) {
    var meta = PANELS[name];
    var head = document.getElementById(meta.prefix + 'Head');
    var body = document.getElementById(meta.prefix + 'Body');
    var empty = document.getElementById(meta.emptyId);
    var sub = document.getElementById(meta.subtitleId);
    var pager = document.getElementById(meta.prefix + 'Pager');
    var pagerMeta = document.getElementById(meta.prefix + 'PagerMeta');
    var noun = meta.noun + (rows.length === 1 ? '' : 's');
    var scopeTotal = state.scopeCounts ? state.scopeCounts[name] : null;
    var capNote = '';
    if (scopeTotal != null && scopeTotal > rows.length && state.capped[name]) {
      capNote = ' · newest ' + rows.length.toLocaleString('en-US') + ' of ' +
        Number(scopeTotal).toLocaleString('en-US') + ' in this scope';
    } else if (state.capped[name]) {
      capNote = ' · first ' + ROW_CAP.toLocaleString('en-US') + ' from the query';
    }
    if (sub) {
      sub.textContent = rows.length.toLocaleString('en-US') + ' ' + noun + capNote + ' · click a row for details';
    }
    if (!rows.length) {
      state.pageRows[name] = [];
      setTableExportEnabled(name, false);
      setPanelMode(name, 'empty', 'No ' + noun + ' for the current filters.');
      return;
    }
    var cols = colsForTable(name, rows, meta.preferred);
    if (!cols.length) {
      state.pageRows[name] = [];
      setTableExportEnabled(name, false);
      setPanelMode(name, 'empty', 'No columns returned for this table.');
      return;
    }
    var sort = state.sorts[meta.sortKey] || { key: cols[0].key, dir: 'asc' };
    if (!cols.some(function (c) { return c.key === sort.key; })) sort.key = cols[0].key;
    var sorted = sortRows(rows, sort, cols);
    var total = sorted.length;
    var maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
    if (state.pages[name] > maxPage) state.pages[name] = maxPage;
    if (state.pages[name] < 0) state.pages[name] = 0;
    var page = state.pages[name];
    var start = page * PAGE_SIZE;
    var pageRows = sorted.slice(start, start + PAGE_SIZE);
    setPanelMode(name, total ? 'ready' : 'empty', 'No ' + noun + ' for the current filters.');
    if (!total) return;
    if (empty) empty.hidden = true;
    if (head) {
      head.innerHTML = '<tr>' + cols.map(function (c) {
        var pressed = c.key === sort.key;
        var ariaSort = pressed ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none';
        var cls = (c.kind === 'num' || c.kind === 'compact' || c.kind === 'stale') ? ' class="num"' : '';
        return '<th' + cls + ' aria-sort="' + ariaSort + '"><button type="button" class="sort-btn" data-sort-table="' +
          escapeHtml(meta.sortKey) + '" data-sort-key="' + escapeHtml(c.key) + '" aria-pressed="' +
          (pressed ? 'true' : 'false') + '" data-dir="' + (pressed ? sort.dir : 'desc') + '">' +
          escapeHtml(c.label) + '</button></th>';
      }).join('') + '</tr>';
    }
    state.pageRows[name] = pageRows;
    setTableExportEnabled(name, true);
    if (body) {
      body.innerHTML = pageRows.map(function (row, idx) {
        var sel = state.selectedProgramRow && sameProgram(row, state.selectedProgramRow) ? ' is-selected' : '';
        var label = trimStr(scopePartner(row) || rowVal(row, 'PARTITION')) + ' ' +
          trimStr(scopeCampaign(row) || rowVal(row, 'PROGRAM_SOLUTION'));
        var rowAttrs = ' class="row-clickable' + sel + '" data-table="' + escapeHtml(name) +
          '" data-row-idx="' + idx + '" tabindex="0" role="button" aria-label="View program details for ' +
          escapeHtml(label.trim() || meta.title) + '"';
        return '<tr' + rowAttrs + '>' + cols.map(function (c) {
          var cell = cellHtml(row, c);
          var title = cell.title ? ' title="' + escapeHtml(cell.title) + '"' : '';
          return '<td' + cell.cls + title + '>' + cell.html + '</td>';
        }).join('') + '</tr>';
      }).join('');
    }
    if (pager) pager.hidden = false;
    if (pagerMeta) {
      var from = start + 1;
      var to = Math.min(start + PAGE_SIZE, total);
      pagerMeta.textContent = 'Showing ' + from.toLocaleString('en-US') + '–' + to.toLocaleString('en-US') +
        ' of ' + total.toLocaleString('en-US');
    }
    var prev = pager ? pager.querySelector('[data-page-dir="prev"]') : null;
    var next = pager ? pager.querySelector('[data-page-dir="next"]') : null;
    if (prev) prev.disabled = page <= 0;
    if (next) next.disabled = page >= maxPage;
  }

  var loadDisplayCache = null;

  function getLoadDisplayRows() {
    var sig = currentSliceKey();
    if (loadDisplayCache && loadDisplayCache.src === state.loadHistory && loadDisplayCache.sig === sig) {
      return loadDisplayCache.rows;
    }
    var base = state.loadHistory.filter(function (r) {
      return matchesFilters(r) && heavyRowPassesProgramStatus(r, 'load');
    });
    var rows = addRunningTotal(base);
    loadDisplayCache = { src: state.loadHistory, sig: sig, rows: rows };
    return rows;
  }

  function renderPanel(name) {
    if (name !== 'activity' && !canFetchHeavy()) {
      state.pageRows[name] = [];
      setTableExportEnabled(name, false);
      setPanelMode(name, 'empty', NEED_SCOPE_MSG);
      var sub = document.getElementById(PANELS[name].subtitleId);
      if (sub) sub.textContent = 'Waiting for a year or partner filter';
      return;
    }
    if (state.loading[name]) {
      state.pageRows[name] = [];
      setTableExportEnabled(name, false);
      setPanelMode(name, 'loading');
      return;
    }
    if (state.errors[name]) {
      state.pageRows[name] = [];
      setTableExportEnabled(name, false);
      setPanelMode(name, 'empty', state.errors[name]);
      return;
    }
    renderTable(name, name === 'load' ? getLoadDisplayRows() : getFiltered(name));
  }

  function renderAllPanels() {
    if (state.activeChapter !== 'partnerDataHealth') return;
    Object.keys(PANELS).forEach(function (name) {
      renderPanel(name);
    });
  }

  var pdhRenderQueue = [];
  var pdhRenderScheduled = false;
  var pdhOpenToken = 0;

  function queuePanelRender(name) {
    if (!name || pdhRenderQueue.indexOf(name) >= 0) return;
    pdhRenderQueue.push(name);
    if (pdhRenderScheduled) return;
    pdhRenderScheduled = true;
    requestAnimationFrame(runQueuedPanelRender);
  }

  function queuePartnerHealthPanels() {
    queuePanelRender('activity');
    HEAVY.forEach(queuePanelRender);
  }

  function runQueuedPanelRender() {
    pdhRenderScheduled = false;
    if (state.activeChapter !== 'partnerDataHealth') {
      pdhRenderQueue.length = 0;
      return;
    }
    var name = pdhRenderQueue.shift();
    if (name) renderPanel(name);
    summarizeStatus();
    updateHeaderExportButton();
    if (pdhRenderQueue.length) {
      pdhRenderScheduled = true;
      requestAnimationFrame(runQueuedPanelRender);
    }
  }

  function schedulePartnerHealthOpen() {
    var token = ++pdhOpenToken;
    requestAnimationFrame(function () {
      if (token !== pdhOpenToken || state.activeChapter !== 'partnerDataHealth') return;
      var key = currentSliceKey();
      var stale = HEAVY.some(function (n) {
        return state.sliceKey[n] !== key || !!state.errors[n];
      });
      if (stale) invalidateHeavyDataLoads({ markLoading: true });
      loadHeavyDatasets();
      queuePartnerHealthPanels();
    });
  }

  function renderActivePanel() {
    queuePartnerHealthPanels();
  }

  function updatePdhTabChrome() {
    Object.keys(PANELS).forEach(function (name) {
      var panel = document.getElementById(PANELS[name].prefix + 'Panel');
      if (panel) {
        panel.hidden = false;
        panel.classList.add('is-active');
      }
    });
  }

  function updateChapterBadges() {
    EMBEDDED_CHAPTERS.forEach(function (entry) {
      var mod = getEmbeddedModule(entry.id);
      var el = document.getElementById('chapterBadge-' + entry.id);
      var btn = document.querySelector('.chapter-nav-btn[data-chapter="' + entry.id + '"]');
      if (!mod) return;
      var loading = mod.isLoading && mod.isLoading();
      var err = mod.getError && mod.getError();
      var count = mod.getRowCount ? mod.getRowCount() : 0;
      if (btn) {
        btn.classList.toggle('is-loading', !!loading);
        btn.classList.toggle('is-error', !!err && !loading);
      }
      if (!el) return;
      if (loading) {
        el.hidden = false;
        el.textContent = '…';
        el.classList.remove('is-error');
        return;
      }
      if (err) {
        el.hidden = false;
        el.textContent = '!';
        el.classList.add('is-error');
        return;
      }
      el.classList.remove('is-error');
      if (count) {
        el.hidden = false;
        el.textContent = count.toLocaleString('en-US');
      } else {
        el.hidden = true;
        el.textContent = '';
      }
    });
  }

  function updatePrintChapterBadge() {
    updateChapterBadges();
  }

  function summarizeStatus() {
    var pending = HEAVY.filter(function (n) { return state.loading[n]; });
    if (!state.ready || state.loading.activity || pending.length) {
      var loadBits = [];
      if (!state.ready || state.loading.activity) loadBits.push('program activity');
      pending.forEach(function (n) { loadBits.push(n); });
      setStatus('Loading ' + loadBits.join(', ') + '…', 'loading');
      return;
    }
    if (state.errors.activity) {
      setStatus(state.errors.activity, 'error');
      return;
    }
    var bits = [];
    bits.push((state.programs.length || 0).toLocaleString('en-US') + ' program rows');
    if (state.filters.years.length === 1) bits.push(state.filters.years[0]);
    else if (state.filters.years.length > 1) bits.push(state.filters.years.length + ' years');
    if (state.filters.statuses.length === 1 && state.filters.statuses[0] === 'active') {
      bits.push('active only');
    } else if (state.filters.statuses.length && !isAllStatusesSelected(state.filters.statuses)) {
      bits.push(state.filters.statuses.join(', '));
    }
    var failed = HEAVY.filter(function (n) { return state.errors[n]; });
    if (failed.length) {
      setStatus(bits.join(' · ') + '. Failed: ' + failed.join(', ') + '.', 'error');
      return;
    }
    setStatus(bits.join(' · ') + '.');
  }

  function chapterStatusMessage(name) {
    if (name === 'hub') return 'Set Partner, Campaign, and Year, then open a chapter. Insights Activity keeps its own filters.';
    if (name === 'workQueue') return 'Work queue for the current Overview scope — filter by Priority above the table.';
    if (name === 'howWeBuild') return '3E Insights Documentation — opens on Portal & Launch. Dashboard Process Overview is the vertical build path.';
    return '';
  }

  function commandCenterActiveChapter() {
    var ch = state.activeChapter;
    return ch === 'hub' || ch === 'workQueue';
  }

  function refreshCommandCenter(opts) {
    if (!window.OpsCommandCenter) return;
    opts = opts || {};
    if (!opts.always && !commandCenterActiveChapter()) return;
    if (typeof window.OpsCommandCenter.refresh === 'function') {
      window.OpsCommandCenter.refresh(opts);
    } else if (typeof window.OpsCommandCenter.render === 'function') {
      window.OpsCommandCenter.render();
    }
  }

  function formatAppDocumentTitle(chapterId) {
    var label = CHAPTER_DISPLAY_TITLES[chapterId];
    if (!label) return APP_BRAND_TITLE;
    return label;
  }

  function updateChapterPageTitle(chapterId) {
    if (CHAPTERS.indexOf(chapterId) < 0) chapterId = 'hub';
    var label = CHAPTER_DISPLAY_TITLES[chapterId] || '';
    document.title = formatAppDocumentTitle(chapterId);
    var brand = document.getElementById('appPageTitleBrand');
    if (brand) brand.textContent = label || APP_BRAND_TITLE;
    var ctx = document.getElementById('appPageTitleContext');
    if (ctx) {
      ctx.textContent = '';
      ctx.hidden = true;
    }
    updateHeaderExportButton();
  }

  function refreshUi() {
    updateChapterBadges();
    renderSharedFiltersChrome();
    renderInheritedChips();
    updatePdhTabChrome();
    if (state.activeChapter !== 'partnerDataHealth' && state.activeChapter !== 'hub' && state.activeChapter !== 'workQueue') {
      var activeMod = getEmbeddedModule(state.activeChapter);
      if (activeMod && activeMod.onFiltersChanged) activeMod.onFiltersChanged();
      if (activeMod && activeMod.isLoading && activeMod.isLoading()) {
        setStatus('Loading…');
      } else {
        var chapterMsg = chapterStatusMessage(state.activeChapter);
        if (chapterMsg) setStatus(chapterMsg);
      }
      updateHeaderExportButton();
      return;
    }
    if (state.activeChapter === 'partnerDataHealth') {
      renderActivePanel();
      refreshProgramDetailIfOpen();
      summarizeStatus();
      updateHeaderExportButton();
      return;
    }
    if (state.activeChapter === 'hub' || state.activeChapter === 'workQueue') {
      refreshCommandCenter();
    }
    var msg = chapterStatusMessage(state.activeChapter);
    if (msg) setStatus(msg);
    updateHeaderExportButton();
  }

  function cloneFilters(src) {
    src = src || {};
    return {
      partners: (src.partners || []).slice(),
      campaigns: (src.campaigns || []).slice(),
      years: (src.years || []).slice(),
      statuses: (src.statuses || []).slice(),
      search: src.search || ''
    };
  }

  function programFilterRows() {
    var rows = Join.omitIgnoredPartitionRows ? Join.omitIgnoredPartitionRows(state.programs) : state.programs;
    if (state.portalPartners && state.portalPartners.length) {
      var allow = {};
      state.portalPartners.forEach(function (p) { allow[String(p).toLowerCase()] = true; });
      rows = rows.filter(function (r) { return allow[trimStr(r.PARTITION).toLowerCase()]; });
    }
    return rows;
  }

  function defaultDraftFilters() {
    var rows = programFilterRows();
    var years = uniqueSorted(rows.map(function (r) { return r.CAMPAIGN_YEAR; }));
    years.sort(function (a, b) { return yearSortKey(b) - yearSortKey(a); });
    return {
      partners: [],
      campaigns: [],
      years: years.length ? [years[0]] : [],
      statuses: defaultStatusSelection(),
      search: ''
    };
  }

  function statusLabels(values) {
    return (values || []).map(function (s) {
      for (var i = 0; i < STATUS_OPTIONS.length; i++) {
        if (STATUS_OPTIONS[i].value === s) return STATUS_OPTIONS[i].label;
      }
      return s;
    });
  }

  function pdhScopeFromDraft(draft) {
    draft = draft || state.draft;
    return {
      partners: (draft.partners || []).slice(),
      campaigns: (draft.campaigns || []).slice(),
      years: (draft.years || []).slice(),
      statuses: (draft.statuses || []).slice()
    };
  }

  function computePdhFilterOptions(draft) {
    var rows = programFilterRows();
    if (Join.scopeFilterOptionsFromPrograms) {
      return Join.scopeFilterOptionsFromPrograms(rows, pdhScopeFromDraft(draft), programLifecycle);
    }
    var scope = pdhScopeFromDraft(draft);
    var cascade = Join.cascadeFilterOptions
      ? Join.cascadeFilterOptions(rows, scope, {
        partition: function (r) { return r.PARTITION; },
        campaign: function (r) { return r.PROGRAM_SOLUTION; },
        year: function (r) { return r.CAMPAIGN_YEAR; }
      })
      : null;
    var partnerSource = cascade ? cascade.partnerRows : rows;
    var campaignSource = cascade ? cascade.campaignRows : rows;
    var yearSource = cascade ? cascade.yearRows : rows;
    return {
      partners: uniqueSorted(partnerSource.map(function (r) { return r.PARTITION; })),
      campaigns: cascade && cascade.sharedCampaignOptions
        ? uniqueSorted(cascade.sharedCampaignOptions)
        : uniqueSorted(campaignSource.map(function (r) { return r.PROGRAM_SOLUTION; })),
      years: cascade && cascade.sharedYearOptions
        ? uniqueSorted(cascade.sharedYearOptions)
        : uniqueSorted(yearSource.map(function (r) { return r.CAMPAIGN_YEAR; })),
      multiPartnerScope: !!(cascade && cascade.multiPartnerScope),
      sharedCampaignOptions: cascade ? cascade.sharedCampaignOptions : null,
      sharedYearOptions: cascade ? cascade.sharedYearOptions : null
    };
  }

  function populateFilters() {
    var draft = state.draft;
    var options = computePdhFilterOptions(draft);
    var multiPartner = !!options.multiPartnerScope;
    var noSharedCampaigns = (Join && Join.NO_SHARED_CAMPAIGNS_LABEL) || 'No shared campaigns';
    var noSharedYears = (Join && Join.NO_SHARED_YEARS_LABEL) || 'No shared campaign years';

    var partners = options.partners;
    draft.partners = draft.partners.filter(function (p) {
      return partners.some(function (opt) {
        return matchesSelectedPartners(p, [opt]);
      });
    });

    var campaigns = options.campaigns;
    draft.campaigns = draft.campaigns.filter(function (c) {
      return campaigns.some(function (opt) {
        return matchesSelectedCampaigns(c, [opt]) || matchesSelectedCampaigns(opt, [c]);
      });
    });

    var years = options.years;
    years.sort(function (a, b) { return yearSortKey(b) - yearSortKey(a); });
    draft.years = draft.years.filter(function (y) { return years.indexOf(y) >= 0; });
    if (!state.didDefaultYear && years.length && !draft.years.length && !state.filters.years.length) {
      draft.years = [years[0]];
      state.filters.years = [years[0]];
      state.didDefaultYear = true;
    }

    function scopeMenuNeedsRender(menuEl) {
      if (!menuEl) return false;
      if (isScopeFilterClusterOpen()) return true;
      var field = menuEl.closest('.field-multi');
      return !!(field && field.classList.contains('is-open') && !menuEl.hidden);
    }

    if (scopeMenuNeedsRender(els.partnerMenu)) {
      renderMultiMenu(els.partnerMenu, partners, 'partners', draft.partners, onPartnerFilterChange);
    }
    updateMultiLabel(els.partnerTriggerLabel, draft.partners, 'All partners', 'partners');

    if (scopeMenuNeedsRender(els.campaignMenu)) {
      renderMultiMenu(els.campaignMenu, campaigns, 'campaigns', draft.campaigns, onScopeFilterChange, multiPartner ? noSharedCampaigns : undefined);
    }
    updateMultiLabel(els.campaignTriggerLabel, draft.campaigns, 'All campaigns', 'campaigns');

    if (scopeMenuNeedsRender(els.yearMenu)) {
      renderMultiMenu(els.yearMenu, years, 'years', draft.years, onScopeFilterChange, multiPartner ? noSharedYears : undefined);
    }
    updateMultiLabel(els.yearTriggerLabel, draft.years, 'All years', 'years');

    if (scopeMenuNeedsRender(els.statusMenu)) {
      renderMultiMenu(
        els.statusMenu,
        STATUS_OPTIONS,
        'statuses',
        draft.statuses,
        onStatusFilterChange
      );
    }
    updateStatusTriggerLabel(els.statusTriggerLabel, draft.statuses);

    if (isScopeFilterClusterOpen()) setScopeMenusOpen(true);
  }

  var onScopeFilterChange = function () {};
  var onPartnerFilterChange = function () {};
  var onStatusFilterChange = function () {};

  function fetchPrograms() {
    if (typeof domo === 'undefined' || typeof domo.get !== 'function') {
      return Promise.reject(new Error('Domo SDK not available — open this app from a Domo card'));
    }
    var where = '';
    if (state.portalPartners && state.portalPartners.length) {
      where = ' WHERE PARTITION IN (' + state.portalPartners.map(function (p) {
        return "'" + escapeSql(p) + "'";
      }).join(',') + ')';
    }
    var sql = 'SELECT ' + PROGRAMS_KEYS.join(', ') + ' FROM {alias}' + where;
    var star = 'SELECT * FROM {alias}' + where;

    function sqlPrograms() {
      return fetchViaSql(ALIASES.programs, sql, PROGRAMS_KEYS).catch(function (err) {
        console.warn('[programs] SQL failed, trying SELECT *:', errMessage(err));
        return fetchViaSql(ALIASES.programs, star, null);
      });
    }

    if (where) return sqlPrograms();

    return fetchViaDataApi(ALIASES.programs, PROGRAMS_KEYS).then(function (rows) {
      if (rows && rows.length && rows.length < ROW_CAP) return rows;
      if (rows && rows.length >= ROW_CAP) {
        return sqlPrograms().then(function (sqlRows) {
          return (sqlRows && sqlRows.length) ? sqlRows : rows;
        }).catch(function () { return rows; });
      }
      return sqlPrograms();
    }).catch(function (err) {
      console.warn('[programs] Data API failed, trying SQL:', errMessage(err));
      return sqlPrograms();
    });
  }

  function yearMatchValues(years) {
    if (Join.yearMatchValues) return Join.yearMatchValues(years);
    return (years || []).slice();
  }

  function sqlEqualsAny(field, values) {
    var parts = [];
    values.forEach(function (v) {
      parts.push(field + " = '" + escapeSql(v) + "'");
      if (/^\d{4}$/.test(v)) parts.push(field + ' = ' + v);
    });
    if (!parts.length) return '';
    return parts.length === 1 ? parts[0] : '(' + parts.join(' OR ') + ')';
  }

  /* CY26 also matches 2026 / CY2026. Files may store the year on CAMPAIGN_YEAR or CY. */
  function sqlYearClause(columns) {
    var values = yearMatchValues(state.filters.years);
    if (!values.length || !columns || !columns.length) return '';
    var parts = [];
    columns.forEach(function (col) {
      var bit = sqlEqualsAny(col, values);
      if (bit) parts.push(bit);
    });
    if (!parts.length) return '';
    return parts.length === 1 ? parts[0] : '(' + parts.join(' OR ') + ')';
  }

  function scopedWhere(opts, yearColumns) {
    opts = opts || {};
    var clauses = [];
    appendFieldFilter(clauses, opts.partnerField || 'PARTITION', partnerListForQuery());
    appendFieldFilter(clauses, opts.campaignField || 'PROGRAM_SOLUTION', campaignValuesForQuery());
    var yearSql = sqlYearClause(yearColumns);
    if (yearSql) clauses.push(yearSql);
    return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  }

  function fetchSqlAttempts(spec, sqls) {
    function next(i) {
      if (i >= sqls.length) return Promise.reject(new Error('No data from ' + spec.alias));
      return fetchViaSql(spec, sqls[i], null).catch(function (err) {
        if (i + 1 >= sqls.length) return Promise.reject(err);
        console.warn('[' + spec.alias + '] scoped SQL failed, trying next:', errMessage(err));
        return next(i + 1);
      });
    }
    return next(0);
  }

  function fetchFiltered(spec) {
    /* PARTNER_FILES_SUMMARY uses CAMPAIGN, not PROGRAM_SOLUTION — try CAMPAIGN paths first for files.
       A selected year is always in the SQL. Do not pull the whole files or load table and filter it in the browser. */
    var isFiles = spec.alias === 'partnerFiles';
    var hasYear = state.filters.years.length > 0;
    var yearSets = isFiles
      ? [['CAMPAIGN_YEAR', 'CY'], ['CAMPAIGN_YEAR'], ['CY']]
      : [['CAMPAIGN_YEAR']];
    var optionSets = [];
    if (isFiles && state.filters.campaigns.length) {
      optionSets.push({ campaignField: 'CAMPAIGN' });
      optionSets.push({});
    } else {
      optionSets.push({});
      if (state.filters.campaigns.length) optionSets.push({ campaignField: 'CAMPAIGN' });
    }
    if (partnerListForQuery().length) optionSets.push({ partnerField: 'CLIENT' });

    var sqls = [];
    function addSql(opts, yearCols) {
      var sql = 'SELECT * FROM {alias}' + scopedWhere(opts, yearCols);
      if (sqls.indexOf(sql) < 0) sqls.push(sql);
    }
    optionSets.forEach(function (opts) {
      (hasYear ? yearSets : [[]]).forEach(function (cols) { addSql(opts, cols); });
    });
    if (!sqls.length) {
      return Promise.reject(new Error('Select a campaign year or partner before loading this table'));
    }

    if (hasYear) return fetchSqlAttempts(spec, sqls);

    var filterProg = dataApiFilter({ year: false });
    var filterCamp = dataApiFilter({ year: false, campaignField: 'CAMPAIGN' });
    var filterFirst = (isFiles && state.filters.campaigns.length) ? filterCamp : filterProg;
    var filterSecond = (filterCamp && filterCamp !== filterFirst) ? filterCamp : filterProg;
    var expandedCampaigns = campaignValuesForQuery();
    var campaignNeedsSql = state.filters.campaigns.length > 0 &&
      expandedCampaigns.length !== state.filters.campaigns.length;
    var canUseDataApi = !campaignNeedsSql &&
      (!!filterFirst || (!partnerListForQuery().length && !state.filters.campaigns.length));

    function dataApiOrThrow(filter) {
      return fetchViaDataApi(spec, null, filter || null).then(function (rows) {
        if (!rows || !rows.length || rows.length >= ROW_CAP) throw new Error('incomplete data api');
        return rows;
      });
    }

    var chain = canUseDataApi
      ? dataApiOrThrow(filterFirst || null).catch(function () {
          if (filterSecond && filterSecond !== filterFirst) return dataApiOrThrow(filterSecond);
          throw new Error('data api fallback');
        })
      : Promise.reject(new Error('skip Data API'));
    return chain.catch(function () {
      return fetchSqlAttempts(spec, sqls);
    });
  }

  function downloadYearClause(years, opts) {
    opts = opts || {};
    if (!years || !years.length) return '';
    var includeFileName = opts.fileName === true;
    var parts = [];
    years.forEach(function (y) {
      var token = campaignYearToken(y) || trimStr(y).toUpperCase();
      if (!token) return;
      parts.push("CY = '" + escapeSql(token) + "'");
      parts.push("CAMPAIGN_YEAR = '" + escapeSql(token) + "'");
      if (includeFileName) parts.push("FILE_NAME LIKE '%" + escapeSql(token) + "%'");
      var raw = trimStr(y);
      if (raw && raw.toUpperCase() !== token) {
        parts.push("CY = '" + escapeSql(raw) + "'");
        parts.push("CAMPAIGN_YEAR = '" + escapeSql(raw) + "'");
      }
      var m = token.match(/^CY(\d{2})$/);
      if (m) {
        var yyyy = String(2000 + parseInt(m[1], 10));
        parts.push("CY = '" + escapeSql(yyyy) + "'");
        parts.push("CAMPAIGN_YEAR = '" + escapeSql(yyyy) + "'");
      }
    });
    return parts.length ? '(' + parts.join(' OR ') + ')' : '';
  }

  function downloadPartnerClause(partners) {
    if (!partners || !partners.length) return '';
    var parts = [];
    partners.forEach(function (p) {
      var v = trimStr(p);
      if (!v) return;
      parts.push("CLIENT = '" + escapeSql(v) + "'");
      parts.push("PARTITION = '" + escapeSql(v) + "'");
      parts.push("FILE_NAME LIKE '%_" + escapeSql(v) + "_%'");
    });
    return parts.length ? '(' + parts.join(' OR ') + ')' : '';
  }

  function downloadSqlWhere(opts) {
    var clauses = [];
    var yearSql = downloadYearClause(state.filters.years, opts);
    var partnerSql = downloadPartnerClause(partnerListForQuery());
    if (yearSql) clauses.push(yearSql);
    if (partnerSql) clauses.push(partnerSql);
    return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  }

  function downloadDataApiFilter() {
    var parts = [];
    var partners = partnerListForQuery();
    if (partners.length === 1) {
      var p = escapeSql(partners[0]);
      parts.push("PARTITION = '" + p + "'");
    }
    if (state.filters.years.length === 1) {
      var yearToken = campaignYearToken(state.filters.years[0]) || trimStr(state.filters.years[0]);
      if (yearToken) parts.push("CY = '" + escapeSql(yearToken) + "'");
    }
    return parts.join(' AND ');
  }

  function fetchDownloadScopeCount(where) {
    return fetchViaSql(ALIASES.downloads, 'SELECT COUNT(*) AS N FROM {alias}' + where, ['N']).then(function (rows) {
      if (!rows || !rows.length) return null;
      var n = toNumber(rowVal(rows[0], 'N'));
      return n > 0 || rowVal(rows[0], 'N') === 0 || rowVal(rows[0], 'N') === '0' ? n : null;
    }).catch(function () { return null; });
  }

  function fetchDownloadRows(where) {
    var cols = DOWNLOAD_KEYS.join(', ');
    var orderExpr = 'COALESCE(EVENT_DATE, DOWNLOAD_DATE)';
    var orderedLimit = 'SELECT ' + cols + ' FROM {alias}' + where + ' ORDER BY ' + orderExpr + ' DESC LIMIT ' + ROW_CAP;
    var unorderedLimit = 'SELECT ' + cols + ' FROM {alias}' + where + ' LIMIT ' + ROW_CAP;
    var starOrdered = 'SELECT * FROM {alias}' + where + ' ORDER BY EVENT_DATE DESC LIMIT ' + ROW_CAP;
    return fetchViaSql(ALIASES.downloads, orderedLimit, DOWNLOAD_KEYS).catch(function () {
      return fetchViaSql(ALIASES.downloads, unorderedLimit, DOWNLOAD_KEYS);
    }).catch(function () {
      return fetchViaSql(ALIASES.downloads, starOrdered, null);
    });
  }

  function fetchDownloads() {
    var apiFilter = downloadDataApiFilter();
    var whereEq = downloadSqlWhere({ fileName: false });
    var whereFile = downloadSqlWhere({ fileName: true });
    function withCount(rows, where) {
      rows = rows || [];
      if (!where) {
        rows._scopeCount = null;
        return Promise.resolve(rows);
      }
      return fetchDownloadScopeCount(where).then(function (n) {
        rows._scopeCount = n;
        return rows;
      });
    }
    function unfilteredFallback() {
      return fetchViaDataApi(ALIASES.downloads, DOWNLOAD_KEYS, apiFilter || null).then(function (rows) {
        if (rows && rows.length) return rows;
        throw new Error('empty downloads Data API');
      }).catch(function () {
        return fetchViaSql(ALIASES.downloads, 'SELECT * FROM {alias} ORDER BY EVENT_DATE DESC LIMIT ' + ROW_CAP, null);
      }).catch(function () {
        return fetchFiltered(ALIASES.downloads);
      });
    }
    var firstWhere = whereEq || whereFile;
    return fetchDownloadRows(firstWhere).then(function (rows) {
      if (rows && rows.length) return withCount(rows, firstWhere);
      if (whereFile && whereFile !== firstWhere) {
        return fetchDownloadRows(whereFile).then(function (wide) {
          if (wide && wide.length) return withCount(wide, whereFile);
          return withCount(wide || [], whereFile);
        });
      }
      return withCount(rows || [], firstWhere);
    }).catch(function () {
      if (whereFile && whereFile !== firstWhere) {
        return fetchDownloadRows(whereFile).then(function (wide) {
          return withCount(wide || [], whereFile);
        });
      }
      throw new Error('downloads query failed');
    }).catch(function () {
      return unfilteredFallback().then(function (rows) {
        return withCount(rows || [], '');
      });
    });
  }

  function totalsCount(row) {
    var names = ['CNT', 'INSTANCE_NUM', 'COUNT', 'N', 'COUNT(*)', 'COUNT(1)'];
    var i;
    for (i = 0; i < names.length; i++) {
      var raw = rowVal(row, names[i]);
      if (raw !== '' && raw != null && isFinite(Number(String(raw).replace(/,/g, '')))) {
        return toNumber(raw);
      }
    }
    var keys = row ? Object.keys(row) : [];
    for (i = 0; i < keys.length; i++) {
      if (String(keys[i]).toUpperCase().indexOf('COUNT') < 0) continue;
      var n = toNumber(row[keys[i]]);
      if (n) return n;
    }
    return 0;
  }

  function totalsWhere(partners) {
    var clauses = [];
    appendFieldFilter(clauses, 'PARTITION', partners || []);
    appendFieldFilter(clauses, 'PROGRAM_SOLUTION', campaignValuesForQuery());
    var yearSql = sqlYearClause(['CAMPAIGN_YEAR']);
    if (yearSql) clauses.push(yearSql);
    return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  }

  function mapTotalsRows(rows) {
    return (rows || []).map(function (row) {
      var year = campaignYearToken(rowVal(row, 'CAMPAIGN_YEAR')) || trimStr(rowVal(row, 'CAMPAIGN_YEAR'));
      row.PARTITION = trimStr(rowVal(row, 'PARTITION'));
      row.PROGRAM_SOLUTION = trimStr(rowVal(row, 'PROGRAM_SOLUTION'));
      row.CAMPAIGN_YEAR = year;
      row.INSTANCE_NUM = totalsCount(row);
      return row;
    }).filter(function (row) {
      return row.PARTITION && row.INSTANCE_NUM > 0;
    });
  }

  function mergeTotalsRows(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = row.PARTITION.toLowerCase() + '\0' + row.PROGRAM_SOLUTION.toLowerCase() + '\0' +
        String(row.CAMPAIGN_YEAR || '').toUpperCase();
      if (!map[key]) {
        map[key] = row;
        return;
      }
      map[key].INSTANCE_NUM = toNumber(map[key].INSTANCE_NUM) + toNumber(row.INSTANCE_NUM);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function fetchCampaignTotalsAttempt(where) {
    /* leads_programs_xpl is keyed on PARTITION. Selecting or filtering CLIENT fails the query.
       Alias the count as CNT — aliasing it INSTANCE_NUM can collide with the source column. */
    var attempts = [
      'SELECT PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, COUNT(1) AS CNT FROM {alias}' + where +
        ' GROUP BY PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR',
      'SELECT PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, COUNT(*) AS CNT FROM {alias}' + where +
        ' GROUP BY 1, 2, 3'
    ];
    function next(i, lastErr) {
      if (i >= attempts.length) return Promise.reject(lastErr || new Error('Campaign totals query failed'));
      return fetchViaSql(ALIASES.leads, attempts[i], null, 120000).then(function (rows) {
        return mapTotalsRows(rows);
      }).catch(function (err) {
        console.warn('[totals] SQL failed, trying next:', errMessage(err));
        return next(i + 1, err);
      });
    }
    return next(0, null);
  }

  function totalsPartnerNames() {
    var seen = {};
    var list = [];
    function add(name) {
      var v = trimStr(name);
      if (!v || seen[v.toLowerCase()]) return;
      seen[v.toLowerCase()] = true;
      list.push(v);
    }
    partnerListForQuery().forEach(add);
    if (!list.length) {
      (state.programs || []).forEach(function (row) {
        if (matchesFilters(row)) add(scopePartner(row));
      });
    }
    return list;
  }

  function fetchTotalsPartnerList(partners) {
    if (!partners.length) return fetchCampaignTotalsAttempt(totalsWhere([]));
    return fetchCampaignTotalsAttempt(totalsWhere(partners)).catch(function (err) {
      if (partners.length === 1) return Promise.reject(err);
      var acc = [];
      var failures = 0;
      var lastErr = err;
      function run(i) {
        if (i >= partners.length) {
          if (!acc.length && failures === partners.length) return Promise.reject(lastErr);
          return Promise.resolve(acc);
        }
        return fetchCampaignTotalsAttempt(totalsWhere([partners[i]])).then(function (rows) {
          acc = acc.concat(rows || []);
          return run(i + 1);
        }).catch(function (oneErr) {
          failures += 1;
          lastErr = oneErr;
          console.warn('[totals] partner count failed', partners[i], errMessage(oneErr));
          return run(i + 1);
        });
      }
      return run(0);
    });
  }

  function fetchCampaignTotals() {
    var partners = totalsPartnerNames();
    var chunks = [];
    var size = 4;
    if (!partners.length) chunks.push([]);
    for (var i = 0; i < partners.length; i += size) chunks.push(partners.slice(i, i + size));
    var acc = [];
    var failures = 0;
    var lastErr = null;
    function run(i) {
      if (i >= chunks.length) {
        if (!acc.length && failures === chunks.length && lastErr) return Promise.reject(lastErr);
        return Promise.resolve(mergeTotalsRows(acc));
      }
      return fetchTotalsPartnerList(chunks[i]).then(function (rows) {
        acc = acc.concat(rows || []);
        return run(i + 1);
      }).catch(function (err) {
        failures += 1;
        lastErr = err;
        return run(i + 1);
      });
    }
    return run(0);
  }

  function assignHeavy(name, rows) {
    var scopeCount = rows && rows._scopeCount != null && isFinite(Number(rows._scopeCount))
      ? Number(rows._scopeCount) : null;
    var indexed = indexRows(Join.omitIgnoredPartitionRows ? Join.omitIgnoredPartitionRows(rows || []) : (rows || []));
    state.scopeCounts[name] = scopeCount;
    state.capped[name] = scopeCount != null ? scopeCount > indexed.length : indexed.length >= ROW_CAP;
    state.colCache[name] = null;
    if (name === 'files') state.partnerFiles = indexed;
    else if (name === 'downloads') state.downloads = indexed.map(decorateDownloadRow);
    else if (name === 'load') state.loadHistory = indexed;
    else if (name === 'totals') state.totals = indexed;
  }

  function clearHeavy(name) {
    assignHeavy(name, []);
    state.sliceKey[name] = null;
    state.capped[name] = false;
    if (state.scopeCounts) state.scopeCounts[name] = null;
    state.errors[name] = '';
    state.loading[name] = false;
  }

  function invalidateHeavyDataLoads(opts) {
    opts = opts || {};
    state.pages.activity = 0;
    statusPassCache = null;
    loadDisplayCache = null;
    HEAVY.forEach(function (n) {
      state.sliceKey[n] = null;
      state.errors[n] = '';
      state.fetchGen[n] += 1;
      state.heavyInflightKey[n] = null;
      if (opts.markLoading && state.activeChapter === 'partnerDataHealth') {
        state.loading[n] = true;
      }
    });
  }

  function refreshProgramMetaLastDownloads() {
    var pm = getEmbeddedModule('programMeta');
    if (pm && typeof pm.refreshLastDownloads === 'function') pm.refreshLastDownloads();
  }

  function afterHeavyDatasetMutation(name) {
    if (name === 'downloads') refreshProgramMetaLastDownloads();
    if (state.activeChapter !== 'partnerDataHealth') {
      refreshUi();
      return;
    }
    if (name) queuePanelRender(name);
    else queuePartnerHealthPanels();
    summarizeStatus();
    updateHeaderExportButton();
  }

  function startHeavyFetch(name, key, fn) {
    if (state.sliceKey[name] === key && !state.errors[name] && !state.loading[name]) return;
    if (state.loading[name] && state.heavyInflightKey[name] === key) return;
    var gen = ++state.fetchGen[name];
    state.loading[name] = true;
    state.heavyInflightKey[name] = key;
    state.errors[name] = '';
    if (state.activeChapter === 'partnerDataHealth') queuePanelRender(name);
    fn().then(function (rows) {
      if (gen !== state.fetchGen[name]) return;
      state.loading[name] = false;
      state.heavyInflightKey[name] = null;
      state.sliceKey[name] = key;
      assignHeavy(name, rows || []);
      afterHeavyDatasetMutation(name);
    }).catch(function (err) {
      if (gen !== state.fetchGen[name]) return;
      state.loading[name] = false;
      state.heavyInflightKey[name] = null;
      state.errors[name] = 'Could not load this table: ' + errMessage(err);
      assignHeavy(name, []);
      afterHeavyDatasetMutation(name);
    });
  }

  function heavyFetcher(name) {
    if (name === 'files') return function () { return fetchFiltered(ALIASES.partnerFiles); };
    if (name === 'downloads') return function () { return fetchDownloads(); };
    if (name === 'load') return function () { return fetchFiltered(ALIASES.loadHistory); };
    if (name === 'totals') return fetchCampaignTotals;
    return null;
  }

  function ensureHeavyLoaded(name) {
    if (!name || name === 'activity') {
      renderPanel('activity');
      return;
    }
    if (HEAVY.indexOf(name) < 0) return;
    if (!canFetchHeavy()) {
      clearHeavy(name);
      renderPanel(name);
      return;
    }
    var fn = heavyFetcher(name);
    if (!fn) return;
    startHeavyFetch(name, currentSliceKey(), fn);
  }

  var heavyLoadTimer = null;
  function scheduleHeavyDatasetsLoad(ms) {
    clearTimeout(heavyLoadTimer);
    heavyLoadTimer = setTimeout(function () {
      heavyLoadTimer = null;
      var onPdh = state.activeChapter === 'partnerDataHealth';
      loadHeavyDatasets({ prefetch: !onPdh });
    }, ms == null ? 150 : ms);
  }

  function loadHeavyDatasets(opts) {
    opts = opts || {};
    HEAVY.forEach(function (name) { state.pages[name] = 0; });
    var onPdh = state.activeChapter === 'partnerDataHealth';
    if (!onPdh && !opts.prefetch) {
      refreshUi();
      return;
    }
    if (!canFetchHeavy()) {
      HEAVY.forEach(function (name) { clearHeavy(name); });
      if (onPdh) {
        queuePartnerHealthPanels();
        summarizeStatus();
      }
      refreshUi();
      return;
    }
    HEAVY.forEach(function (name) { ensureHeavyLoaded(name); });
  }

  function loadAll() {
    setAppLoading(true, 'Loading program activity…');
    setStatus('Loading program activity…', 'loading');
    state.loading.activity = true;
    return fetchPrograms().then(function (rows) {
      state.programs = Join.omitIgnoredPartitionRows
        ? Join.omitIgnoredPartitionRows(indexRows(rows || []))
        : indexRows(rows || []);
      state.loading.activity = false;
      state.errors.activity = '';
      state.colCache.activity = null;
      populateFilters();
      state.ready = true;
      setAppLoading(false);
      refreshUi();
      notifyEmbeddedFiltersChanged();
      if (state.activeChapter === 'partnerDataHealth') {
        loadHeavyDatasets();
      }
    }).catch(function (err) {
      state.loading.activity = false;
      state.errors.activity = 'Could not load Partner Data Health: ' + errMessage(err);
      populateFilters();
      setAppLoading(false);
      refreshUi();
    });
  }

  function parsePortalFilters(filters) {
    if (!Array.isArray(filters)) return null;
    var include = [];
    filters.forEach(function (f) {
      var col = String(f.column || f.columnName || '').toUpperCase();
      if (col !== 'PARTITION' && col !== 'CLIENT' && col !== 'PARTNER') return;
      var op = String(f.operator || f.operand || 'IN').toUpperCase();
      var values = f.values || f.value || [];
      if (!Array.isArray(values)) values = [values];
      if (op === 'NOT_IN' || op === 'NOT_EQUALS' || op === '!=') return;
      values.forEach(function (v) { if (trimStr(v)) include.push(trimStr(v)); });
    });
    return include.length ? include : null;
  }

  function setActiveTab(name, opts) {
    opts = opts || {};
    if (!PANELS[name]) return;
    state.activeTab = name;
    updatePdhTabChrome();
    if (!opts.fromHash) syncHashFromState();
    if (state.activeChapter === 'partnerDataHealth') {
      loadHeavyDatasets();
      var panel = document.getElementById(PANELS[name].prefix + 'Panel');
      if (panel && typeof panel.scrollIntoView === 'function' && !opts.skipScroll) {
        panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      summarizeStatus();
    }
  }

  function activateChapterModule(name) {
    var nextEmbedded = chapterIsEmbedded(name) ? name : null;
    if (activeEmbeddedChapterId && activeEmbeddedChapterId !== nextEmbedded) {
      deactivateEmbeddedModule(activeEmbeddedChapterId);
    }
    activeEmbeddedChapterId = nextEmbedded;
    if (!nextEmbedded) return;

    var mod = getEmbeddedModule(nextEmbedded);
    if (!mod || !mod.activate) return;

    requestAnimationFrame(function () {
      if (state.activeChapter !== nextEmbedded) return;
      mod.activate();
      updateChapterBadges();
    });
  }

  function refreshChapterModule(name) {
    var mod = getEmbeddedModule(name);
    if (mod && mod.refresh) mod.refresh();
  }

  function notifyEmbeddedFiltersChanged(opts) {
    opts = opts || {};
    var syncAllEmbedded = !!opts.hubScopeReset;
    EMBEDDED_CHAPTERS.forEach(function (entry) {
      if (!syncAllEmbedded && entry.id !== state.activeChapter) return;
      var mod = getEmbeddedModule(entry.id);
      if (mod && mod.onFiltersChanged) mod.onFiltersChanged();
    });
    updateChapterBadges();
    renderSharedFiltersChrome();
    renderInheritedChips();
    if (commandCenterActiveChapter()) refreshCommandCenter({ force: true });
  }

  function chapterHash(name, tab) {
    if (!name || name === 'hub') return '';
    if (name === 'partnerDataHealth' && tab && tab !== 'activity') {
      return '#' + name + '/' + tab;
    }
    return '#' + name;
  }

  function parseChapterHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return { chapter: 'hub', tab: null };
    var parts = raw.split('/');
    var chapter = decodeURIComponent(parts[0] || '');
    if (chapter === 'insightsUsage') chapter = 'insightsActivity';
    var tab = parts[1] ? decodeURIComponent(parts[1]) : null;
    if (CHAPTERS.indexOf(chapter) < 0 || isChapterTabled(chapter)) return { chapter: 'hub', tab: null };
    if (chapter === 'partnerDataHealth') {
      if (tab && !PANELS[tab]) tab = null;
    } else {
      tab = null;
    }
    return { chapter: chapter, tab: tab };
  }

  function syncHashFromState() {
    var next = chapterHash(state.activeChapter, state.activeTab);
    var current = location.hash || '';
    if (current === next) return;
    var base = String(location.href || '').split('#')[0];
    var url = base + next;
    if (history && typeof history.replaceState === 'function') {
      history.replaceState(null, '', url);
    } else if (next) {
      location.hash = next.slice(1);
    }
  }

  function applyLocationHash() {
    var parsed = parseChapterHash();
    if (parsed.chapter !== state.activeChapter) {
      setActiveChapter(parsed.chapter, { fromHash: true, skipScroll: true });
    }
    if (parsed.chapter === 'partnerDataHealth' && parsed.tab) {
      setActiveTab(parsed.tab, { fromHash: true, forceLoad: true });
    }
  }

  function formatHubScopeAppliedTitle(f) {
    f = f || getHubFilters();
    var parts = [];
    var partners = f.scopePartners || f.partners || [];
    if (partners.length) parts.push(partners.join(', '));
    if (f.campaigns && f.campaigns.length) parts.push(f.campaigns.join(', '));
    if (f.years && f.years.length) parts.push(f.years.join(', '));
    return parts.join(' · ');
  }

  function inheritedChipItems() {
    var f = getHubFilters();
    var chips = [];
    var partners = f.scopePartners || [];
    if (partners.length === 1) chips.push({ label: 'Partner', value: partners[0] });
    else if (partners.length > 1) {
      chips.push({ label: 'Partners', value: partners.length + ' selected' });
    }
    if (f.campaigns && f.campaigns.length === 1) chips.push({ label: 'Campaign', value: f.campaigns[0] });
    else if (f.campaigns && f.campaigns.length > 1) {
      chips.push({ label: 'Campaigns', value: f.campaigns.length + ' selected' });
    }
    if (f.years && f.years.length === 1) chips.push({ label: 'Year', value: f.years[0] });
    else if (f.years && f.years.length > 1) {
      chips.push({ label: 'Years', value: f.years.length + ' selected' });
    }
    return chips;
  }

  function renderSharedFiltersChrome() {
    var chrome = document.getElementById('sharedFiltersChrome');
    if (!chrome) return;
    chrome.hidden = SHARED_FILTER_CHAPTERS.indexOf(state.activeChapter) < 0;
    if (state.activeChapter === 'workQueue' && window.OpsCommandCenter && typeof window.OpsCommandCenter.syncQueueSeverityUi === 'function') {
      window.OpsCommandCenter.syncQueueSeverityUi();
    }
  }

  function hasAppliedHubPartners() {
    return !!(state.filters.partners && state.filters.partners.length);
  }

  function clearHubPartnerScope() {
    if (!hasAppliedHubPartners() && !(state.draft.partners && state.draft.partners.length)) return;
    state.draft.partners = [];
    state.filters.partners = [];
    state.hubScopeSuppressed = true;
    closeMultiMenus(null);
    populateFilters();
    invalidateHeavyDataLoads({
      markLoading: state.activeChapter === 'partnerDataHealth'
    });
    if (canFetchHeavy()) {
      loadHeavyDatasets({
        prefetch: state.activeChapter !== 'partnerDataHealth'
      });
    } else {
      HEAVY.forEach(clearHeavy);
    }
    notifyEmbeddedFiltersChanged({ hubScopeReset: true });
    refreshUi();
  }

  function renderInheritedChips() {
    var bar = document.getElementById('inheritedFiltersBar');
    var titleEl = document.getElementById('hubScopeAppliedTitle');
    var clearBtn = document.getElementById('btnClearHubPartners');
    if (!bar) return;
    var title = formatHubScopeAppliedTitle();
    var show = state.activeChapter !== 'hub' && !!title;
    bar.hidden = !show;
    if (titleEl) titleEl.textContent = title;
    if (clearBtn) clearBtn.hidden = !show || !hasAppliedHubPartners();
  }

  function applyChapterTheme(name) {
    var theme = name && CHAPTERS.indexOf(name) >= 0 ? name : 'hub';
    document.documentElement.setAttribute('data-chapter-theme', theme);
  }

  var CHAPTER_SCROLL_TOP_SLACK = 32;

  function windowScrollY() {
    var root = document.scrollingElement || document.documentElement || document.body;
    return window.pageYOffset || (root && root.scrollTop) || 0;
  }

  function isNearAppTop() {
    return windowScrollY() <= CHAPTER_SCROLL_TOP_SLACK;
  }

  function scrollAppToTop(behavior) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: behavior || 'auto' });
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }

  function afterChapterSwitchScroll(userHadScrolledDown) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (userHadScrolledDown) scrollAppToTop('smooth');
        else scrollAppToTop('auto');
      });
    });
  }

  function setActiveChapter(name, opts) {
    opts = opts || {};
    if (CHAPTERS.indexOf(name) < 0) return;
    if (isChapterTabled(name)) {
      setActiveChapter('hub', opts);
      return;
    }
    var userHadScrolledDown = name !== state.activeChapter && !isNearAppTop();
    applyChapterTheme(name);
    if (name === state.activeChapter) {
      updateChapterPageTitle(name);
      if (!opts.fromHash) {
        refreshChapterModule(name);
        if (name === 'partnerDataHealth') schedulePartnerHealthOpen();
      }
      if (!opts.fromHash) syncHashFromState();
      renderSharedFiltersChrome();
      renderInheritedChips();
      return;
    }
    state.activeChapter = name;
    if (name === 'howWeBuild' && window.HowWeBuild && typeof window.HowWeBuild.showSection === 'function') {
      window.HowWeBuild.showSection(document.getElementById('howWeBuildMount'), 'portal');
    }
    updateChapterPageTitle(name);
    CHAPTERS.forEach(function (key) {
      var el = document.getElementById(key + 'Chapter');
      var btn = document.querySelector('.chapter-nav-btn[data-chapter="' + key + '"]');
      var on = key === name;
      if (el) {
        el.hidden = !on;
        el.classList.toggle('is-active', on);
      }
      if (btn) {
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-current', on ? 'page' : 'false');
      }
    });
    applyTabledChapterChrome();
    activateChapterModule(name);
    if (!chapterIsEmbedded(name)) updateChapterBadges();
    if (name === 'partnerDataHealth') {
      summarizeStatus();
      schedulePartnerHealthOpen();
    } else if (name === 'hub' || name === 'workQueue') {
      refreshCommandCenter({ force: true });
      var hubMsg = chapterStatusMessage(name);
      if (hubMsg) setStatus(hubMsg);
    } else {
      var msg = chapterStatusMessage(name);
      if (msg) setStatus(msg);
    }
    if (!opts.fromHash) syncHashFromState();
    renderSharedFiltersChrome();
    renderInheritedChips();
    updateHeaderExportButton();
    if (!opts.skipScroll) afterChapterSwitchScroll(userHadScrolledDown);
  }

  function initThemeToggle() {
    var root = document.documentElement;
    var storageKey = '3e-dashboard-theme';
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    function systemTheme() { return mql.matches ? 'dark' : 'light'; }
    function getPreference() {
      try {
        var saved = localStorage.getItem(storageKey);
        if (saved === 'light' || saved === 'dark') return saved;
      } catch (e) { /* ignore */ }
      return 'system';
    }
    function apply(pref) {
      var theme = pref === 'system' ? systemTheme() : pref;
      root.classList.add('theme-switching');
      root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
      var buttons = document.querySelectorAll('.theme-toggle-btn[data-theme-set]');
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        btn.classList.toggle('is-active', btn.getAttribute('data-theme-set') === pref);
        btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-set') === pref ? 'true' : 'false');
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.remove('theme-switching');
        });
      });
    }
    function setPreference(pref) {
      try {
        if (pref === 'system') localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, pref);
      } catch (e) { /* ignore */ }
      apply(pref);
    }
    apply(getPreference());
    var buttons = document.querySelectorAll('.theme-toggle-btn[data-theme-set]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var pref = this.getAttribute('data-theme-set');
        if (pref === 'light' || pref === 'dark' || pref === 'system') setPreference(pref);
      });
    }
    function onSystemChange() { if (getPreference() === 'system') apply('system'); }
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onSystemChange);
    else if (typeof mql.addListener === 'function') mql.addListener(onSystemChange);
  }

  function initProgramDetailDrawer() {
    var close = document.getElementById('btn-close-detail');
    var overlay = document.getElementById('detail-overlay');
    var exportProgram = document.getElementById('btn-export-program-csv');
    var exportFile = document.getElementById('btn-export-file-csv');
    if (close) close.addEventListener('click', function () { setProgramDetailOpen(false); });
    if (overlay) overlay.addEventListener('click', function () { setProgramDetailOpen(false); });
    if (exportProgram) exportProgram.addEventListener('click', exportProgramDetailCsv);
    if (exportFile) exportFile.addEventListener('click', exportLatestFileSummaryCsv);
    var pdh = document.getElementById('partnerDataHealthChapter');
    if (pdh) {
      pdh.addEventListener('keydown', function (ev) {
        var row = ev.target && ev.target.closest ? ev.target.closest('tr.row-clickable') : null;
        if (!row) return;
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openDetailFromClickable(row);
        }
      });
    }
  }

  function initHelpModal() {
    var btn = document.getElementById('btn-help');
    var close = document.getElementById('btn-close-help');
    var overlay = document.getElementById('help-overlay');
    var modal = document.getElementById('help-modal');
    function setOpen(open) {
      if (!modal) return;
      modal.classList.toggle('is-open', open);
      modal.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (overlay) {
        overlay.classList.toggle('is-open', open);
        overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
      }
      document.body.classList.toggle('help-open', open);
      if (open && close) close.focus();
      else if (!open && btn) btn.focus();
    }
    if (btn) btn.addEventListener('click', function () { setOpen(true); });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    if (overlay) overlay.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      var detail = document.getElementById('detail-drawer');
      if (detail && detail.classList.contains('is-open')) {
        setProgramDetailOpen(false);
        return;
      }
      if (modal && modal.classList.contains('is-open')) setOpen(false);
      var exportModal = document.getElementById('export-confirm-modal');
      if (exportModal && exportModal.classList.contains('is-open')) setExportConfirmOpen(false);
    });
  }

  function bindControls() {
    function onScopeChange() {
      populateFilters();
      invalidateHeavyDataLoads({
        markLoading: state.activeChapter === 'partnerDataHealth'
      });
      if (canFetchHeavy()) {
        scheduleHeavyDatasetsLoad(state.activeChapter === 'partnerDataHealth' ? 120 : 200);
      } else {
        HEAVY.forEach(clearHeavy);
      }
      refreshUi();
    }
    function applyPdhFilters(opts) {
      opts = opts || {};
      state.filters = cloneFilters(state.draft);
      if (!opts.keepHubScopeSuppressed) state.hubScopeSuppressed = false;
      closeMultiMenus(null);
      onScopeChange();
      notifyEmbeddedFiltersChanged({ hubScopeReset: !!opts.keepHubScopeSuppressed });
    }
    function resetPdhFilters() {
      clearMenuSearchQueries();
      state.draft = {
        partners: [],
        campaigns: [],
        years: [],
        statuses: defaultStatusSelection(),
        search: ''
      };
      state.didDefaultYear = true;
      state.hubScopeSuppressed = true;
      applyPdhFilters({ keepHubScopeSuppressed: true });
    }
    onScopeFilterChange = function () {
      populateFilters();
    };
    onPartnerFilterChange = function () {
      populateFilters();
    };
    onStatusFilterChange = function () {
      populateFilters();
    };
    initMultiSelectTriggers();
    if (els.applyFilters) els.applyFilters.addEventListener('click', applyPdhFilters);
    if (els.resetFilters) els.resetFilters.addEventListener('click', resetPdhFilters);
    var clearHubPartners = document.getElementById('btnClearHubPartners');
    if (clearHubPartners) {
      clearHubPartners.addEventListener('click', function () { clearHubPartnerScope(); });
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      var hubCard = t.closest('.hub-card[data-chapter]');
      if (!hubCard || t.closest('.hub-card-btn')) return;
      ev.preventDefault();
      setActiveChapter(hubCard.getAttribute('data-chapter'));
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.nodeType === 3) t = t.parentElement;
      if (!t || typeof t.closest !== 'function') return;
      var chapterBtn = t.closest('[data-chapter]');
      if (chapterBtn && (
        chapterBtn.classList.contains('chapter-nav-btn') ||
        chapterBtn.classList.contains('hub-card-btn') ||
        chapterBtn.classList.contains('hub-card')
      )) {
        setActiveChapter(chapterBtn.getAttribute('data-chapter'));
        return;
      }
      if (state.activeChapter === 'printBatches' && window.PartnerPrintBatchesTab && window.PartnerPrintBatchesTab.handleClick(ev)) {
        return;
      }
      if (state.activeChapter === 'campaignUploadQa' && window.PartnerCampaignUploadQaTab && window.PartnerCampaignUploadQaTab.handleClick(ev)) {
        return;
      }
      var exportBtn = t.closest('[data-export-table]');
      if (exportBtn && exportBtn.closest('#partnerDataHealthChapter')) {
        exportPanelTable(exportBtn.getAttribute('data-export-table'));
        return;
      }
      var pageBtn = t.closest('[data-page-table]');
      if (pageBtn) {
        var table = pageBtn.getAttribute('data-page-table');
        if (!PANELS[table]) return;
        var dir = pageBtn.getAttribute('data-page-dir');
        if (dir === 'prev') state.pages[table] = Math.max(0, (state.pages[table] || 0) - 1);
        else state.pages[table] = (state.pages[table] || 0) + 1;
        renderPanel(table);
        return;
      }
      var sortBtn = t.closest('[data-sort-table]');
      if (sortBtn) {
        var sortTable = sortBtn.getAttribute('data-sort-table');
        var key = sortBtn.getAttribute('data-sort-key');
        var cur = state.sorts[sortTable] || { key: key, dir: 'asc' };
        if (cur.key === key) cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
        else { cur.key = key; cur.dir = 'asc'; }
        state.sorts[sortTable] = cur;
        state.pages[sortTable] = 0;
        renderPanel(sortTable);
        return;
      }
      var clickableRow = t.closest('#partnerDataHealthChapter tr.row-clickable');
      if (clickableRow) {
        openDetailFromClickable(clickableRow);
      }
    });
    initThemeToggle();
    initHeaderExportButton();
    initExportConfirmModal();
    initHelpModal();
    initProgramDetailDrawer();
  }

  bindControls();
  populateFilters();
  window.HowWeBuildOnOpsChapter = function (name) {
    if (name && name !== 'howWeBuild') setActiveChapter(name);
  };
  if (window.HowWeBuild && typeof window.HowWeBuild.mount === 'function') {
    window.HowWeBuild.mount(document.getElementById('howWeBuildMount'));
  }
  var embeddedHost = {
    getFilters: getHubFilters,
    getScopeSignature: hubScopeSignature,
    getPrograms: function () { return state.programs; },
    getPartnerFilterOptions: function (scopeOverride) {
      var draft = scopeOverride || state.draft;
      return computePdhFilterOptions(draft).partners;
    },
    getScopeFilterOptions: function (scopeOverride) {
      return computePdhFilterOptions(scopeOverride || state.draft);
    },
    isReady: function () { return state.ready; },
    getDownloads: function () { return state.downloads; },
    openProgramDetail: function (row) {
      if (!row) return false;
      setActiveChapter('partnerDataHealth');
      openProgramDetail(row);
      return true;
    },
    setQaCalendarYear: function (calendarYear) {
      var year = Number(calendarYear);
      if (!isFinite(year)) return false;
      var want = 'CY' + String(year).slice(-2);
      var matching = uniqueSorted(programFilterRows().map(function (r) { return r.CAMPAIGN_YEAR; })).filter(function (y) {
        var token = campaignYearToken(y);
        if (token === want) return true;
        return String(y).trim() === String(year);
      });
      if (!matching.length) matching = [want];
      if (matching.join('|') === state.filters.years.join('|') &&
          matching.join('|') === state.draft.years.join('|')) {
        return false;
      }
      state.draft.years = matching.slice();
      state.filters.years = matching.slice();
      populateFilters();
      return true;
    },
    setStatus: setStatus,
    setAppLoading: setAppLoading,
    onChapterRefresh: function () {
      updateChapterBadges();
      refreshCommandCenter();
    },
    onPrintRefresh: function () {
      updateChapterBadges();
      refreshCommandCenter();
    },
    getActiveChapter: function () { return state.activeChapter; },
    programLifecycle: programLifecycle,
    filterProgramsForScope: function (programs, filters) {
      var f = filters || getHubFilters();
      return (programs || []).filter(function (r) {
        return matchesFilters(r, { status: true }, f);
      });
    },
    navigateChapter: function (chapter, opts) {
      opts = opts || {};
      setActiveChapter(chapter || 'partnerDataHealth', { skipScroll: false });
      if (opts.programRow && chapter === 'partnerDataHealth') {
        openProgramDetail(opts.programRow);
      }
    },
    applyPartnerScope: function (partner) {
      if (!trimStr(partner)) return;
      state.draft.partners = [trimStr(partner)];
      state.filters.partners = [trimStr(partner)];
      closeMultiMenus(null);
      populateFilters();
      state.pages.activity = 0;
      HEAVY.forEach(function (n) { state.sliceKey[n] = null; });
      loadHeavyDatasets();
      notifyEmbeddedFiltersChanged();
      refreshUi();
      refreshCommandCenter({ force: true });
    },
    onCommandCenterRefresh: function () {
      refreshCommandCenter();
    },
    getHeavyState: function () {
      return {
        files: state.partnerFiles,
        totals: state.totals,
        load: state.loadHistory,
        loading: state.loading,
        errors: state.errors
      };
    },
    requestHeavyLoad: function () {
      scheduleHeavyDatasetsLoad(0);
    },
    needsHeavyLoad: function () {
      if (!canFetchHeavy()) return false;
      var key = currentSliceKey();
      return HEAVY.some(function (n) {
        return state.sliceKey[n] !== key || !!state.errors[n];
      });
    },
    heavyFetchPending: function () {
      return HEAVY.some(function (n) { return state.loading[n]; });
    },
    getHeavySliceKey: function () {
      return currentSliceKey();
    },
    isChapterTabled: isChapterTabled,
    isDatasetMapped: function (alias) {
      return !!CARD_DATASET_ALIASES[alias];
    }
  };
  applyTabledChapterChrome();
  if (window.OpsCommandCenter && typeof window.OpsCommandCenter.init === 'function') {
    window.OpsCommandCenter.init(embeddedHost);
  }
  EMBEDDED_CHAPTERS.forEach(function (entry) {
    var mod = getEmbeddedModule(entry.id);
    if (mod && mod.init) mod.init(embeddedHost);
  });
  setActiveChapter(parseChapterHash().chapter, { skipScroll: true, fromHash: true });
  applyLocationHash();
  window.addEventListener('hashchange', applyLocationHash);
  if (typeof domo !== 'undefined' && typeof domo.onFiltersUpdate === 'function') {
    domo.onFiltersUpdate(function (filters) {
      state.portalPartners = parsePortalFilters(filters);
      state.hubScopeSuppressed = false;
      if (!state.ready) return;
      populateFilters();
      HEAVY.forEach(function (n) { state.sliceKey[n] = null; });
      loadHeavyDatasets();
      notifyEmbeddedFiltersChanged();
      if (state.activeChapter === 'partnerDataHealth' || state.activeChapter === 'hub' || state.activeChapter === 'workQueue') {
        refreshUi();
      }
    });
  }
  loadAll();
})();
