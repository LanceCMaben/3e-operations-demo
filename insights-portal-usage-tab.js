/**
 * Insights Activity — embedded chapter in 3E Operations.
 * Rebuild of Analyzer page 2074513896 (portal page-view log).
 */
(function (global) {
  'use strict';

  var DATASET = { alias: 'pageViews', id: 'dea70a64-b434-4783-80d3-84df858a785c' };
  var SETUP_MSG = 'Alias pageViews must map to the PortalActivity dataset on this 3E Operations card (Domo Webform). Edit card → Data, confirm the mapping, then hard-refresh.';
  var PAGE_SIZE = 50;
  /** PortalActivity is a webform. This limit, with no filter param, is the request that loads. */
  var FETCH_PAGE = 25000;
  /** Stop paging once this many newest rows are in memory. */
  var ROW_CAP = 100000;
  var QUERY_TIMEOUT = 90000;
  /** Last 12 months is this many days. */
  var IPU_ALL_TIME_DAYS = 365;
  var lastFetchCapped = false;
  /** Manifest-mapped columns on alias `pageViews` (Portal Activity / page 2074513896). */
  var DATA_API_FIELDS = [
    'page_name', 'created_by_name', 'created_by_email', 'workspace_name', 'user_name', 'user_email', 'user_id',
    'act_date', 'created_at', 'login_portal', 'email_domain', 'type', 'group_name', 'user_type'
  ];
  var SQL_SELECT =
    'SELECT page_name, created_by_name, created_by_email, workspace_name, user_name, user_email, user_id, act_date, created_at, login_portal, email_domain, type, group_name, user_type FROM {alias}';

  var INTERNAL_EMAIL_SUFFIXES = ['@3enrollment.com', '@3enrollmentmarketing.com'];
  var INTERNAL_TOKENS = [
    'internal', '3e internal', 'employee', 'staff', '3e team', '3enrollment',
    'development', 'dev portal', 'insights portal', 'clearsquare'
  ];
  var CLIENT_TOKENS = ['client', 'partner', 'external', 'customer', 'client portal', 'partner portal'];

  /** Legacy page 2074513896 — Domo activity / portal usage dataset (see README column list). */
  var FIELD_CANDIDATES = {
    page: [
      'page_name', 'Page Name', 'PAGE_NAME', 'Page', 'page title', 'Page Title', 'Portal Page',
      'document_name', 'Document Name', 'form_name', 'dashboard_name', 'Dashboard', 'name'
    ],
    viewerName: [
      'Created by name', 'Created By Name', 'CREATED BY NAME', 'created_by_name', 'Created_By_Name',
      'user_name', 'User Name', 'USER_NAME', 'User', 'Domain User', 'Viewer'
    ],
    viewerEmail: [
      'Created by email', 'Created By Email', 'CREATED BY EMAIL', 'created_by_email', 'Created_By_Email',
      'user_email', 'User Email', 'USER_EMAIL', 'Email'
    ],
    user: [
      'Created by name', 'Created By Name', 'created_by_name', 'user_name', 'User Name', 'USER_NAME', 'User', 'Domain User', 'Viewer'
    ],
    userId: ['user_id', 'User Id', 'USER_ID', 'User ID', 'UserId'],
    email: [
      'Created by email', 'Created By Email', 'created_by_email', 'user_email', 'User Email', 'USER_EMAIL', 'Email'
    ],
    when: [
      'act_date', 'Act Date', 'ACT_DATE', 'Activity Date', 'created_at', 'Created At',
      'EVENT_TIME', 'Event Time', 'Timestamp', 'VIEW_DATE', 'View Date', 'date', 'Date'
    ],
    userType: ['user_type', 'User Type', 'User_Type', 'USER_TYPE'],
    loginPortal: ['login_portal', 'Login Portal', 'LOGIN_PORTAL', 'Portal'],
    emailDomain: ['email_domain', 'Email Domain', 'EMAIL_DOMAIN'],
    type: ['type', 'Type', 'TYPE', 'event_type', 'Event Type'],
    partition: [
      'workspace_name', 'Workspace Name', 'WORKSPACE_NAME', 'Workspace',
      'group_name', 'Group Name', 'PARTITION', 'partition', 'CLIENT', 'Partner', 'Campaign'
    ]
  };

  var host = null;
  var chapterRoot = null;
  var tabActive = false;
  var chartTopPages = null;
  var chartTimeline = null;
  var chartUniqueViewers = null;
  var chartAudienceMix = null;
  var chartTopPartitions = null;
  var chartViewerDetailMix = null;

  var ipuMenuSearchQueries = {};
  var IPU_MENU_SEARCH_PLACEHOLDER = 'Search…';
  var IPU_RANGE_OPTIONS = [
    { days: 7, label: 'Last 7 days' },
    { days: 30, label: 'Last 30 days' },
    { days: 90, label: 'Last 90 days' },
    { days: 0, label: 'Last 12 months' }
  ];
  /** Max gap credited toward dwell between consecutive views by the same viewer. */
  var IPU_DWELL_MAX_MS = 30 * 60 * 1000;
  var dwellStampGen = 0;
  var IPU_DWELL_HELP = 'Estimated from time until the viewer\'s next page view (30 min max per gap).';

  function defaultIpuFilters() {
    return { audience: 'all', rangeDays: 7, partitions: [], selectedPages: [], search: '' };
  }

  function cloneIpuFilters(f) {
    return {
      audience: f.audience,
      rangeDays: f.rangeDays,
      partitions: (f.partitions || []).slice(),
      selectedPages: (f.selectedPages || []).slice(),
      search: trimStr(f.search)
    };
  }

  var state = {
    rows: [],
    fields: {},
    ready: false,
    loading: false,
    error: '',
    mappingOk: null,
    filters: defaultIpuFilters(),
    draft: defaultIpuFilters(),
    rawRowCount: 0,
    loadCapped: false,
    columnNames: [],
    sortRecent: { key: 'when', dir: 'desc' },
    sortPages: { key: 'views', dir: 'desc' },
    sortUsers: { key: 'views', dir: 'desc' },
    pageRecent: 0,
    pagePages: 0,
    pageUsers: 0,
    chartDetail: null,
    recentLocal: { dashboard: '', viewer: '', partition: '' },
    scopeSummary: null,
    scopeSummaryLoading: ''
  };

  function $(id) {
    if (chapterRoot) {
      var scoped = chapterRoot.querySelector('#' + id);
      if (scoped) return scoped;
    }
    return document.getElementById(id);
  }

  function hostStatus(msg, kind) {
    var el = $('ipuChapterStatus');
    if (el && window.OpsUi && OpsUi.setStatusEl) {
      OpsUi.setStatusEl(el, msg, kind);
    } else if (el) {
      el.textContent = msg || '';
      el.classList.toggle('is-error', kind === 'error');
    }
    if (host && typeof host.setStatus === 'function') host.setStatus(msg, kind);
  }

  function showSetupPanel(message) {
    var panel = $('ipuSetupPanel');
    var msgEl = $('ipuSetupMessage');
    if (msgEl) msgEl.textContent = message || SETUP_MSG;
    if (panel) panel.hidden = false;
    var chrome = chapterRoot && chapterRoot.querySelector('.ipu-sticky-chrome');
    if (chrome) chrome.hidden = true;
    var summary = chapterRoot && chapterRoot.querySelector('.ipu-summary-chrome');
    if (summary) summary.hidden = true;
    var grids = chapterRoot && chapterRoot.querySelectorAll('.ipu-chrome-row, .ipu-charts-row, .ipu-panel, .ipu-tables-row, .ipu-chart-detail');
    if (grids) {
      for (var i = 0; i < grids.length; i++) {
        if (!grids[i].classList.contains('ipu-setup-panel')) grids[i].hidden = true;
      }
    }
  }

  function hideSetupPanel() {
    var panel = $('ipuSetupPanel');
    if (panel) panel.hidden = true;
    var chrome = chapterRoot && chapterRoot.querySelector('.ipu-sticky-chrome');
    if (chrome) chrome.hidden = false;
    var summary = chapterRoot && chapterRoot.querySelector('.ipu-summary-chrome');
    if (summary) summary.hidden = false;
    var grids = chapterRoot && chapterRoot.querySelectorAll('.ipu-chrome-row, .ipu-charts-row, .ipu-panel, .ipu-tables-row, .ipu-chart-detail');
    if (grids) {
      for (var i = 0; i < grids.length; i++) {
        if (!grids[i].classList.contains('ipu-setup-panel')) grids[i].hidden = false;
      }
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function trimStr(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function rowVal(row, key) {
    if (!row || !key) return null;
    if (row[key] !== undefined && row[key] !== null) return row[key];
    var upper = String(key).toUpperCase();
    var lower = String(key).toLowerCase();
    if (row[upper] !== undefined) return row[upper];
    if (row[lower] !== undefined) return row[lower];
    return null;
  }

  function pickField(row, candidates) {
    if (!row) return '';
    var keys = Object.keys(row);
    for (var c = 0; c < candidates.length; c++) {
      var want = candidates[c];
      for (var k = 0; k < keys.length; k++) {
        if (String(keys[k]).toUpperCase() === String(want).toUpperCase()) return keys[k];
      }
    }
    for (var c2 = 0; c2 < candidates.length; c2++) {
      var frag = String(candidates[c2]).toUpperCase();
      for (var k2 = 0; k2 < keys.length; k2++) {
        if (String(keys[k2]).toUpperCase().indexOf(frag) >= 0) return keys[k2];
      }
    }
    return '';
  }

  function inferFieldByPattern(sampleRow, patterns) {
    if (!sampleRow) return '';
    var keys = Object.keys(sampleRow);
    var i;
    for (i = 0; i < patterns.length; i++) {
      var re = patterns[i];
      for (var k = 0; k < keys.length; k++) {
        if (re.test(String(keys[k]))) return keys[k];
      }
    }
    return '';
  }

  function resolveFields(sampleRow) {
    var resolved = {};
    Object.keys(FIELD_CANDIDATES).forEach(function (group) {
      resolved[group] = pickField(sampleRow, FIELD_CANDIDATES[group]);
    });
    if (!resolved.page) {
      resolved.page = inferFieldByPattern(sampleRow, [/page.*name/i, /^page$/i, /portal.*page/i, /dashboard/i, /document.*name/i]);
    }
    if (!resolved.when) {
      resolved.when = inferFieldByPattern(sampleRow, [/act.*date/i, /activity.*date/i, /^date$/i, /view.*date/i, /event.*time/i, /timestamp/i, /created/i]);
    }
    resolved.viewerName = pickField(sampleRow, FIELD_CANDIDATES.viewerName) ||
      inferFieldByPattern(sampleRow, [/created\s*by\s*name/i, /created_by_name/i]);
    resolved.viewerEmail = pickField(sampleRow, FIELD_CANDIDATES.viewerEmail) ||
      inferFieldByPattern(sampleRow, [/created\s*by\s*email/i, /created_by_email/i]);
    if (!resolved.user) {
      resolved.user = resolved.viewerName ||
        inferFieldByPattern(sampleRow, [/user.*name/i, /^user$/i, /viewer/i, /created_by/i]);
    }
    if (!resolved.email) {
      resolved.email = resolved.viewerEmail ||
        inferFieldByPattern(sampleRow, [/user.*email/i, /^email$/i, /created_by_email/i]);
    }
    if (!resolved.userId) {
      resolved.userId = pickField(sampleRow, FIELD_CANDIDATES.userId) ||
        inferFieldByPattern(sampleRow, [/user.*id/i, /^userid$/i]);
    }
    if (!resolved.userType && sampleRow) {
      Object.keys(sampleRow).forEach(function (k) {
        if (/^user[_\s]?type/i.test(k) && k.indexOf('Merged') >= 0) resolved.userType = k;
      });
    }
    if (!resolved.userType && sampleRow) {
      Object.keys(sampleRow).forEach(function (k) {
        if (/^user[_\s]?type/i.test(String(k))) resolved.userType = k;
      });
    }
    if (!resolved.type) {
      resolved.type = inferFieldByPattern(sampleRow, [/^type$/i, /event.*type/i]);
    }
    if (!resolved.partition) {
      resolved.partition = inferFieldByPattern(sampleRow, [/workspace\s*name/i, /^partition$/i]);
    }
    return resolved;
  }

  function isPageViewEvent(row, fields) {
    var typeKey = fields.type;
    if (!typeKey) return true;
    var t = trimStr(rowVal(row, typeKey)).toLowerCase();
    if (!t) return true;
    if (t.indexOf('page') >= 0 && (t.indexOf('view') >= 0 || t.indexOf('visit') >= 0)) return true;
    if (t === 'pageview' || t === 'page_view') return true;
    if (t.indexOf('login') >= 0 || t.indexOf('logout') >= 0 || t.indexOf('email') >= 0) return false;
    if (/^\d+day_/.test(t) || t.indexOf('ytd_') >= 0 || t.indexOf('_pg_views') >= 0) return false;
    return true;
  }

  function parseWhen(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    var n = Number(value);
    if (!isNaN(n) && n > 1e11) return new Date(n);
    if (!isNaN(n) && n > 20000 && n < 600000) {
      var excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + n * 86400000);
    }
    if (!isNaN(n) && n > 1e9 && n < 1e11) {
      return new Date(n * 1000);
    }
    var s = trimStr(value);
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (iso) {
      return new Date(
        Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
        Number(iso[4]), Number(iso[5])
      );
    }
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function parseWhenFromRow(row, fields) {
    var whenKey = fields.when;
    var when = whenKey ? parseWhen(rowVal(row, whenKey)) : null;
    if (!when) when = parseWhen(rowVal(row, 'created_at'));
    if (!when) when = parseWhen(rowVal(row, 'act_date'));
    if (!when && row) {
      Object.keys(row).forEach(function (k) {
        if (when) return;
        if (/date|time|timestamp|created|act/i.test(String(k))) {
          when = parseWhen(rowVal(row, k));
        }
      });
    }
    return when;
  }

  function formatWhen(d) {
    if (!d) return '—';
    try {
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
    } catch (e) {
      return String(d);
    }
  }

  function formatEstimatedDwell(ms) {
    ms = Math.max(0, Math.round(ms || 0));
    if (!ms) return '—';
    var sec = Math.floor(ms / 1000);
    if (sec < 60) return sec + 's';
    var min = Math.floor(sec / 60);
    sec = sec % 60;
    if (min < 60) return sec ? (min + 'm ' + sec + 's') : (min + 'm');
    var hr = Math.floor(min / 60);
    min = min % 60;
    return min ? (hr + 'h ' + min + 'm') : (hr + 'h');
  }

  function applyEstimatedDwellToRows(rows) {
    var byViewer = {};
    (rows || []).forEach(function (r) {
      r.estimatedDwellMs = 0;
      if (!r.whenMs) return;
      var vk = r.viewerKey || viewerDistinctKey(r);
      if (!vk) return;
      if (!byViewer[vk]) byViewer[vk] = [];
      byViewer[vk].push(r);
    });
    Object.keys(byViewer).forEach(function (vk) {
      var list = byViewer[vk].sort(function (a, b) { return (a.whenMs || 0) - (b.whenMs || 0); });
      for (var i = 0; i < list.length; i++) {
        var gap = 0;
        if (i + 1 < list.length) {
          gap = (list[i + 1].whenMs || 0) - (list[i].whenMs || 0);
          if (gap < 0) gap = 0;
          if (gap > IPU_DWELL_MAX_MS) gap = IPU_DWELL_MAX_MS;
        }
        list[i].estimatedDwellMs = gap;
      }
    });
  }

  function dwellBasisRows() {
    return applyScopeFilters(state.rows, {
      filterBag: state.filters,
      skipPartitions: true,
      skipPages: true,
      skipSearch: true
    });
  }

  function stampDwellBasis() {
    dwellStampGen += 1;
    var gen = dwellStampGen;
    var basis = dwellBasisRows();
    applyEstimatedDwellToRows(basis);
    basis.forEach(function (r) { r._dwellGen = gen; });
  }

  function dwellAlreadyStamped(rows) {
    if (!dwellStampGen || !rows || !rows.length) return false;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i] || rows[i]._dwellGen !== dwellStampGen) return false;
    }
    return true;
  }

  function ensureRowDwell(rows, scopeRows) {
    if (dwellAlreadyStamped(rows)) return;
    applyEstimatedDwellToRows(scopeRows || rows);
  }

  function viewerPageDwellTotals(rows) {
    ensureRowDwell(rows);
    var out = {};
    (rows || []).forEach(function (r) {
      var vk = r.viewerKey || viewerDistinctKey(r);
      if (!vk || !r.page) return;
      if (!out[vk]) out[vk] = {};
      out[vk][r.page] = (out[vk][r.page] || 0) + (r.estimatedDwellMs || 0);
    });
    return out;
  }

  function sumEstimatedDwell(rows) {
    ensureRowDwell(rows);
    var sum = 0;
    (rows || []).forEach(function (r) { sum += r.estimatedDwellMs || 0; });
    return sum;
  }

  function formatDayKey(d) {
    if (!d) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function parseDayKey(key) {
    if (!key) return null;
    var m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function formatChartAxisDate(key) {
    var d = parseDayKey(key);
    if (!d) return String(key || '');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatChartTooltipDate(key) {
    var d = parseDayKey(key);
    if (!d) return String(key || '');
    return d.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function ipuTooltipTheme(colors) {
    return {
      backgroundColor: 'rgba(20, 20, 22, 0.92)',
      titleColor: '#fff',
      bodyColor: '#f3f4f6',
      borderColor: colors.grid,
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
      titleFont: { size: 12, weight: '600' },
      bodyFont: { size: 11 },
      displayColors: true,
      boxPadding: 4
    };
  }

  function audiencePillLabel(audience) {
    if (audience === 'internal') return 'Internal';
    if (audience === 'client') return 'Client';
    return 'Unknown';
  }

  function classifyAudienceText(raw) {
    var norm = trimStr(raw).toLowerCase();
    if (!norm) return '';
    for (var i = 0; i < INTERNAL_TOKENS.length; i++) {
      if (norm.indexOf(INTERNAL_TOKENS[i]) >= 0) return 'internal';
    }
    for (var j = 0; j < CLIENT_TOKENS.length; j++) {
      if (norm.indexOf(CLIENT_TOKENS[j]) >= 0) return 'client';
    }
    if (norm.indexOf('internal') >= 0 || norm.indexOf('employee') >= 0) return 'internal';
    if (norm.indexOf('client') >= 0 || norm.indexOf('partner') >= 0) return 'client';
    return '';
  }

  /** Portal sandboxes named like "{Partner} test" — not production client activity. */
  function isTestPortalPartition(name) {
    var n = trimStr(name);
    if (!n) return false;
    return /\stest$/i.test(n);
  }

  /** ClearSquare / portal QA logins (e.g. rivier@test.com, "Rivier Test"). */
  function isTestPortalViewerEmail(email) {
    var e = trimStr(email).toLowerCase();
    if (!e || e.indexOf('@') < 0) return false;
    var domain = e.slice(e.indexOf('@') + 1);
    return domain === 'test.com' || domain.endsWith('.test.com');
  }

  function isTestPortalViewerName(name) {
    var n = trimStr(name);
    if (!n || n.indexOf('@') >= 0) return false;
    if (/\stest\s+account\b/i.test(n)) return true;
    if (/\btest\s+account\s+\d+/i.test(n)) return true;
    if (/\stest$/i.test(n)) return true;
    return false;
  }

  function isTestPortalViewerRecord(email, user) {
    if (isTestPortalViewerEmail(email)) return true;
    if (isTestPortalViewerName(user)) return true;
    return false;
  }

  function isTestPortalViewerRow(r) {
    if (!r) return false;
    if (isTestPortalViewerRecord(r.email, r.user)) return true;
    if (isTestPortalViewerName(r.viewerLabel)) return true;
    return false;
  }

  function isInternalWorkspaceName(name) {
    var n = trimStr(name).toLowerCase();
    if (!n) return false;
    if (isTestPortalPartition(name)) return true;
    if (/^z_/.test(n)) return true;
    if (/\b3e\b/.test(n) || n.indexOf('3enrollment') >= 0) return true;
    if (n.indexOf('internal') >= 0 || n.indexOf('insights portal') >= 0) return true;
    if (n.indexOf('clearsquare') >= 0 || n.indexOf('development') >= 0) return true;
    if (n.indexOf('employee') >= 0 || n.indexOf('3e team') >= 0) return true;
    return false;
  }

  function isInternalViewerEmail(email) {
    var e = trimStr(email).toLowerCase();
    if (!e) return false;
    if (isTestPortalViewerEmail(e)) return true;
    for (var s = 0; s < INTERNAL_EMAIL_SUFFIXES.length; s++) {
      if (e.endsWith(INTERNAL_EMAIL_SUFFIXES[s])) return true;
    }
    return false;
  }

  /** Internal = 3E staff workspaces or @3enrollment viewers; Client = client partitions (no 3E workspace). */
  function portalAudienceForRow(r) {
    if (isInternalWorkspaceName(r.partition)) return 'internal';
    if (isTestPortalViewerRow(r)) return 'internal';
    if (isInternalViewerEmail(r.email)) return 'internal';
    if (r.audience === 'internal') return 'internal';
    if (trimStr(r.partition)) return 'client';
    if (r.audience === 'client') return 'client';
    return r.audience || 'unknown';
  }

  /** Portal pills — Internal = internal portal login or internal workspace; Client = client portal activity only. */
  function rowMatchesAudienceTab(r, audience) {
    if (!audience || audience === 'all') return true;
    var loginAud = r.audience;
    if (audience === 'internal') {
      if (isInternalWorkspaceName(r.partition)) return true;
      if (isTestPortalViewerRow(r)) return true;
      if (loginAud === 'client') return false;
      if (loginAud === 'internal') return true;
      return false;
    }
    if (audience === 'client') {
      if (loginAud === 'internal') return false;
      if (isInternalWorkspaceName(r.partition)) return false;
      if (isTestPortalViewerRow(r)) return false;
      if (isInternalViewerEmail(r.email)) return false;
      if (loginAud === 'client') return true;
      var portalAud = r.portalAudience || portalAudienceForRow(r);
      return portalAud === 'client';
    }
    return true;
  }

  function audienceFromRow(row, fields) {
    var part = partitionFromRow(row, fields);
    if (isTestPortalPartition(part) || isInternalWorkspaceName(part)) return 'internal';
    var fromType = fields.userType ? classifyAudienceText(rowVal(row, fields.userType)) : '';
    if (fromType) return fromType;
    var fromPortal = fields.loginPortal ? classifyAudienceText(rowVal(row, fields.loginPortal)) : '';
    if (fromPortal) return fromPortal;
    var domainKey = fields.emailDomain;
    var domain = domainKey ? trimStr(rowVal(row, domainKey)).toLowerCase() : '';
    if (domain) {
      if (domain.indexOf('3enrollment') >= 0) return 'internal';
      if (domain === 'test.com' || domain.endsWith('.test.com')) return 'internal';
      return 'client';
    }
    var emailKey = fields.viewerEmail || fields.email;
    var email = emailKey ? trimStr(rowVal(row, emailKey)).toLowerCase() : '';
    if (!email) {
      email = viewerEmailFromRow(row, fields).toLowerCase();
    }
    if (!email) {
      var nameForEmail = viewerNameFromRow(row, fields).toLowerCase();
      if (nameForEmail.indexOf('@') >= 0) email = nameForEmail;
    }
    if (email) {
      if (isTestPortalViewerEmail(email)) return 'internal';
      for (var s = 0; s < INTERNAL_EMAIL_SUFFIXES.length; s++) {
        if (email.endsWith(INTERNAL_EMAIL_SUFFIXES[s])) return 'internal';
      }
      return 'client';
    }
    var userName = viewerNameFromRow(row, fields);
    if (isTestPortalViewerName(userName)) return 'internal';
    return 'unknown';
  }

  function firstNonemptyRowVal(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k) continue;
      var v = trimStr(rowVal(row, k));
      if (v) return v;
    }
    return '';
  }

  function viewerNameKeys(fields) {
    var keys = [];
    [fields.viewerName, fields.user].forEach(function (k) {
      if (k && keys.indexOf(k) < 0) keys.push(k);
    });
    FIELD_CANDIDATES.viewerName.forEach(function (c) {
      if (keys.indexOf(c) < 0) keys.push(c);
    });
    return keys;
  }

  function viewerEmailKeys(fields) {
    var keys = [];
    [fields.viewerEmail, fields.email].forEach(function (k) {
      if (k && keys.indexOf(k) < 0) keys.push(k);
    });
    FIELD_CANDIDATES.viewerEmail.forEach(function (c) {
      if (keys.indexOf(c) < 0) keys.push(c);
    });
    return keys;
  }

  function viewerNameFromRow(row, fields) {
    return firstNonemptyRowVal(row, viewerNameKeys(fields));
  }

  function viewerEmailFromRow(row, fields) {
    return firstNonemptyRowVal(row, viewerEmailKeys(fields));
  }

  function partitionKeys(fields) {
    var keys = [];
    if (fields.partition && keys.indexOf(fields.partition) < 0) keys.push(fields.partition);
    FIELD_CANDIDATES.partition.forEach(function (c) {
      if (keys.indexOf(c) < 0) keys.push(c);
    });
    return keys;
  }

  function partitionFromRow(row, fields) {
    return firstNonemptyRowVal(row, partitionKeys(fields));
  }

  function summarizePartitions(countsByPartition) {
    var names = Object.keys(countsByPartition || {});
    if (!names.length) return '—';
    names.sort(function (a, b) {
      var diff = (countsByPartition[b] || 0) - (countsByPartition[a] || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    return names[0];
  }

  function viewerDistinctKey(r) {
    var email = trimStr(r.email).toLowerCase();
    if (email) return 'e:' + email;
    var id = trimStr(r.userId);
    if (id) return 'id:' + id.toLowerCase();
    var user = trimStr(r.user);
    if (user) {
      var ul = user.toLowerCase();
      if (ul.indexOf('@') >= 0) return 'e:' + ul;
      return 'u:' + ul;
    }
    return '';
  }

  function viewerDisplayLabel(r) {
    var email = trimStr(r.email);
    var user = trimStr(r.user);
    var id = trimStr(r.userId);
    if (user && email && user.toLowerCase() !== email.toLowerCase()) {
      return user + ' · ' + email;
    }
    if (email) return email;
    if (user) return user;
    if (id) return 'User ID ' + id;
    return '';
  }

  function normalizedRows(rawRows, fields) {
    var pageKey = fields.page;
    var userIdKey = fields.userId;
    return (rawRows || []).filter(function (row) { return isPageViewEvent(row, fields); }).map(function (row, idx) {
      var when = parseWhenFromRow(row, fields);
      var page = pageKey ? trimStr(rowVal(row, pageKey)) : '';
      if (!page) {
        var pageAlt = inferFieldByPattern(row, [/page.*name/i, /^page$/i, /portal.*page/i, /dashboard/i]);
        if (pageAlt) page = trimStr(rowVal(row, pageAlt));
      }
      var user = viewerNameFromRow(row, fields);
      var email = viewerEmailFromRow(row, fields);
      var userId = userIdKey ? trimStr(rowVal(row, userIdKey)) : '';
      if (!email && user.indexOf('@') >= 0) {
        email = user;
        user = user.split('@')[0];
      }
      var norm = {
        id: idx,
        page: page,
        user: user,
        email: email,
        userId: userId,
        when: when,
        whenMs: when ? when.getTime() : 0,
        partition: partitionFromRow(row, fields),
        workspace: partitionFromRow(row, fields),
        audience: audienceFromRow(row, fields),
        raw: row
      };
      norm.viewerKey = viewerDistinctKey(norm);
      norm.viewerLabel = viewerDisplayLabel(norm);
      norm.portalAudience = portalAudienceForRow(norm);
      return norm;
    }).filter(function (r) {
      if (!r.page) return false;
      var join = global.OpsJoin || {};
      if (join.isIgnoredPartition && join.isIgnoredPartition(r.partition)) return false;
      return true;
    });
  }

  function resolvedRangeDays(days) {
    var n = Number(days);
    if (!n || n <= 0) return IPU_ALL_TIME_DAYS;
    return n;
  }

  /** Inclusive start date for a range. days <= 0 is Last 12 months. */
  function sqlDateCutoff(days) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (resolvedRangeDays(days) - 1));
    var month = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  }

  function rangeCutoffMs(filterBag) {
    var days = filterBag && filterBag.rangeDays != null ? filterBag.rangeDays : state.filters.rangeDays;
    days = resolvedRangeDays(days);
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime() - (days - 1) * 86400000;
  }

  function applyScopeFilters(rows, opts) {
    opts = opts || {};
    var bag = opts.filterBag || (opts.filterSource === 'draft' ? state.draft : state.filters);
    var cutoff = rangeCutoffMs(bag);
    var q = trimStr(bag.search).toLowerCase();
    var audience = opts.audience != null ? opts.audience : bag.audience;
    var partFilter = opts.partitions != null ? opts.partitions : bag.partitions;
    var pageFilter = opts.selectedPages != null ? opts.selectedPages : bag.selectedPages;
    return (rows || []).filter(function (r) {
      if (cutoff) {
        if (!r.whenMs) return false;
        if (r.whenMs < cutoff) return false;
      }
      if (!opts.skipAudience && !rowMatchesAudienceTab(r, audience)) return false;
      if (!opts.skipPartitions && partFilter && partFilter.length) {
        if (partFilter.indexOf(r.partition) < 0) return false;
      }
      if (!opts.skipPages && pageFilter && pageFilter.length) {
        if (pageFilter.indexOf(r.page) < 0) return false;
      }
      if (opts.skipSearch || !q) return true;
      var hay = (r.page + ' ' + r.viewerLabel + ' ' + r.user + ' ' + r.email + ' ' + r.userId + ' ' +
        r.partition + ' ' + r.workspace).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function filteredRows() {
    return applyScopeFilters(state.rows, { filterBag: state.filters });
  }

  function syncIpuSearchInput() {
    var searchEl = $('ipuSearch');
    if (searchEl) searchEl.value = state.draft.search || '';
  }

  function syncIpuDraftFromApplied() {
    state.draft = cloneIpuFilters(state.filters);
    syncIpuSearchInput();
  }

  function applyIpuFilters() {
    state.filters = cloneIpuFilters(state.draft);
    state.pageRecent = 0;
    state.pagePages = 0;
    state.pageUsers = 0;
    state.chartDetail = null;
    closeIpuFilterMenus();
    refreshUi();
  }

  function resetIpuFilters() {
    ipuMenuSearchQueries = {};
    state.draft = defaultIpuFilters();
    applyIpuFilters();
  }

  function audienceScopeCounts() {
    var scoped = applyScopeFilters(state.rows, {
      skipAudience: true,
      skipPartitions: true,
      skipPages: true,
      filterBag: state.draft
    });
    var out = { all: scoped.length, internal: 0, client: 0, unknown: 0 };
    scoped.forEach(function (r) {
      if (rowMatchesAudienceTab(r, 'internal')) out.internal += 1;
      else if (rowMatchesAudienceTab(r, 'client')) out.client += 1;
      else out.unknown += 1;
    });
    return out;
  }

  function partitionChoices() {
    var scoped = applyScopeFilters(state.rows, {
      skipPartitions: true,
      skipPages: true,
      filterBag: state.draft
    });
    var counts = {};
    scoped.forEach(function (r) {
      var p = trimStr(r.partition);
      if (!p) return;
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.keys(counts).sort(function (a, b) {
      var diff = (counts[b] || 0) - (counts[a] || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).map(function (name) {
      return { name: name, views: counts[name] };
    });
  }

  function pruneBagPartitions(bag) {
    if (!bag.partitions.length) return;
    var allowed = {};
    partitionChoices().forEach(function (c) { allowed[c.name] = true; });
    bag.partitions = bag.partitions.filter(function (p) { return allowed[p]; });
  }

  function prunePartitionSelection() {
    pruneBagPartitions(state.draft);
    pruneBagPartitions(state.filters);
  }

  function applyIpuMenuSearchFilter(menuEl) {
    if (!menuEl) return;
    var q = trimStr(ipuMenuSearchQueries[menuEl.id]).toLowerCase();
    menuEl.querySelectorAll('.multi-select-option').forEach(function (row) {
      var textEl = row.querySelector('span');
      var label = textEl ? trimStr(textEl.textContent).toLowerCase() : '';
      row.classList.toggle('is-hidden', q && label.indexOf(q) < 0);
    });
  }

  function appendIpuMenuSearchHead(menuEl, selectedCount, onClear) {
    if (window.OpsFilterMenu && window.OpsFilterMenu.mountPinnedHead) {
      return window.OpsFilterMenu.mountPinnedHead(menuEl, {
        placeholder: IPU_MENU_SEARCH_PLACEHOLDER,
        searchValue: ipuMenuSearchQueries[menuEl.id] || '',
        selectedCount: selectedCount,
        onSearchInput: function () {
          ipuMenuSearchQueries[menuEl.id] = this.value;
          applyIpuMenuSearchFilter(menuEl);
        },
        onClear: onClear
      });
    }
    return null;
  }

  function ipuScopeClusterEl() {
    return chapterRoot ? chapterRoot.querySelector('#ipuScopeFilterCluster') : null;
  }

  function ipuScopeMenuPairs() {
    return [
      { trigger: $('ipuAudienceTrigger'), menu: $('ipuAudienceMenu'), fieldSel: '.ipu-audience-field' },
      { trigger: $('ipuRangeTrigger'), menu: $('ipuRangeMenu'), fieldSel: '.ipu-range-field' },
      { trigger: $('ipuPartitionTrigger'), menu: $('ipuPartitionMenu'), fieldSel: '.ipu-partition-field' },
      { trigger: $('ipuPageTrigger'), menu: $('ipuPageMenu'), fieldSel: '.ipu-dashboard-field' }
    ];
  }

  function isIpuScopeFilterClusterOpen() {
    var cluster = ipuScopeClusterEl();
    return !!(cluster && cluster.classList.contains('is-linked-open'));
  }

  function ipuFilterMenuOpen() {
    return isIpuScopeFilterClusterOpen();
  }

  function setIpuScopeClusterOpen(open) {
    var cluster = ipuScopeClusterEl();
    if (cluster) cluster.classList.toggle('is-linked-open', open);
    var bar = chapterRoot && chapterRoot.querySelector('.ipu-filters-bar');
    if (bar) bar.classList.toggle('is-scope-filters-open', open);
  }

  /** Partner Data Health–style linked scope: all four filters expand together. */
  function setIpuScopeMenusOpen(open) {
    ipuScopeMenuPairs().forEach(function (p) {
      if (!p.menu || !p.trigger) return;
      p.menu.hidden = !open;
      p.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      var field = chapterRoot && chapterRoot.querySelector(p.fieldSel);
      if (field) field.classList.toggle('is-open', open);
    });
    setIpuScopeClusterOpen(open);
    if (open) renderOpenIpuMenus();
  }

  function renderOpenIpuMenus() {
    if (!isIpuScopeFilterClusterOpen()) return;
    renderAudienceMenu();
    renderRangeMenu();
    renderPartitionMenu();
    renderPageMenu();
  }

  function closeIpuFilterMenus() {
    setIpuScopeMenusOpen(false);
  }

  function toggleIpuFilterMenu(triggerEl) {
    if (!triggerEl) return;
    var pair = null;
    ipuScopeMenuPairs().forEach(function (p) {
      if (p.trigger === triggerEl) pair = p;
    });
    if (!pair || !pair.menu) return;
    if (isIpuScopeFilterClusterOpen()) {
      setIpuScopeMenusOpen(false);
      return;
    }
    setIpuScopeMenusOpen(true);
  }

  function audienceTriggerLabel(audience) {
    if (audience === 'internal') return 'Internal portal';
    if (audience === 'client') return 'Client portal';
    return 'All audiences';
  }

  function rangeTriggerLabel(days) {
    for (var i = 0; i < IPU_RANGE_OPTIONS.length; i++) {
      if (IPU_RANGE_OPTIONS[i].days === days) return IPU_RANGE_OPTIONS[i].label;
    }
    return days ? 'Last ' + days + ' days' : 'Last 12 months';
  }

  function formatIpuDateOnly(d) {
    if (!d) return '';
    try {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return String(d);
    }
  }

  /** Earliest/latest view dates inside Last 12 months, before portal/partition/dashboard filters. */
  function loadedPortalActivityDateSpan() {
    var cutoff = rangeCutoffMs({ rangeDays: 0 });
    var minMs = 0;
    var maxMs = 0;
    (state.rows || []).forEach(function (r) {
      if (!r.whenMs || r.whenMs < cutoff) return;
      if (!minMs || r.whenMs < minMs) minMs = r.whenMs;
      if (r.whenMs > maxMs) maxMs = r.whenMs;
    });
    return minMs && maxMs ? { minMs: minMs, maxMs: maxMs } : null;
  }

  function allTimeScopeHintText() {
    var span = loadedPortalActivityDateSpan();
    if (!span) return '—';
    var from = formatIpuDateOnly(new Date(span.minMs));
    var thru = formatIpuDateOnly(new Date(span.maxMs));
    return from === thru ? from : from + ' – ' + thru;
  }

  function updateRangeScopeHint() {
    var el = $('ipuRangeScopeHint');
    if (!el) return;
    if (state.draft.rangeDays !== 0) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = allTimeScopeHintText();
    el.hidden = false;
  }

  function updateAudienceTriggerLabel() {
    var label = $('ipuAudienceTriggerLabel');
    if (label) label.textContent = audienceTriggerLabel(state.draft.audience);
  }

  function updateRangeTriggerLabel() {
    var label = $('ipuRangeTriggerLabel');
    if (label) label.textContent = rangeTriggerLabel(state.draft.rangeDays);
    updateRangeScopeHint();
  }

  function renderAudienceMenu() {
    var menu = $('ipuAudienceMenu');
    if (!menu) return;
    var counts = audienceScopeCounts();
    menu.innerHTML = '';
    [
      { id: 'all', label: 'All audiences', n: counts.all },
      { id: 'internal', label: 'Internal', n: counts.internal },
      { id: 'client', label: 'Client', n: counts.client }
    ].forEach(function (opt) {
      var checked = state.draft.audience === opt.id;
      var lab = document.createElement('label');
      lab.className = 'multi-select-option';
      lab.innerHTML = '<input type="radio" name="ipu-audience-draft" data-ipu-audience="' + escapeHtml(opt.id) + '"' +
        (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(opt.label) + ' <span class="ipu-partition-count">(' +
        opt.n.toLocaleString('en-US') + ' views)</span></span>';
      menu.appendChild(lab);
    });
    updateAudienceTriggerLabel();
  }

  function renderRangeMenu() {
    var menu = $('ipuRangeMenu');
    if (!menu) return;
    menu.innerHTML = '';
    IPU_RANGE_OPTIONS.forEach(function (opt) {
      var checked = opt.days === state.draft.rangeDays;
      var lab = document.createElement('label');
      lab.className = 'multi-select-option' + (opt.days === 0 ? ' ipu-range-option-all-time' : '');
      var note = opt.days === 0
        ? '<span class="ipu-range-option-note">' + escapeHtml(allTimeScopeHintText()) + '</span>'
        : '';
      lab.innerHTML = '<input type="radio" name="ipu-range-draft" data-ipu-range="' + String(opt.days) + '"' +
        (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(opt.label) + note + '</span>';
      menu.appendChild(lab);
    });
    updateRangeTriggerLabel();
  }

  function updatePartitionTriggerLabel() {
    var label = $('ipuPartitionTriggerLabel');
    if (!label) return;
    var n = state.draft.partitions.length;
    var choices = partitionChoices();
    if (!choices.length) {
      label.textContent = 'No partitions';
      return;
    }
    if (!n) label.textContent = 'All partitions';
    else if (n === 1) label.textContent = state.draft.partitions[0];
    else if (n === choices.length) label.textContent = 'All partitions';
    else label.textContent = n + ' partitions';
  }

  function renderPartitionMenu() {
    var menu = $('ipuPartitionMenu');
    if (!menu) return;
    var choices = partitionChoices();
    menu.innerHTML = '';
    if (!choices.length) {
      menu.innerHTML = '<div class="multi-select-empty">No partitions in scope</div>';
      updatePartitionTriggerLabel();
      return;
    }
    var mount = appendIpuMenuSearchHead(menu, state.draft.partitions.length, function () {
      state.draft.partitions = [];
      ipuMenuSearchQueries[menu.id] = '';
      renderPartitionMenu();
      updatePartitionTriggerLabel();
      if (ipuFilterMenuOpen()) renderPageMenu();
    });
    var listEl = mount ? mount.optionsEl : menu;
    choices.forEach(function (c) {
      var checked = state.draft.partitions.indexOf(c.name) >= 0;
      var lab = document.createElement('label');
      lab.className = 'multi-select-option';
      lab.innerHTML = '<input type="checkbox" data-ipu-partition="' + escapeHtml(c.name) + '"' +
        (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(c.name) + ' <span class="ipu-partition-count">(' +
        c.views.toLocaleString('en-US') + ')</span></span>';
      listEl.appendChild(lab);
    });
    applyIpuMenuSearchFilter(menu);
    updatePartitionTriggerLabel();
  }

  function pageChoices() {
    var scoped = applyScopeFilters(state.rows, { skipPages: true, filterBag: state.draft });
    var counts = {};
    var viewers = {};
    scoped.forEach(function (r) {
      var p = trimStr(r.page);
      if (!p) return;
      counts[p] = (counts[p] || 0) + 1;
      var vk = r.viewerKey || viewerDistinctKey(r);
      if (vk) {
        if (!viewers[p]) viewers[p] = {};
        viewers[p][vk] = true;
      }
    });
    return Object.keys(counts).sort(function (a, b) {
      var diff = (counts[b] || 0) - (counts[a] || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).map(function (name) {
      return {
        name: name,
        views: counts[name],
        uniqueViewers: Object.keys(viewers[name] || {}).length
      };
    });
  }

  function pruneBagPages(bag) {
    if (!bag.selectedPages.length) return;
    var allowed = {};
    pageChoices().forEach(function (c) { allowed[c.name] = true; });
    bag.selectedPages = bag.selectedPages.filter(function (p) { return allowed[p]; });
  }

  function prunePageSelection() {
    pruneBagPages(state.draft);
    pruneBagPages(state.filters);
  }

  function updatePageTriggerLabel() {
    var label = $('ipuPageTriggerLabel');
    if (!label) return;
    var n = state.draft.selectedPages.length;
    var choices = pageChoices();
    if (!choices.length) {
      label.textContent = 'No dashboards';
      return;
    }
    if (!n) label.textContent = 'All dashboards';
    else if (n === 1) {
      var one = state.draft.selectedPages[0];
      label.textContent = one.length > 36 ? one.slice(0, 34) + '…' : one;
    } else if (n === choices.length) label.textContent = 'All dashboards';
    else label.textContent = n + ' dashboards';
  }

  function renderPageMenu() {
    var menu = $('ipuPageMenu');
    if (!menu) return;
    var choices = pageChoices();
    menu.innerHTML = '';
    if (!choices.length) {
      menu.innerHTML = '<div class="multi-select-empty">No dashboards in scope</div>';
      updatePageTriggerLabel();
      return;
    }
    var pageMount = appendIpuMenuSearchHead(menu, state.draft.selectedPages.length, function () {
      state.draft.selectedPages = [];
      ipuMenuSearchQueries[menu.id] = '';
      renderPageMenu();
      updatePageTriggerLabel();
    });
    var pageListEl = pageMount ? pageMount.optionsEl : menu;
    choices.forEach(function (c) {
      var checked = state.draft.selectedPages.indexOf(c.name) >= 0;
      var lab = document.createElement('label');
      lab.className = 'multi-select-option';
      lab.innerHTML = '<input type="checkbox" data-ipu-page="' + escapeHtml(c.name) + '"' +
        (checked ? ' checked' : '') + ' />' +
        '<span class="ipu-page-option-label">' + escapeHtml(c.name) +
        ' <span class="ipu-partition-count">(' + c.views.toLocaleString('en-US') + ' views · ' +
        c.uniqueViewers.toLocaleString('en-US') + ' viewers)</span></span>';
      pageListEl.appendChild(lab);
    });
    applyIpuMenuSearchFilter(menu);
    updatePageTriggerLabel();
  }

  function uniqueViewerStats(rows) {
    var keys = {};
    var byAudience = { internal: {}, client: {}, unknown: {} };
    var unattributedViews = 0;
    (rows || []).forEach(function (r) {
      var k = r.viewerKey || viewerDistinctKey(r);
      if (!k) {
        unattributedViews += 1;
        return;
      }
      keys[k] = true;
      var bucket = r.audience === 'internal' ? 'internal' : r.audience === 'client' ? 'client' : 'unknown';
      byAudience[bucket][k] = true;
    });
    return {
      total: Object.keys(keys).length,
      internal: Object.keys(byAudience.internal).length,
      client: Object.keys(byAudience.client).length,
      unknown: Object.keys(byAudience.unknown).length,
      unattributedViews: unattributedViews
    };
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((label || 'Request') + ' timed out after ' + ms + 'ms'));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function tablePayloadToObjects(payload) {
    var parsed = parseSqlResp(payload);
    if (!parsed.rows.length) return [];
    return parsed.rows.map(function (row) {
      var o = {};
      parsed.cols.forEach(function (f, i) {
        if (Array.isArray(row)) o[f] = row[i];
        else if (row && typeof row === 'object') o[f] = row[f] !== undefined ? row[f] : row[parsed.cols[i]];
      });
      return o;
    });
  }

  function normalizePayloadRows(payload) {
    if (!payload) return [];
    if (typeof payload === 'object' && !Array.isArray(payload)) {
      if (Array.isArray(payload.rows) || Array.isArray(payload.columns)) {
        var fromTable = tablePayloadToObjects(payload);
        if (fromTable.length) return fromTable;
      }
      if (Array.isArray(payload.data)) payload = payload.data;
      else if (Array.isArray(payload.result)) payload = payload.result;
    }
    if (Array.isArray(payload)) {
      if (!payload.length) return [];
      if (Array.isArray(payload[0])) {
        var cols = payload[0].map(columnName);
        return payload.slice(1).map(function (row) {
          var o = {};
          cols.forEach(function (c, i) { o[c] = row[i]; });
          return o;
        });
      }
      if (typeof payload[0] === 'object') return payload;
    }
    return [];
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

  function rowsFromSql(raw) {
    var parsed = parseSqlResp(raw);
    return parsed.rows.map(function (row) {
      var o = {};
      parsed.cols.forEach(function (f, i) {
        if (Array.isArray(row)) o[f] = row[i];
        else if (row && typeof row === 'object') o[f] = row[f] !== undefined ? row[f] : row[parsed.cols[i]];
      });
      return o;
    });
  }

  function fetchViaSql(sql) {
    return tryDatasetAliases(function (pathAlias) {
      var q = sql.replace(/\{alias\}/g, pathAlias);
      return withTimeout(
        domo.post('/sql/v1/' + pathAlias, q, { contentType: 'text/plain' }),
        QUERY_TIMEOUT,
        'pageViews SQL'
      ).then(function (raw) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw) &&
            (raw.error || raw.status === 'error') && !raw.columns && !raw.rows) {
          throw new Error(raw.error || raw.message || 'SQL error');
        }
        return rowsFromSql(raw);
      });
    });
  }

  function allowDatasetIdFallback(err) {
    return !!(global.OpsUi && OpsUi.shouldFallbackToDatasetId && OpsUi.shouldFallbackToDatasetId(err));
  }

  function tryDatasetAliases(fn) {
    var names = [DATASET.alias];
    function next(i) {
      if (i >= names.length) {
        return Promise.reject(new Error('Dataset alias `pageViews` is not mapped on this card.'));
      }
      return fn(names[i]).catch(function (err) {
        if (i === 0 && DATASET.id && allowDatasetIdFallback(err)) {
          names.push(DATASET.id);
          return next(i + 1).catch(function (idErr) {
            var prefer = global.OpsUi && OpsUi.errorAfterDatasetIdFallback;
            return Promise.reject(prefer ? prefer(err, idErr) : idErr);
          });
        }
        return Promise.reject(err);
      });
    }
    return next(0);
  }

  var DATA_API_ORDER_BY = [
    'act_date descending',
    'Act Date descending',
    'ACT_DATE descending',
    'created_at descending',
    'Created At descending'
  ];

  function fetchRowsViaDataApi(cap, withFields, orderBy, offset) {
    return tryDatasetAliases(function (alias) {
      var url = '/data/v1/' + encodeURIComponent(alias) + '?limit=' + cap;
      if (withFields) url += '&fields=' + encodeURIComponent(DATA_API_FIELDS.join(','));
      if (orderBy) url += '&orderby=' + encodeURIComponent(orderBy);
      if (offset) url += '&offset=' + String(offset);
      return withTimeout(domo.get(url), QUERY_TIMEOUT, 'pageViews Data API').then(normalizePayloadRows);
    });
  }

  function pageFirstStamp(rows) {
    var row = rows && rows[0];
    if (!row) return '';
    var keys = ['act_date', 'Act Date', 'ACT_DATE', 'page_name', 'Page Name', 'created_at', 'user_email', 'user_id'];
    var parts = keys.map(function (k) { return row[k] == null ? '' : String(row[k]); });
    var stamp = parts.join('|');
    return stamp.replace(/\|/g, '') ? stamp : '';
  }

  function rawRowWhenMs(row) {
    if (!row) return 0;
    var when = parseWhen(row.act_date);
    if (!when) when = parseWhen(row['Act Date']);
    if (!when) when = parseWhen(row.ACT_DATE);
    if (!when) when = parseWhen(row.created_at);
    if (!when) when = parseWhen(row['Created At']);
    return when ? when.getTime() : 0;
  }

  /** Newest-first page has crossed the Last 12 months cutoff. */
  function pagePassedAllTimeStart(rows) {
    var cutoff = rangeCutoffMs({ rangeDays: 0 });
    for (var i = 0; i < (rows || []).length; i++) {
      var ms = rawRowWhenMs(rows[i]);
      if (ms && ms < cutoff) return true;
    }
    return false;
  }

  /**
   * Newest PortalActivity rows, paged until the last 12 months are covered or ROW_CAP is hit.
   * No Data API filter: PortalActivity returns 400 when act_date is filtered on the request.
   * A later page that fails is dropped and the rows already loaded are kept.
   */
  function fetchOrderedPages(cap, withFields) {
    var pageSize = FETCH_PAGE;
    function finish(rows, capped) {
      if (capped) lastFetchCapped = true;
      return rows || [];
    }
    function pull(orderIdx, offset, acc, prevStamp) {
      if (acc.length >= cap) return Promise.resolve(finish(acc.slice(0, cap), true));
      var take = Math.min(pageSize, cap - acc.length);
      var orderBy = orderIdx < DATA_API_ORDER_BY.length ? DATA_API_ORDER_BY[orderIdx] : null;
      return fetchRowsViaDataApi(take, withFields, orderBy, offset).then(function (rows) {
        rows = rows || [];
        var stamp = pageFirstStamp(rows);
        if (offset && stamp && stamp === prevStamp) return finish(acc, true);
        var next = acc.concat(rows);
        if (orderBy && pagePassedAllTimeStart(rows)) return finish(next.slice(0, cap), false);
        if (next.length >= cap) return finish(next.slice(0, cap), true);
        if (rows.length < take) return finish(next, false);
        return pull(orderIdx, offset + rows.length, next, stamp);
      }).catch(function (err) {
        if (acc.length) return finish(acc, true);
        if (!orderBy) return Promise.reject(err);
        console.warn('[pageViews] Data API order failed:', orderBy, errMessage(err));
        return pull(orderIdx + 1, 0, [], '');
      });
    }
    return pull(0, 0, [], '');
  }

  function fetchRows(limit) {
    var cap = limit || ROW_CAP;
    lastFetchCapped = false;
    /* Newest rows first. Last 12 months then keeps that window in the browser. */
    return fetchOrderedPages(cap, false).catch(function (err) {
      console.warn('[pageViews] Data API (all columns) failed:', errMessage(err));
      return fetchOrderedPages(cap, true);
    }).catch(function (err) {
      console.warn('[pageViews] Data API (fields list) failed:', errMessage(err));
      var sqlCap = FETCH_PAGE;
      var orderSql = SQL_SELECT + ' WHERE page_name IS NOT NULL ORDER BY act_date DESC LIMIT ' + sqlCap;
      var plainSql = SQL_SELECT + ' LIMIT ' + sqlCap;
      var starSql = 'SELECT * FROM {alias} LIMIT ' + sqlCap;
      return fetchViaSql(orderSql).catch(function () {
        return fetchViaSql(plainSql);
      }).catch(function () {
        return fetchViaSql(starSql);
      }).then(function (rows) {
        rows = rows || [];
        if (rows.length >= sqlCap) lastFetchCapped = true;
        return rows;
      });
    });
  }

  function probeDatasetMapping() {
    return fetchRowsViaDataApi(1, false).then(function () {
      state.mappingOk = true;
    }).catch(function (err) {
      state.mappingOk = false;
      return Promise.reject(err);
    });
  }

  function errMessage(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (global.OpsUi && OpsUi.isDatasetAccessError && OpsUi.isDatasetAccessError(err)) {
      var detail = OpsUi.domoErrorText ? OpsUi.domoErrorText(err) : (err.message || '');
      return 'Domo could not open PortalActivity just now' + (detail ? ' (' + detail + ')' : '') +
        '. Open Insights Activity again — this usually clears after a chapter switch.';
    }
    if (global.OpsUi && OpsUi.isMissingAliasError && OpsUi.isMissingAliasError(err)) return SETUP_MSG;
    if ((err.status === 400 || err.statusCode === 400) && !state.mappingOk) {
      return SETUP_MSG;
    }
    return err.message || err.statusReason || err.statusText || String(err);
  }

  function setLoading(active, label) {
    state.loading = !!active;
    var sk = $('ipuSkeleton');
    if (sk) sk.hidden = !active;
    if (active && label) hostStatus(label, 'loading');
  }

  function aggregateByPage(rows) {
    ensureRowDwell(rows);
    var map = {};
    rows.forEach(function (r) {
      var key = r.page || '(unknown page)';
      if (!map[key]) map[key] = { page: key, views: 0, users: {}, estimatedDwellMs: 0 };
      map[key].views += 1;
      map[key].estimatedDwellMs += r.estimatedDwellMs || 0;
      var vk = r.viewerKey || viewerDistinctKey(r);
      if (vk) map[key].users[vk] = true;
    });
    return Object.keys(map).map(function (k) {
      var item = map[k];
      item.uniqueUsers = Object.keys(item.users).length;
      item.estimatedDwell = formatEstimatedDwell(item.estimatedDwellMs);
      delete item.users;
      return item;
    });
  }

  function aggregateByUser(rows, dwellScopeRows) {
    ensureRowDwell(rows, dwellScopeRows);
    var map = {};
    rows.forEach(function (r) {
      var key = r.viewerKey || viewerDistinctKey(r);
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          user: r.viewerLabel || viewerDisplayLabel(r) || r.user || r.email,
          email: r.email,
          audience: r.audience,
          views: 0,
          estimatedDwellMs: 0,
          pages: {},
          partitions: {},
          lastWhenMs: 0
        };
      }
      map[key].views += 1;
      map[key].estimatedDwellMs += r.estimatedDwellMs || 0;
      if (r.page) map[key].pages[r.page] = true;
      if (r.partition) {
        map[key].partitions[r.partition] = (map[key].partitions[r.partition] || 0) + 1;
      }
      if ((r.whenMs || 0) > map[key].lastWhenMs) map[key].lastWhenMs = r.whenMs || 0;
    });
    return Object.keys(map).map(function (k) {
      var item = map[k];
      item.viewerKey = k;
      item.uniquePages = Object.keys(item.pages).length;
      item.partition = summarizePartitions(item.partitions);
      item.lastView = item.lastWhenMs ? formatWhen(new Date(item.lastWhenMs)) : '—';
      item.estimatedDwell = formatEstimatedDwell(item.estimatedDwellMs);
      delete item.pages;
      delete item.partitions;
      return item;
    });
  }

  function drillKeyAttr(val) {
    return encodeURIComponent(trimStr(val));
  }

  function drillKeyFromAttr(val) {
    try {
      return decodeURIComponent(val || '');
    } catch (e) {
      return val || '';
    }
  }

  function sortRows(list, spec) {
    var key = spec.key;
    var dir = spec.dir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (key === 'when') {
        av = a.whenMs || 0;
        bv = b.whenMs || 0;
      } else if (key === 'lastWhenMs') {
        av = a.lastWhenMs || 0;
        bv = b.lastWhenMs || 0;
      }
      if (key === 'viewerLabel') {
        av = trimStr(a.viewerLabel || viewerDisplayLabel(a) || a.user).toLowerCase();
        bv = trimStr(b.viewerLabel || viewerDisplayLabel(b) || b.user).toLowerCase();
      }
      if (key === 'partition') {
        av = trimStr(a.partition || a.workspace).toLowerCase();
        bv = trimStr(b.partition || b.workspace).toLowerCase();
      }
      if (typeof av === 'string' && key !== 'viewerLabel' && key !== 'partition') av = av.toLowerCase();
      if (typeof bv === 'string' && key !== 'viewerLabel' && key !== 'partition') bv = bv.toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function ipuSortSpec(table) {
    if (table === 'pages') return state.sortPages;
    if (table === 'users') return state.sortUsers;
    return state.sortRecent;
  }

  function toggleIpuTableSort(table, key) {
    var spec = ipuSortSpec(table);
    if (spec.key === key) spec.dir = spec.dir === 'asc' ? 'desc' : 'asc';
    else {
      spec.key = key;
      var stringKeys = { page: true, user: true, partition: true, viewerLabel: true };
      spec.dir = stringKeys[key] ? 'asc' : 'desc';
    }
    if (table === 'pages') state.pagePages = 0;
    else if (table === 'users') state.pageUsers = 0;
    else state.pageRecent = 0;
    refreshUi();
  }

  function renderIpuSortableHeaders() {
    if (!chapterRoot) return;
    chapterRoot.querySelectorAll('.ipu-sortable[data-ipu-sort-table]').forEach(function (th) {
      var table = th.getAttribute('data-ipu-sort-table');
      var key = th.getAttribute('data-ipu-sort-key');
      var spec = ipuSortSpec(table);
      var active = spec.key === key;
      th.classList.toggle('is-sorted', active);
      th.setAttribute('aria-sort', active ? (spec.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function csvCell(val) {
    var s = val == null ? '' : String(val);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadIpuCsv(filename, csvText) {
    try {
      var blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
      downloadIpuBlob(blob, filename);
    } catch (e) {
      hostStatus('Could not download CSV.', 'error');
    }
  }

  function downloadIpuBlob(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      hostStatus('Could not download file.', 'error');
    }
  }

  function ipuExportFileStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function ipuExportTimestamp() {
    return new Date().toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function ipuFilterMetaLines(rows) {
    var f = state.filters;
    var audLabel = f.audience === 'client' ? 'Client portal' : f.audience === 'internal' ? 'Internal portal' : 'All audiences';
    var rangeLabel = rangeTriggerLabel(f.rangeDays);
    if (!f.rangeDays) {
      var spanHint = allTimeScopeHintText();
      if (spanHint && spanHint !== '—') rangeLabel += ' (' + spanHint + ')';
    }
    var partLabel = f.partitions.length
      ? f.partitions.length + ' partition' + (f.partitions.length === 1 ? '' : 's')
      : 'All partitions';
    var dashLabel = f.selectedPages.length
      ? (f.selectedPages.length === 1 ? f.selectedPages[0] : f.selectedPages.length + ' dashboards')
      : 'All dashboards';
    var search = trimStr(f.search);
    var lines = [
      'Filters: ' + audLabel + ' · ' + rangeLabel + ' · ' + partLabel + ' · ' + dashLabel,
      'Exported ' + ipuExportTimestamp(),
      (rows || []).length.toLocaleString('en-US') + ' page views in this export'
    ];
    if (search) lines.push('Search: ' + search);
    if (state.loadCapped) {
      lines.push('Note: card loaded newest ' + (state.rawRowCount || ROW_CAP).toLocaleString('en-US') +
        ' PortalActivity rows from the last 12 months; older events in that window may be missing.');
    }
    lines.push(IPU_DWELL_HELP);
    return lines;
  }

  function ipuXlArgb(hex) {
    return String(hex || '').replace('#', '').toUpperCase();
  }

  function ipuSheetTitleBlock(ws, title, subtitle, colCount) {
    colCount = Math.max(1, colCount || 1);
    ws.mergeCells(1, 1, 1, colCount);
    var titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: ipuXlArgb('#161616') } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ipuXlArgb('#FFD100') } };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, colCount);
    var subCell = ws.getCell(2, 1);
    subCell.value = subtitle;
    subCell.font = { name: 'Calibri', size: 10, color: { argb: ipuXlArgb('#56565A') } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ipuXlArgb('#FAFAF8') } };
    ws.getRow(2).height = subtitle.length > 80 ? 36 : 22;
  }

  function ipuWriteTableHeader(ws, rowNum, headers) {
    var row = ws.getRow(rowNum);
    row.height = 22;
    headers.forEach(function (label, i) {
      var cell = row.getCell(i + 1);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ipuXlArgb('#76B8B1') } };
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: ipuXlArgb('#FFD100') } }
      };
    });
  }

  function ipuWriteTableRows(ws, startRow, rows, colAlignments) {
    (rows || []).forEach(function (cells, idx) {
      var row = ws.getRow(startRow + idx);
      row.height = 20;
      var alt = idx % 2 === 1;
      cells.forEach(function (val, i) {
        var cell = row.getCell(i + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 11, color: { argb: ipuXlArgb('#161616') } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: alt ? ipuXlArgb('#F4F3EF') : 'FFFFFFFF' }
        };
        var align = colAlignments && colAlignments[i] ? colAlignments[i] : (i === 0 ? 'left' : 'right');
        cell.alignment = { vertical: 'middle', horizontal: align };
      });
    });
  }

  function ipuAddMetricSheet(wb, sheetName, tabColor, sectionTitle, headers, bodyRows, colWidths, colAlignments, scopeRows) {
    var ws = wb.addWorksheet(sheetName.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      properties: { tabColor: { argb: ipuXlArgb(tabColor) } }
    });
    colWidths.forEach(function (w, i) {
      ws.getColumn(i + 1).width = w;
    });
    ipuSheetTitleBlock(ws, 'Insights Activity — ' + sectionTitle, ipuFilterMetaLines(scopeRows).join('  ·  '), headers.length);
    ipuWriteTableHeader(ws, 4, headers);
    ipuWriteTableRows(ws, 5, bodyRows, colAlignments);
    return ws;
  }

  function buildIpuExportWorkbook(rows) {
    ensureRowDwell(rows);
    var OER = global.OpsExportReport;
    var wb = OER ? OER.createWorkbook('3E Operations') : new ExcelJS.Workbook();
    if (!OER) {
      wb.creator = '3E Operations';
      wb.created = new Date();
      wb.modified = new Date();
    }

    var dashN = {};
    rows.forEach(function (r) { if (r.page) dashN[r.page] = true; });
    var summaryPairs = [
      ['Page views', rows.length],
      ['Unique viewers', countUniqueViewers(rows)],
      ['Dashboards', Object.keys(dashN).length],
      ['Est. time viewed', formatEstimatedDwell(sumEstimatedDwell(rows))]
    ];

    var pages = sortRows(aggregateByPage(rows), { key: 'views', dir: 'desc' });
    var pageRows = pages.map(function (p) {
      return [p.page, p.views, p.uniqueUsers, p.estimatedDwell];
    });
    var users = sortRows(aggregateByUser(rows, rows), { key: 'views', dir: 'desc' });
    var userRows = users.map(function (u) {
      return [u.user, u.partition, u.views, u.uniquePages, u.estimatedDwell, u.lastView];
    });
    var days = sortedDayKeys(rows);
    var dailyViews = days.map(function (d) {
      var n = 0;
      rows.forEach(function (r) {
        if (r.whenMs && formatDayKey(r.when) === d) n += 1;
      });
      return [formatChartTooltipDate(d), n];
    });
    var dailyViewers = days.map(function (d) {
      return [formatChartTooltipDate(d), uniqueViewersForDay(rows, d, null)];
    });
    var mix = audienceMixForRows(rows);
    var audRows = mix.labels.map(function (label, i) {
      var views = mix.viewCounts[i] || 0;
      var viewers = mix.viewerCounts[i] || 0;
      var pct = rows.length ? Math.round((views / rows.length) * 1000) / 10 : 0;
      return [label, views, viewers, pct + '%'];
    });
    var parts = topPartitionRank(rows, 500);
    var partRows = parts.map(function (p) {
      return [p.name, p.views];
    });
    var activity = sortRows(filterRecentActivityRows(rows), state.sortRecent);
    var actRows = activity.map(function (r) {
      return [
        r.page || '',
        r.viewerLabel || viewerDisplayLabel(r) || r.user || '',
        r.email || '',
        r.when ? formatWhen(r.when) : '',
        Math.round((r.estimatedDwellMs || 0) / 1000),
        r.partition || r.workspace || ''
      ];
    });
    var exportSubtitle = ipuFilterMetaLines(rows).join('  ·  ');

    if (OER) {
      OER.addConsolidatedSheet(wb, {
        name: 'All Together',
        docTitle: 'Insights Activity',
        subtitle: exportSubtitle,
        tabColor: OER.GOLD,
        blocks: [
          {
            title: 'Summary metrics',
            headers: ['Metric', 'Value'],
            rows: summaryPairs,
            colAlign: ['left', 'right'],
            colWidths: [28, 22]
          },
          {
            title: 'Top dashboards',
            headers: ['Dashboard', 'Views', 'Viewers', 'Est. time'],
            rows: pageRows,
            colAlign: ['left', 'right', 'right', 'right'],
            colWidths: [44, 12, 12, 14]
          },
          {
            title: 'Top viewers',
            headers: ['Viewer', 'Partition', 'Views', 'Dashboards', 'Est. time', 'Last view'],
            rows: userRows,
            colAlign: ['left', 'left', 'right', 'right', 'right', 'left'],
            colWidths: [28, 22, 10, 12, 14, 22]
          },
          {
            title: 'Views over time',
            headers: ['Date', 'Page views'],
            rows: dailyViews,
            colAlign: ['left', 'right'],
            colWidths: [16, 14]
          },
          {
            title: 'Unique viewers over time',
            headers: ['Date', 'Unique viewers'],
            rows: dailyViewers,
            colAlign: ['left', 'right'],
            colWidths: [16, 14]
          },
          {
            title: 'Audience mix',
            headers: ['Audience', 'Page views', 'Viewers', '% of views'],
            rows: audRows,
            colAlign: ['left', 'right', 'right', 'right'],
            colWidths: [16, 14, 12, 12]
          },
          {
            title: 'Top partitions',
            headers: ['Partition', 'Page views'],
            rows: partRows,
            colAlign: ['left', 'right'],
            colWidths: [36, 14]
          },
          {
            title: 'Activity log',
            headers: ['Dashboard', 'Viewer', 'Email', 'When', 'Est dwell (sec)', 'Partition'],
            rows: actRows,
            colAlign: ['left', 'left', 'left', 'left', 'right', 'left'],
            colWidths: [36, 22, 28, 22, 14, 22]
          }
        ]
      });
    }

    var summaryWs = wb.addWorksheet('Summary', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      properties: { tabColor: { argb: ipuXlArgb('#FFD100') } }
    });
    summaryWs.getColumn(1).width = 28;
    summaryWs.getColumn(2).width = 22;
    ipuSheetTitleBlock(summaryWs, 'Insights Activity', exportSubtitle, 2);
    ipuWriteTableHeader(summaryWs, 4, ['Metric', 'Value']);
    ipuWriteTableRows(summaryWs, 5, summaryPairs, ['left', 'right']);

    ipuAddMetricSheet(wb, 'Top Dashboards', '#76B8B1', 'Top Dashboards',
      ['Dashboard', 'Views', 'Viewers', 'Est. time'], pageRows, [44, 12, 12, 14],
      ['left', 'right', 'right', 'right'], rows);

    ipuAddMetricSheet(wb, 'Top Viewers', '#76B8B1', 'Top Viewers',
      ['Viewer', 'Partition', 'Views', 'Dashboards', 'Est. time', 'Last view'],
      userRows, [28, 22, 10, 12, 14, 22], ['left', 'left', 'right', 'right', 'right', 'left'], rows);

    ipuAddMetricSheet(wb, 'Views Over Time', '#FFD100', 'Views Over Time',
      ['Date', 'Page views'], dailyViews, [16, 14], ['left', 'right'], rows);

    ipuAddMetricSheet(wb, 'Unique Viewers', '#FFD100', 'Unique Viewers Over Time',
      ['Date', 'Unique viewers'], dailyViewers, [16, 14], ['left', 'right'], rows);

    ipuAddMetricSheet(wb, 'Audience Mix', '#76B8B1', 'Audience Mix',
      ['Audience', 'Page views', 'Viewers', '% of views'], audRows, [16, 14, 12, 12],
      ['left', 'right', 'right', 'right'], rows);

    ipuAddMetricSheet(wb, 'Top Partitions', '#FFD100', 'Top Partitions',
      ['Partition', 'Page views'], partRows, [36, 14], ['left', 'right'], rows);

    ipuAddMetricSheet(wb, 'Activity Log', '#161616', 'Recent Activity (full log)',
      ['Dashboard', 'Viewer', 'Email', 'When', 'Est dwell (sec)', 'Partition'],
      actRows, [36, 22, 28, 22, 14, 22],
      ['left', 'left', 'left', 'left', 'right', 'left'], rows);

    return wb.xlsx.writeBuffer();
  }

  function ipuExportSpreadsheetStyles() {
    return [
      'body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #1a1a1a; }',
      'table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }',
      'td, th { border: 1px solid #d8dde3; padding: 6px 10px; vertical-align: top; }',
      '.cover-title { font-size: 18pt; font-weight: 700; padding: 0 0 4px; border: none; }',
      '.section-title td { background: #ffd100; font-weight: 700; text-transform: uppercase; }',
      '.table-head th { background: #76b8b1; font-weight: 700; }',
      '.num { text-align: right; }'
    ].join('\n');
  }

  function ipuExportHtmlTable(headHtml, bodyHtml) {
    return '<table cellspacing="0" cellpadding="0">' + headHtml + bodyHtml + '</table>';
  }

  function exportIpuMetricsHtmlFallback(rows) {
    ensureRowDwell(rows);
    var sections = [];
    function section(title, headers, bodyRows, numClass) {
      var head = '<tr class="table-head">' + headers.map(function (h) {
        return '<th>' + escapeHtml(h) + '</th>';
      }).join('') + '</tr>';
      var body = bodyRows.map(function (cells) {
        return '<tr>' + cells.map(function (c, i) {
          var cls = numClass && numClass[i] ? ' class="num"' : '';
          return '<td' + cls + '>' + escapeHtml(String(c == null ? '' : c)) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      sections.push('<table><tr class="section-title"><td colspan="' + headers.length + '">' +
        escapeHtml(title) + '</td></tr></table>' + ipuExportHtmlTable(head, body));
    }
    var dashN = {};
    rows.forEach(function (r) { if (r.page) dashN[r.page] = true; });
    section('Summary', ['Metric', 'Value'], [
      ['Page views', rows.length],
      ['Unique viewers', countUniqueViewers(rows)],
      ['Dashboards', Object.keys(dashN).length],
      ['Est. time viewed', formatEstimatedDwell(sumEstimatedDwell(rows))]
    ], [false, true]);
    section('Top Dashboards', ['Dashboard', 'Views', 'Viewers', 'Est. time'],
      sortRows(aggregateByPage(rows), { key: 'views', dir: 'desc' }).map(function (p) {
        return [p.page, p.views, p.uniqueUsers, p.estimatedDwell];
      }), [false, true, true, true]);
    section('Top Viewers', ['Viewer', 'Partition', 'Views', 'Dashboards', 'Est. time', 'Last view'],
      sortRows(aggregateByUser(rows, rows), { key: 'views', dir: 'desc' }).map(function (u) {
        return [u.user, u.partition, u.views, u.uniquePages, u.estimatedDwell, u.lastView];
      }), [false, false, true, true, true, false]);
    var days = sortedDayKeys(rows);
    section('Views Over Time', ['Date', 'Page views'], days.map(function (d) {
      var n = 0;
      rows.forEach(function (r) {
        if (r.whenMs && formatDayKey(r.when) === d) n += 1;
      });
      return [formatChartTooltipDate(d), n];
    }), [false, true]);
    section('Activity Log', ['Dashboard', 'Viewer', 'Email', 'When', 'Est dwell (sec)', 'Partition'],
      sortRows(filterRecentActivityRows(rows), state.sortRecent).map(function (r) {
        return [
          r.page || '',
          r.viewerLabel || viewerDisplayLabel(r) || r.user || '',
          r.email || '',
          r.when ? formatWhen(r.when) : '',
          Math.round((r.estimatedDwellMs || 0) / 1000),
          r.partition || r.workspace || ''
        ];
      }), [false, false, false, false, true, false]);
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      ipuExportSpreadsheetStyles() + '</style></head><body>' +
      '<table><tr><td class="cover-title" colspan="6">Insights Activity Export</td></tr>' +
      '<tr><td colspan="6">' + escapeHtml(ipuFilterMetaLines(rows).join(' · ')) + '</td></tr></table>' +
      sections.join('') + '</body></html>';
    downloadIpuBlob(new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
      'insights-activity-report-' + ipuExportFileStamp() + '.xls');
    hostStatus('Exported styled spreadsheet (Excel-compatible).');
  }

  function exportIpuMetricsWorkbook() {
    stampDwellBasis();
    var rows = filteredRows();
    if (!rows.length) {
      hostStatus('No rows to export for the current filters.', 'error');
      return;
    }
    function fallback(err) {
      if (err) console.warn('[Insights Activity] Excel export failed, using HTML fallback:', err);
      exportIpuMetricsHtmlFallback(rows);
    }
    if (typeof ExcelJS === 'undefined') {
      fallback();
      return;
    }
    try {
      buildIpuExportWorkbook(rows).then(function (buffer) {
        downloadIpuBlob(
          new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          'insights-activity-report-' + ipuExportFileStamp() + '.xlsx'
        );
        hostStatus('Exported Insights Activity report (' + rows.length.toLocaleString('en-US') + ' page views).');
      }).catch(fallback);
    } catch (err) {
      fallback(err);
    }
  }

  function exportActivityCsv() {
    stampDwellBasis();
    var scoped = filterRecentActivityRows(filteredRows());
    if (!scoped.length) {
      hostStatus('No rows to export for the current filters.', 'error');
      return;
    }
    var sorted = sortRows(scoped, state.sortRecent);
    var lines = [['Dashboard', 'Viewer', 'Email', 'When', 'Est dwell (seconds)', 'Partition'].map(csvCell).join(',')];
    sorted.forEach(function (r) {
      lines.push([
        r.page || '',
        r.viewerLabel || viewerDisplayLabel(r) || r.user || '',
        r.email || '',
        r.when ? formatWhen(r.when) : '',
        String(Math.round((r.estimatedDwellMs || 0) / 1000)),
        r.partition || r.workspace || ''
      ].map(csvCell).join(','));
    });
    var stamp = new Date().toISOString().slice(0, 10);
    downloadIpuCsv('insights-activity-' + stamp + '.csv', lines.join('\r\n'));
    hostStatus('Exported ' + sorted.length.toLocaleString('en-US') + ' rows.');
  }

  function summarySignature() {
    return String(state.filters.rangeDays || 0);
  }

  function dateOnlySummaryActive() {
    var f = state.filters;
    if (!state.loadCapped || !state.ready) return false;
    if (f.audience !== 'all') return false;
    if (f.partitions && f.partitions.length) return false;
    if (f.selectedPages && f.selectedPages.length) return false;
    if (trimStr(f.search)) return false;
    return true;
  }

  function activeScopeSummary() {
    if (!dateOnlySummaryActive()) return null;
    var summary = state.scopeSummary;
    if (!summary || summary.sig !== summarySignature()) return null;
    return summary;
  }

  function usageSqlWhere() {
    var parts = [
      'page_name IS NOT NULL',
      "(workspace_name IS NULL OR LOWER(workspace_name) NOT LIKE 'z_%')"
    ];
    parts.push("act_date >= '" + sqlDateCutoff(state.filters.rangeDays) + "'");
    return ' WHERE ' + parts.join(' AND ');
  }

  function sqlMetric(row, names) {
    var direct = sqlField(row, names);
    if (direct !== '' && direct != null) {
      var n = Number(String(direct).replace(/,/g, ''));
      if (isFinite(n)) return n;
    }
    var keys = Object.keys(row || {});
    var i;
    for (i = 0; i < keys.length; i++) {
      var key = String(keys[i]).toUpperCase();
      if (key.indexOf('COUNT') < 0 && key !== 'VIEWS' && key !== 'CNT' && key !== 'N') continue;
      var parsed = Number(String(row[keys[i]] == null ? '' : row[keys[i]]).replace(/,/g, ''));
      if (isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function sqlField(row, names) {
    if (!row) return '';
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] != null && row[names[i]] !== '') return row[names[i]];
    }
    var want = {};
    names.forEach(function (n) { want[String(n).toUpperCase()] = true; });
    var keys = Object.keys(row);
    for (var k = 0; k < keys.length; k++) {
      if (want[String(keys[k]).toUpperCase()]) return row[keys[k]];
    }
    return '';
  }

  function ensureScopeSummary() {
    if (!dateOnlySummaryActive()) {
      state.scopeSummary = null;
      return;
    }
    var sig = summarySignature();
    if (state.scopeSummary && state.scopeSummary.sig === sig) return;
    if (state.scopeSummaryLoading === sig) return;
    state.scopeSummaryLoading = sig;
    var where = usageSqlWhere();
    var totalsSql = 'SELECT COUNT(*) AS VIEWS, COUNT(DISTINCT COALESCE(created_by_email, user_email, created_by_name, user_name)) AS VIEWERS, COUNT(DISTINCT page_name) AS DASHBOARDS FROM {alias}' + where;
    /* No ORDER BY COUNT(*) — Domo SQL rejects that and the ranking then fell back to the loaded row cap. */
    var pagesSql = 'SELECT page_name AS PAGE, COUNT(*) AS VIEWS, COUNT(DISTINCT COALESCE(created_by_email, user_email, created_by_name, user_name)) AS VIEWERS FROM {alias}' + where + ' GROUP BY page_name';
    var pagesSqlPlain = 'SELECT page_name AS PAGE, COUNT(1) AS VIEWS FROM {alias}' + where + ' GROUP BY page_name';
    var pagesSqlOrdinal = 'SELECT page_name AS PAGE, COUNT(1) AS VIEWS FROM {alias}' + where + ' GROUP BY 1';
    var daysSql = 'SELECT act_date AS DAY, COUNT(*) AS VIEWS FROM {alias}' + where + ' GROUP BY act_date';
    function fetchPageRanks() {
      return fetchViaSql(pagesSql).catch(function () {
        return fetchViaSql(pagesSqlPlain);
      }).catch(function () {
        return fetchViaSql(pagesSqlOrdinal);
      }).catch(function () { return []; });
    }
    Promise.all([
      fetchViaSql(totalsSql).catch(function () { return []; }),
      fetchPageRanks(),
      fetchViaSql(daysSql).catch(function () { return []; })
    ]).then(function (parts) {
      if (state.scopeSummaryLoading !== sig) return;
      state.scopeSummaryLoading = '';
      var totals = parts[0] && parts[0][0];
      var views = sqlMetric(totals, ['VIEWS', 'CNT', 'COUNT(*)', 'COUNT(1)']);
      if (!totals || !isFinite(views)) {
        state.scopeSummary = null;
        return;
      }
      state.scopeSummary = {
        sig: sig,
        views: views,
        viewers: sqlMetric(totals, ['VIEWERS']) || 0,
        dashboards: sqlMetric(totals, ['DASHBOARDS']) || 0,
        pages: (parts[1] || []).map(function (row) {
          var viewersRaw = sqlField(row, ['VIEWERS']);
          var viewers = viewersRaw === '' || viewersRaw == null ? null : Number(viewersRaw);
          return {
            page: trimStr(sqlField(row, ['PAGE', 'page_name', 'Page Name'])) || '(unknown page)',
            views: sqlMetric(row, ['VIEWS', 'CNT', 'COUNT(*)', 'COUNT(1)']),
            uniqueUsers: viewers != null && isFinite(viewers) ? viewers : null
          };
        }).filter(function (row) { return row.views > 0; }),
        days: (parts[2] || []).map(function (row) {
          var when = parseWhen(sqlField(row, ['DAY', 'act_date']));
          return {
            key: when ? formatDayKey(when) : trimStr(sqlField(row, ['DAY', 'act_date'])).slice(0, 10),
            views: sqlMetric(row, ['VIEWS', 'CNT', 'COUNT(*)', 'COUNT(1)'])
          };
        }).filter(function (row) { return row.key; })
      };
      if (tabActive) refreshUi();
    }).catch(function () {
      if (state.scopeSummaryLoading === sig) state.scopeSummaryLoading = '';
    });
  }

  function renderDataCapNotice() {
    var el = $('ipuDataCapNotice');
    if (!el) return;
    if (state.loadCapped) {
      el.hidden = false;
      var summary = activeScopeSummary();
      var loadedN = (state.rawRowCount || ROW_CAP).toLocaleString('en-US');
      el.textContent = summary
        ? ('Activity log shows the newest ' + loadedN +
          ' rows. Headline totals and dashboard rankings are counted across this date range (' +
          summary.views.toLocaleString('en-US') + ' views). Estimated time still uses the loaded rows.')
        : ('Showing the newest ' + loadedN +
          ' PortalActivity rows from the last 12 months. Older events in that window may be missing.');
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function paginate(list, page) {
    var start = page * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }

  function renderPager(prefix, page, total) {
    var pager = $(prefix + 'Pager');
    if (!pager) return;
    pager.hidden = total <= PAGE_SIZE;
    var meta = pager.querySelector('.pager-meta');
    if (meta) {
      var from = total ? page * PAGE_SIZE + 1 : 0;
      var to = Math.min(total, (page + 1) * PAGE_SIZE);
      meta.textContent = from + '–' + to + ' of ' + total.toLocaleString('en-US');
    }
  }

  function chartColors() {
    var styles = getComputedStyle(document.documentElement);
    return {
      gold: styles.getPropertyValue('--brand-gold').trim() || '#ffd100',
      teal: styles.getPropertyValue('--brand-teal').trim() || '#76b8b1',
      muted: styles.getPropertyValue('--text-muted').trim() || '#6b7280',
      grid: styles.getPropertyValue('--border').trim() || 'rgba(15,23,42,0.08)'
    };
  }

  /** When 2+ partitions are selected, charts split series by partition. */
  function activePartitionSeries() {
    if (!state.filters.partitions || state.filters.partitions.length <= 1) return null;
    return state.filters.partitions.slice().sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function partitionChartPalette(count) {
    var colors = chartColors();
    var base = [
      colors.teal,
      colors.gold,
      '#5b8def',
      '#c77dff',
      '#f4845f',
      '#2dd4bf',
      '#f472b6',
      '#a3e635',
      '#fb923c',
      '#818cf8'
    ];
    var out = [];
    for (var i = 0; i < count; i++) out.push(base[i % base.length]);
    return out;
  }

  function shortenPartitionLabel(name) {
    var s = trimStr(name);
    if (s.length <= 32) return s;
    return s.slice(0, 30) + '…';
  }

  function chartLegendOptions(show) {
    if (!show) return { display: false };
    return {
      display: true,
      position: 'bottom',
      labels: {
        boxWidth: 12,
        boxHeight: 12,
        padding: 14,
        color: chartColors().muted,
        font: { size: 11, weight: '600' },
        generateLabels: function (chart) {
          return Chart.defaults.plugins.legend.labels.generateLabels(chart).map(function (item) {
            item.text = shortenPartitionLabel(item.text);
            return item;
          });
        }
      }
    };
  }

  function sortedDayKeys(rows) {
    var set = {};
    (rows || []).forEach(function (r) {
      if (!r.whenMs) return;
      set[formatDayKey(r.when)] = true;
    });
    return Object.keys(set).sort();
  }

  function dayCountsForPartition(rows, days, partitionName) {
    var map = {};
    days.forEach(function (d) { map[d] = 0; });
    (rows || []).forEach(function (r) {
      if (!r.whenMs) return;
      var dk = formatDayKey(r.when);
      if (map[dk] == null) return;
      if (trimStr(r.partition) === partitionName) map[dk] += 1;
    });
    return days.map(function (d) { return map[d]; });
  }

  function uniqueViewersForDay(rows, dayKey, partitionName) {
    var keys = {};
    (rows || []).forEach(function (r) {
      if (!r.whenMs) return;
      if (formatDayKey(r.when) !== dayKey) return;
      if (partitionName != null && trimStr(r.partition) !== partitionName) return;
      var vk = r.viewerKey || viewerDistinctKey(r);
      if (vk) keys[vk] = true;
    });
    return Object.keys(keys).length;
  }

  function uniqueViewersByDay(rows, days, partitionName) {
    return days.map(function (d) { return uniqueViewersForDay(rows, d, partitionName); });
  }

  function audienceMixForRows(rows) {
    var views = { internal: 0, client: 0, unknown: 0 };
    var viewers = { internal: {}, client: {}, unknown: {} };
    (rows || []).forEach(function (r) {
      var bucket = portalAudienceForRow(r);
      if (bucket !== 'internal' && bucket !== 'client') bucket = 'unknown';
      views[bucket] += 1;
      var vk = r.viewerKey || viewerDistinctKey(r);
      if (vk) viewers[bucket][vk] = true;
    });
    return {
      labels: ['Internal', 'Client', 'Unknown'],
      keys: ['internal', 'client', 'unknown'],
      viewCounts: [views.internal, views.client, views.unknown],
      viewerCounts: [
        Object.keys(viewers.internal).length,
        Object.keys(viewers.client).length,
        Object.keys(viewers.unknown).length
      ]
    };
  }

  function topPartitionRank(rows, limit) {
    var map = {};
    (rows || []).forEach(function (r) {
      var p = trimStr(r.partition);
      if (!p) return;
      map[p] = (map[p] || 0) + 1;
    });
    return Object.keys(map).sort(function (a, b) {
      var diff = (map[b] || 0) - (map[a] || 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).slice(0, limit || 10).map(function (name) {
      return { name: name, views: map[name] };
    });
  }

  function viewsByPagePartition(rows, pageLabels, partitionName) {
    var map = {};
    pageLabels.forEach(function (p) { map[p] = 0; });
    (rows || []).forEach(function (r) {
      if (!r.page || map[r.page] == null) return;
      if (trimStr(r.partition) === partitionName) map[r.page] += 1;
    });
    return pageLabels.map(function (p) { return map[p] || 0; });
  }

  function destroyViewerDetailChart() {
    if (chartViewerDetailMix) { chartViewerDetailMix.destroy(); chartViewerDetailMix = null; }
  }

  function destroyCharts() {
    if (chartTopPages) { chartTopPages.destroy(); chartTopPages = null; }
    if (chartTimeline) { chartTimeline.destroy(); chartTimeline = null; }
    if (chartUniqueViewers) { chartUniqueViewers.destroy(); chartUniqueViewers = null; }
    if (chartAudienceMix) { chartAudienceMix.destroy(); chartAudienceMix = null; }
    if (chartTopPartitions) { chartTopPartitions.destroy(); chartTopPartitions = null; }
    destroyViewerDetailChart();
  }

  function viewerDashboardDoughnutSlices(rollup, maxSlices) {
    maxSlices = maxSlices == null ? 8 : maxSlices;
    var list = (rollup || []).slice();
    if (!list.length) return { labels: [], dwellMs: [], views: [] };
    var top = list.slice(0, maxSlices);
    var rest = list.slice(maxSlices);
    if (rest.length) {
      var otherDwell = 0;
      var otherViews = 0;
      rest.forEach(function (d) {
        otherDwell += d.estimatedDwellMs || 0;
        otherViews += d.views || 0;
      });
      top.push({
        name: 'Other (' + rest.length + ')',
        estimatedDwellMs: otherDwell,
        views: otherViews
      });
    }
    return {
      labels: top.map(function (d) { return d.name; }),
      dwellMs: top.map(function (d) { return d.estimatedDwellMs || 0; }),
      views: top.map(function (d) { return d.views || 0; })
    };
  }

  function paintViewerDetailDashboardChart(metrics) {
    destroyViewerDetailChart();
    var canvas = $('ipuViewerDashboardChart');
    if (!canvas || typeof Chart === 'undefined') return;
    var slices = viewerDashboardDoughnutSlices(metrics.dashboardRollup, 8);
    var totalDwell = slices.dwellMs.reduce(function (s, n) { return s + n; }, 0);
    var totalViews = slices.views.reduce(function (s, n) { return s + n; }, 0);
    if (!totalDwell && !totalViews) return;
    var dataValues = totalDwell > 0 ? slices.dwellMs : slices.views;
    var total = totalDwell > 0 ? totalDwell : totalViews;
    var colors = chartColors();
    var palette = partitionChartPalette(dataValues.length);
    chartViewerDetailMix = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.labels,
        datasets: [{
          data: dataValues,
          backgroundColor: palette,
          hoverBackgroundColor: palette,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onHover: chartHoverCursor,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 8,
              color: colors.muted,
              font: { size: 10, weight: '600' }
            }
          },
          tooltip: Object.assign({}, ipuTooltipTheme(colors), {
            callbacks: {
              title: function (items) {
                var i = items[0] && items[0].dataIndex;
                return i != null ? slices.labels[i] : '';
              },
              label: function (ctx) {
                var i = ctx.dataIndex;
                var dwell = slices.dwellMs[i] || 0;
                var views = slices.views[i] || 0;
                var viewPct = totalViews ? Math.round((views / totalViews) * 1000) / 10 : 0;
                var dwellPct = totalDwell ? Math.round((dwell / totalDwell) * 1000) / 10 : 0;
                return [
                  ' ' + views.toLocaleString('en-US') + ' page views (' + viewPct + '%)',
                  ' Est. time ' + formatEstimatedDwell(dwell) + ' (' + dwellPct + '%)'
                ];
              }
            }
          })
        },
        cutout: '62%'
      }
    });
  }

  function chartHoverCursor(event, active) {
    var target = event.native && event.native.target;
    if (target) target.style.cursor = active.length ? 'pointer' : 'default';
  }

  function countUniqueViewers(rows) {
    var keys = {};
    (rows || []).forEach(function (r) {
      var k = r.viewerKey || viewerDistinctKey(r);
      if (k) keys[k] = true;
    });
    return Object.keys(keys).length;
  }

  function countKey(rows, keyFn) {
    var map = {};
    (rows || []).forEach(function (r) {
      var k = trimStr(keyFn(r));
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map).length;
  }

  function rankedCounts(rows, keyFn, limit) {
    var map = {};
    (rows || []).forEach(function (r) {
      var k = trimStr(keyFn(r));
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map).sort(function (a, b) {
      var diff = map[b] - map[a];
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).slice(0, limit || 8).map(function (name) {
      return { name: name, count: map[name] };
    });
  }

  function buildDashboardDetailMetrics(pageRows, pageName, opts, allScopedRows) {
    opts = opts || {};
    allScopedRows = allScopedRows || pageRows;
    ensureRowDwell(pageRows, allScopedRows);
    var dwellByViewerPage = viewerPageDwellTotals(allScopedRows);
    var viewerAgg = sortRows(aggregateByUser(pageRows, allScopedRows), { key: 'views', dir: 'desc' });
    var totalPageDwell = 0;
    viewerAgg.forEach(function (v) {
      var pageDwell = dwellByViewerPage[v.viewerKey] && dwellByViewerPage[v.viewerKey][pageName];
      v.estimatedDwellMs = pageDwell || 0;
      v.estimatedDwell = formatEstimatedDwell(v.estimatedDwellMs);
      totalPageDwell += v.estimatedDwellMs;
    });
    var viewers = opts.fullViewerList ? viewerAgg : viewerAgg.slice(0, 10);
    return {
      kind: 'dashboard',
      pageKey: pageName,
      title: pageName,
      subtitle: 'Unique viewers for this dashboard · ' + IPU_DWELL_HELP,
      views: pageRows.length,
      uniqueViewers: countUniqueViewers(pageRows),
      uniquePartitions: countKey(pageRows, function (r) { return r.partition; }),
      totalEstimatedDwellMs: totalPageDwell,
      topViewers: viewers,
      viewersHeading: opts.fullViewerList ? 'Unique Viewers' : 'Top Viewers',
      topPartitions: rankedCounts(pageRows, function (r) { return r.partition; }, 8),
      latestMs: pageRows.reduce(function (m, r) { return Math.max(m, r.whenMs || 0); }, 0)
    };
  }

  function buildViewerDetailMetrics(rows, viewerKey) {
    ensureRowDwell(rows);
    var sorted = sortRows((rows || []).slice(), { key: 'when', dir: 'desc' });
    var titleRow = sorted[0];
    var title = titleRow ? (titleRow.viewerLabel || viewerDisplayLabel(titleRow) || titleRow.user) : viewerKey;
    var cap = 250;
    var byPageDwell = {};
    var byPageViews = {};
    rows.forEach(function (r) {
      if (!r.page) return;
      byPageDwell[r.page] = (byPageDwell[r.page] || 0) + (r.estimatedDwellMs || 0);
      byPageViews[r.page] = (byPageViews[r.page] || 0) + 1;
    });
    var dashboardRollup = Object.keys(byPageDwell).sort(function (a, b) {
      var diff = byPageDwell[b] - byPageDwell[a];
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).map(function (name) {
      return {
        name: name,
        estimatedDwellMs: byPageDwell[name],
        estimatedDwell: formatEstimatedDwell(byPageDwell[name]),
        views: byPageViews[name] || 0
      };
    });
    return {
      kind: 'viewer',
      viewerKey: viewerKey,
      title: title || 'Viewer',
      subtitle: 'Viewing history · ' + IPU_DWELL_HELP,
      views: rows.length,
      uniqueDashboards: countKey(rows, function (r) { return r.page; }),
      uniquePartitions: countKey(rows, function (r) { return r.partition; }),
      totalEstimatedDwellMs: sumEstimatedDwell(rows),
      latestMs: rows.reduce(function (m, r) { return Math.max(m, r.whenMs || 0); }, 0),
      history: sorted.slice(0, cap),
      historyTruncated: sorted.length > cap,
      dashboardRollup: dashboardRollup
    };
  }

  function buildDayDetailMetrics(rows, dayKey) {
    var topPages = rankedCounts(rows, function (r) { return r.page; }, 10);
    var viewers = sortRows(aggregateByUser(rows), { key: 'views', dir: 'desc' }).slice(0, 10);
    return {
      kind: 'day',
      dayKey: dayKey,
      title: formatChartTooltipDate(dayKey),
      subtitle: 'All page views on this day within the current filters',
      views: rows.length,
      uniqueViewers: countUniqueViewers(rows),
      uniqueDashboards: countKey(rows, function (r) { return r.page; }),
      uniquePartitions: countKey(rows, function (r) { return r.partition; }),
      topPages: topPages,
      topViewers: viewers,
      topPartitions: rankedCounts(rows, function (r) { return r.partition; }, 8)
    };
  }

  function closeChartDetailPanel() {
    state.chartDetail = null;
    destroyViewerDetailChart();
    var panel = $('ipuChartDetail');
    if (panel) panel.hidden = true;
    var applyBtn = $('ipuChartDetailApply');
    if (applyBtn) applyBtn.hidden = true;
  }

  function paintChartDetailPanel(metrics) {
    var panel = $('ipuChartDetail');
    var title = $('ipuChartDetailTitle');
    var sub = $('ipuChartDetailSubtitle');
    var kpis = $('ipuChartDetailKpis');
    var body = $('ipuChartDetailBody');
    var applyBtn = $('ipuChartDetailApply');
    if (!panel || !kpis || !body) return;
    destroyViewerDetailChart();
    if (title) {
      title.textContent = metrics.title || (metrics.kind === 'day' ? 'Day Detail' :
        metrics.kind === 'viewer' ? 'Viewer Detail' : 'Dashboard Detail');
    }
    if (sub) sub.textContent = metrics.subtitle || '';
    if (applyBtn) {
      applyBtn.hidden = metrics.kind !== 'dashboard';
      applyBtn.setAttribute('data-ipu-detail-page', metrics.kind === 'dashboard' ? metrics.pageKey : '');
    }
    if (metrics.kind === 'viewer') {
      kpis.innerHTML =
        '<p class="ipu-chart-detail-kpi">Page views<strong>' + metrics.views.toLocaleString('en-US') + '</strong></p>' +
        '<p class="ipu-chart-detail-kpi">Est. time viewed<strong>' +
        escapeHtml(formatEstimatedDwell(metrics.totalEstimatedDwellMs)) + '</strong></p>' +
        '<p class="ipu-chart-detail-kpi">Dashboards<strong>' + metrics.uniqueDashboards.toLocaleString('en-US') + '</strong></p>' +
        '<p class="ipu-chart-detail-kpi">Partitions<strong>' + metrics.uniquePartitions.toLocaleString('en-US') + '</strong></p>' +
        (metrics.latestMs
          ? '<p class="ipu-chart-detail-kpi">Latest view<strong>' + escapeHtml(formatWhen(new Date(metrics.latestMs))) + '</strong></p>'
          : '');
      var histRows = (metrics.history || []).map(function (r) {
        return '<tr><td>' + escapeHtml(r.page || '—') + '</td><td class="ipu-when-cell">' +
          escapeHtml(formatWhen(r.when)) + '</td><td class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">' +
          escapeHtml(formatEstimatedDwell(r.estimatedDwellMs)) + '</td><td>' +
          escapeHtml(r.partition || r.workspace || '—') + '</td></tr>';
      }).join('');
      var rollupRows = (metrics.dashboardRollup || []).map(function (d) {
        return '<tr><td>' + escapeHtml(d.name) + '</td><td class="num">' + escapeHtml(d.estimatedDwell) + '</td></tr>';
      }).join('');
      var histNote = metrics.historyTruncated
        ? '<p class="ipu-chart-detail-note">Showing newest 250 views in scope.</p>' : '';
      body.innerHTML =
        '<div class="ipu-chart-detail-block ipu-chart-detail-block--chart">' +
        '<h3>Dashboard mix</h3>' +
        '<p class="ipu-chart-detail-note">Share of est. viewing time by dashboard (top 8 + other). Hover for page views.</p>' +
        '<div class="ipu-viewer-dashboard-chart-wrap" aria-hidden="false">' +
        '<canvas id="ipuViewerDashboardChart" role="img" aria-label="Doughnut chart of estimated viewing time by dashboard"></canvas>' +
        '</div></div>' +
        '<div class="ipu-chart-detail-block"><h3>Est. Time by Dashboard</h3><div class="table-wrap compact"><table class="data-table"><thead><tr><th>Dashboard</th><th class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">Est. time</th></tr></thead><tbody>' +
        (rollupRows || '<tr><td colspan="2">No rows</td></tr>') + '</tbody></table></div></div>' +
        '<div class="ipu-chart-detail-block ipu-chart-detail-block--wide"><h3>Viewing History</h3>' + histNote +
        '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>Dashboard</th><th>When</th><th class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">Est. dwell</th><th>Partition</th></tr></thead><tbody>' +
        (histRows || '<tr><td colspan="4">No rows</td></tr>') + '</tbody></table></div></div>';
      panel.hidden = false;
      paintViewerDetailDashboardChart(metrics);
      if (panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    kpis.innerHTML =
      '<p class="ipu-chart-detail-kpi">Page views<strong>' + metrics.views.toLocaleString('en-US') + '</strong></p>' +
      '<p class="ipu-chart-detail-kpi">Unique viewers<strong>' + (metrics.uniqueViewers != null
        ? metrics.uniqueViewers.toLocaleString('en-US') : '—') + '</strong></p>' +
      (metrics.kind === 'dashboard' && metrics.totalEstimatedDwellMs != null
        ? '<p class="ipu-chart-detail-kpi">Est. time viewed<strong>' +
          escapeHtml(formatEstimatedDwell(metrics.totalEstimatedDwellMs)) + '</strong></p>'
        : '') +
      (metrics.kind === 'day'
        ? '<p class="ipu-chart-detail-kpi">Dashboards<strong>' + metrics.uniqueDashboards.toLocaleString('en-US') + '</strong></p>'
        : '<p class="ipu-chart-detail-kpi">Partitions<strong>' + metrics.uniquePartitions.toLocaleString('en-US') + '</strong></p>') +
      (metrics.latestMs
        ? '<p class="ipu-chart-detail-kpi">Latest view<strong>' + escapeHtml(formatWhen(new Date(metrics.latestMs))) + '</strong></p>'
        : '');
    var viewerRows = (metrics.topViewers || []).map(function (v) {
      return '<tr><td>' + escapeHtml(v.user || '—') + '</td><td class="num">' + v.views + '</td><td class="num" title="' +
        escapeHtml(IPU_DWELL_HELP) + '">' + escapeHtml(v.estimatedDwell || '—') + '</td><td>' +
        escapeHtml(v.partition || '—') + '</td></tr>';
    }).join('');
    var secondBlock;
    if (metrics.kind === 'day') {
      secondBlock = (metrics.topPages || []).map(function (p) {
        return '<tr><td>' + escapeHtml(p.name) + '</td><td class="num">' + p.count + '</td></tr>';
      }).join('');
      body.innerHTML =
        '<div class="ipu-chart-detail-block"><h3>Top Dashboards This Day</h3><div class="table-wrap compact"><table class="data-table"><thead><tr><th>Dashboard</th><th class="num">Views</th></tr></thead><tbody>' +
        (secondBlock || '<tr><td colspan="2">No rows</td></tr>') + '</tbody></table></div></div>' +
        '<div class="ipu-chart-detail-block"><h3>Top Viewers This Day</h3><div class="table-wrap compact"><table class="data-table"><thead><tr><th>Viewer</th><th class="num">Views</th><th class="num">Est. time</th><th>Partition</th></tr></thead><tbody>' +
        (viewerRows || '<tr><td colspan="4">No rows</td></tr>') + '</tbody></table></div></div>';
    } else {
      var partRows = (metrics.topPartitions || []).map(function (p) {
        return '<tr><td>' + escapeHtml(p.name) + '</td><td class="num">' + p.count + '</td></tr>';
      }).join('');
      var viewersHeading = metrics.viewersHeading || 'Top Viewers';
      var viewerHead = metrics.kind === 'dashboard'
        ? '<th>Viewer</th><th class="num">Views</th><th class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">Est. time</th><th>Partition</th>'
        : '<th>Viewer</th><th class="num">Views</th><th>Partition</th>';
      var viewerColspan = metrics.kind === 'dashboard' ? 4 : 3;
      body.innerHTML =
        '<div class="ipu-chart-detail-block"><h3>' + escapeHtml(viewersHeading) + '</h3><div class="table-wrap compact"><table class="data-table"><thead><tr>' +
        viewerHead + '</tr></thead><tbody>' +
        (viewerRows || '<tr><td colspan="' + viewerColspan + '">No rows</td></tr>') + '</tbody></table></div></div>' +
        '<div class="ipu-chart-detail-block"><h3>Top Partitions</h3><div class="table-wrap compact"><table class="data-table"><thead><tr><th>Partition</th><th class="num">Views</th></tr></thead><tbody>' +
        (partRows || '<tr><td colspan="2">No rows</td></tr>') + '</tbody></table></div></div>';
    }
    panel.hidden = false;
    if (panel.scrollIntoView) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function refreshChartDetail(rows) {
    if (!state.chartDetail) {
      closeChartDetailPanel();
      return;
    }
    var d = state.chartDetail;
    var subset;
    if (d.kind === 'day') {
      subset = rows.filter(function (r) {
        return r.whenMs && formatDayKey(r.when) === d.key;
      });
      if (!subset.length) {
        closeChartDetailPanel();
        return;
      }
      paintChartDetailPanel(buildDayDetailMetrics(subset, d.key));
    } else if (d.kind === 'dashboard') {
      subset = rows.filter(function (r) { return r.page === d.key; });
      if (!subset.length) {
        closeChartDetailPanel();
        return;
      }
      paintChartDetailPanel(buildDashboardDetailMetrics(subset, d.key, { fullViewerList: !!d.fullViewers }, rows));
    } else if (d.kind === 'viewer') {
      subset = rows.filter(function (r) {
        return (r.viewerKey || viewerDistinctKey(r)) === d.key;
      });
      if (!subset.length) {
        closeChartDetailPanel();
        return;
      }
      paintChartDetailPanel(buildViewerDetailMetrics(subset, d.key));
    }
  }

  function openChartDetail(kind, key, opts) {
    if (!key) return;
    opts = opts || {};
    state.chartDetail = { kind: kind, key: key, fullViewers: !!opts.fullViewers };
    refreshChartDetail(filteredRows());
  }

  function renderCharts(rows) {
    if (typeof Chart === 'undefined') return;
    destroyCharts();
    var colors = chartColors();
    var partSeries = activePartitionSeries();
    var multiPart = !!partSeries;
    if (chapterRoot) {
      chapterRoot.querySelectorAll('.ipu-charts-row').forEach(function (rowEl) {
        rowEl.classList.toggle('ipu-charts--by-partition', multiPart);
      });
    }
    var summaryForCharts = activeScopeSummary();
    var days = summaryForCharts && summaryForCharts.days && summaryForCharts.days.length && !multiPart
      ? summaryForCharts.days.map(function (d) { return d.key; })
      : sortedDayKeys(rows);
    var summaryDayCounts = {};
    if (summaryForCharts && summaryForCharts.days) {
      summaryForCharts.days.forEach(function (d) { summaryDayCounts[d.key] = d.views; });
    }
    var timelineCanvas = $('ipuTimelineChart');
    if (timelineCanvas && days.length) {
      var tickLimit = days.length <= 14 ? days.length : days.length <= 31 ? 10 : 8;
      var timelineDatasets;
      if (multiPart) {
        var linePalette = partitionChartPalette(partSeries.length);
        timelineDatasets = partSeries.map(function (partName, i) {
          var c = linePalette[i];
          return {
            label: partName,
            data: dayCountsForPartition(rows, days, partName),
            borderColor: c,
            backgroundColor: c + '22',
            pointBackgroundColor: c,
            pointBorderColor: c,
            pointHoverBackgroundColor: c,
            pointHoverBorderColor: c,
            fill: false,
            tension: 0.25,
            pointRadius: days.length <= 14 ? 4 : 2,
            pointHoverRadius: 7,
            pointHitRadius: 14,
            borderWidth: 2.5
          };
        });
      } else {
        var timelineNeedsScan = days.some(function (d) { return summaryDayCounts[d] == null; });
        if (timelineNeedsScan) {
          var fromRows = {};
          rows.forEach(function (r) {
            if (!r.whenMs) return;
            var key = formatDayKey(r.when);
            fromRows[key] = (fromRows[key] || 0) + 1;
          });
          days.forEach(function (d) {
            if (summaryDayCounts[d] == null) summaryDayCounts[d] = fromRows[d] || 0;
          });
        }
        timelineDatasets = [{
          label: 'Page views',
          data: days.map(function (d) { return summaryDayCounts[d] || 0; }),
          borderColor: colors.gold,
          backgroundColor: colors.gold + '33',
          pointBackgroundColor: colors.gold,
          pointBorderColor: colors.gold,
          pointHoverBackgroundColor: colors.teal,
          pointHoverBorderColor: colors.teal,
          fill: true,
          tension: 0.25,
          pointRadius: days.length <= 14 ? 4 : 2,
          pointHoverRadius: 7,
          pointHitRadius: 14,
          borderWidth: 2.5
        }];
      }
      chartTimeline = new Chart(timelineCanvas, {
        type: 'line',
        data: {
          labels: days,
          datasets: timelineDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onHover: chartHoverCursor,
          onClick: function (_evt, elements) {
            if (!elements || !elements.length) return;
            var idx = elements[0].index;
            var day = days[idx];
            if (day) openChartDetail('day', day);
          },
          plugins: {
            legend: chartLegendOptions(multiPart),
            tooltip: Object.assign({}, ipuTooltipTheme(colors), {
              callbacks: {
                title: function (items) {
                  var item = items && items[0];
                  return item ? formatChartTooltipDate(String(item.label || '')) : '';
                },
                label: function (ctx) {
                  var v = ctx.parsed.y;
                  if (v == null || v === 0) return null;
                  var prefix = multiPart ? shortenPartitionLabel(ctx.dataset.label) + ': ' : '';
                  return ' ' + prefix + v.toLocaleString('en-US') + ' page views';
                },
                footer: function (items) {
                  if (multiPart && items && items.length) {
                    var total = items.reduce(function (sum, it) {
                      var v = it.parsed && it.parsed.y;
                      return sum + (v || 0);
                    }, 0);
                    if (total) return total.toLocaleString('en-US') + ' total · click for day detail';
                  }
                  return 'Click for day detail';
                }
              }
            })
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: colors.muted,
                font: { size: 11, weight: '600' },
                maxRotation: 0,
                minRotation: 0,
                autoSkip: true,
                maxTicksLimit: tickLimit,
                callback: function (value, index) {
                  var label = days[index] != null ? days[index] : this.getLabelForValue(value);
                  return formatChartAxisDate(label);
                }
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: colors.grid },
              ticks: { precision: 0, color: colors.muted, font: { size: 10 } }
            }
          },
          layout: { padding: { bottom: 4, left: 4, right: 8 } }
        }
      });
    }

    var uvCanvas = $('ipuUniqueViewersChart');
    if (uvCanvas && days.length) {
      var uvTickLimit = days.length <= 14 ? days.length : days.length <= 31 ? 10 : 8;
      var uvDatasets;
      if (multiPart) {
        var uvPalette = partitionChartPalette(partSeries.length);
        uvDatasets = partSeries.map(function (partName, i) {
          var c = uvPalette[i];
          return {
            label: partName,
            data: uniqueViewersByDay(rows, days, partName),
            borderColor: c,
            backgroundColor: c + '22',
            pointBackgroundColor: c,
            pointBorderColor: c,
            pointHoverBackgroundColor: c,
            pointHoverBorderColor: c,
            fill: false,
            tension: 0.25,
            pointRadius: days.length <= 14 ? 4 : 2,
            pointHoverRadius: 7,
            pointHitRadius: 14,
            borderWidth: 2.5
          };
        });
      } else {
        uvDatasets = [{
          label: 'Unique viewers',
          data: uniqueViewersByDay(rows, days, null),
          borderColor: colors.teal,
          backgroundColor: colors.teal + '33',
          pointBackgroundColor: colors.teal,
          pointBorderColor: colors.teal,
          pointHoverBackgroundColor: colors.gold,
          pointHoverBorderColor: colors.gold,
          fill: true,
          tension: 0.25,
          pointRadius: days.length <= 14 ? 4 : 2,
          pointHoverRadius: 7,
          pointHitRadius: 14,
          borderWidth: 2.5
        }];
      }
      chartUniqueViewers = new Chart(uvCanvas, {
        type: 'line',
        data: { labels: days, datasets: uvDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onHover: chartHoverCursor,
          onClick: function (_evt, elements) {
            if (!elements || !elements.length) return;
            var day = days[elements[0].index];
            if (day) openChartDetail('day', day);
          },
          plugins: {
            legend: chartLegendOptions(multiPart),
            tooltip: Object.assign({}, ipuTooltipTheme(colors), {
              callbacks: {
                title: function (items) {
                  var item = items && items[0];
                  return item ? formatChartTooltipDate(String(item.label || '')) : '';
                },
                label: function (ctx) {
                  var v = ctx.parsed.y;
                  if (v == null) return null;
                  var prefix = multiPart ? shortenPartitionLabel(ctx.dataset.label) + ': ' : '';
                  return ' ' + prefix + v.toLocaleString('en-US') + ' viewers';
                },
                footer: function () { return 'Click for day detail'; }
              }
            })
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: colors.muted,
                font: { size: 11, weight: '600' },
                maxRotation: 0,
                minRotation: 0,
                autoSkip: true,
                maxTicksLimit: uvTickLimit,
                callback: function (value, index) {
                  var label = days[index] != null ? days[index] : this.getLabelForValue(value);
                  return formatChartAxisDate(label);
                }
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: colors.grid },
              ticks: { precision: 0, color: colors.muted, font: { size: 10 } }
            }
          },
          layout: { padding: { bottom: 4, left: 4, right: 8 } }
        }
      });
    }

    var mix = audienceMixForRows(rows);
    var mixTotal = mix.viewCounts.reduce(function (s, n) { return s + n; }, 0);
    var mixCanvas = $('ipuAudienceMixChart');
    if (mixCanvas && mixTotal > 0) {
      var mixColors = [colors.teal, colors.gold, colors.muted];
      chartAudienceMix = new Chart(mixCanvas, {
        type: 'doughnut',
        data: {
          labels: mix.labels,
          datasets: [{
            data: mix.viewCounts,
            backgroundColor: mixColors,
            hoverBackgroundColor: mixColors,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onHover: chartHoverCursor,
          onClick: function (_evt, elements) {
            if (!elements || !elements.length) return;
            var idx = elements[0].index;
            var key = mix.keys[idx];
            if (!key) return;
            state.draft.audience = key === 'unknown' ? 'all' : key;
            prunePartitionSelection();
            updateAudienceTriggerLabel();
            applyIpuFilters();
          },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 10,
                color: colors.muted,
                font: { size: 11, weight: '600' }
              }
            },
            tooltip: Object.assign({}, ipuTooltipTheme(colors), {
              callbacks: {
                label: function (ctx) {
                  var views = mix.viewCounts[ctx.dataIndex] || 0;
                  var viewers = mix.viewerCounts[ctx.dataIndex] || 0;
                  var pct = mixTotal ? Math.round((views / mixTotal) * 1000) / 10 : 0;
                  return ' ' + views.toLocaleString('en-US') + ' views (' + pct + '%) · ' +
                    viewers.toLocaleString('en-US') + ' viewers';
                },
                footer: function () { return 'Click to filter Portal audience'; }
              }
            })
          },
          cutout: '58%'
        }
      });
    }

    var topParts = topPartitionRank(rows, 10);
    var partLabels = topParts.map(function (p) { return p.name; });
    var partCanvas = $('ipuTopPartitionsChart');
    if (partCanvas && topParts.length) {
      chartTopPartitions = new Chart(partCanvas, {
        type: 'bar',
        data: {
          labels: partLabels,
          datasets: [{
            label: 'Views',
            data: topParts.map(function (p) { return p.views; }),
            backgroundColor: colors.teal,
            hoverBackgroundColor: colors.gold,
            borderRadius: 6,
            maxBarThickness: 22
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          onHover: chartHoverCursor,
          onClick: function (_evt, elements) {
            if (!elements || !elements.length) return;
            var part = topParts[elements[0].index] && topParts[elements[0].index].name;
            if (!part) return;
            state.draft.partitions = [part];
            updatePartitionTriggerLabel();
            applyIpuFilters();
          },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, ipuTooltipTheme(colors), {
              callbacks: {
                title: function (items) {
                  var item = items && items[0];
                  return item ? String(item.label || '') : '';
                },
                label: function (ctx) {
                  return ' ' + (ctx.parsed.x || 0).toLocaleString('en-US') + ' views';
                },
                footer: function () { return 'Click to filter to this partition'; }
              }
            })
          },
          scales: {
            x: {
              grid: { color: colors.grid },
              ticks: { precision: 0, color: colors.muted, font: { size: 10 } }
            },
            y: {
              grid: { display: false },
              ticks: {
                autoSkip: false,
                color: colors.muted,
                font: { size: 11, weight: '600' },
                callback: function (val) {
                  var label = String(this.getLabelForValue(val) || '');
                  return shortenPartitionLabel(label);
                }
              }
            }
          }
        }
      });
    }

    refreshChartDetail(rows);
  }

  function renderKpis(rows) {
    var set = function (id, val) {
      var el = $(id);
      if (el) el.textContent = val;
    };
    ensureRowDwell(rows);
    var summary = activeScopeSummary();
    set('ipuKpiViews', (summary ? summary.views : rows.length).toLocaleString('en-US'));
    set('ipuKpiViewers', (summary ? summary.viewers : countUniqueViewers(rows)).toLocaleString('en-US'));
    var dashN = {};
    rows.forEach(function (r) { if (r.page) dashN[r.page] = true; });
    set('ipuKpiDashboards', (summary ? summary.dashboards : Object.keys(dashN).length).toLocaleString('en-US'));
    set('ipuKpiDwell', formatEstimatedDwell(sumEstimatedDwell(rows)));
    renderDataCapNotice();
  }

  function filterRecentActivityRows(rows) {
    var d = trimStr(state.recentLocal.dashboard).toLowerCase();
    var v = trimStr(state.recentLocal.viewer).toLowerCase();
    var p = trimStr(state.recentLocal.partition).toLowerCase();
    if (!d && !v && !p) return rows || [];
    return (rows || []).filter(function (r) {
      if (d && trimStr(r.page).toLowerCase().indexOf(d) < 0) return false;
      if (v) {
        var viewerHay = (trimStr(r.viewerLabel || viewerDisplayLabel(r)) + ' ' +
          trimStr(r.user) + ' ' + trimStr(r.email)).toLowerCase();
        if (viewerHay.indexOf(v) < 0) return false;
      }
      if (p && trimStr(r.partition || r.workspace).toLowerCase().indexOf(p) < 0) return false;
      return true;
    });
  }

  function syncRecentLocalInputs() {
    var d = $('ipuRecentSearchDashboard');
    var v = $('ipuRecentSearchViewer');
    var p = $('ipuRecentSearchPartition');
    var clearBtn = $('ipuRecentLocalClear');
    if (d) d.value = state.recentLocal.dashboard || '';
    if (v) v.value = state.recentLocal.viewer || '';
    if (p) p.value = state.recentLocal.partition || '';
    var has = !!(trimStr(state.recentLocal.dashboard) || trimStr(state.recentLocal.viewer) ||
      trimStr(state.recentLocal.partition));
    if (clearBtn) clearBtn.hidden = !has;
  }

  function refreshRecentTableOnly() {
    if (!tabActive) return;
    syncRecentLocalInputs();
    renderRecentTable(filteredRows());
  }

  function renderRecentTable(rows) {
    ensureRowDwell(rows);
    var scoped = filterRecentActivityRows(rows);
    var sorted = sortRows(scoped, state.sortRecent);
    var pageRows = paginate(sorted, state.pageRecent);
    var body = $('ipuRecentBody');
    var empty = $('ipuRecentEmpty');
    if (!body) return;
    body.innerHTML = pageRows.map(function (r) {
      var viewer = r.viewerLabel || viewerDisplayLabel(r) || '—';
      var page = trimStr(r.page);
      var vk = r.viewerKey || viewerDistinctKey(r);
      var dashTd = page
        ? '<td class="ipu-dashboard-cell ipu-row-drill" role="button" tabindex="0" data-ipu-drill="dashboard" data-ipu-drill-key="' +
          escapeHtml(drillKeyAttr(page)) + '" title="Unique viewers for this dashboard">' +
          '<span class="ipu-dashboard-name">' + escapeHtml(page) + '</span></td>'
        : '<td class="ipu-dashboard-cell">' + escapeHtml(r.page || '—') + '</td>';
      var viewerTd = vk
        ? '<td class="ipu-viewer-cell ipu-row-drill" role="button" tabindex="0" data-ipu-drill="viewer" data-ipu-drill-key="' +
          escapeHtml(drillKeyAttr(vk)) + '" title="Viewing history for this viewer">' + escapeHtml(viewer) + '</td>'
        : '<td class="ipu-viewer-cell">' + escapeHtml(viewer) + '</td>';
      return '<tr>' + dashTd + viewerTd +
        '<td class="ipu-when-cell">' + escapeHtml(formatWhen(r.when)) + '</td>' +
        '<td class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">' + escapeHtml(formatEstimatedDwell(r.estimatedDwellMs)) + '</td>' +
        '<td class="ipu-partition-cell">' + escapeHtml(r.partition || r.workspace || '—') + '</td>' +
        '</tr>';
    }).join('');
    if (empty) empty.hidden = scoped.length > 0;
    renderPager('ipuRecent', state.pageRecent, scoped.length);
  }

  function dashboardRankings(rows) {
    var summary = activeScopeSummary();
    var local = aggregateByPage(rows);
    if (!summary || !summary.pages || !summary.pages.length) return local;
    var byName = {};
    local.forEach(function (r) { byName[r.page] = r; });
    return summary.pages.map(function (p) {
      var sample = byName[p.page];
      return {
        page: p.page,
        views: p.views,
        uniqueUsers: p.uniqueUsers != null ? p.uniqueUsers : (sample ? sample.uniqueUsers : 0),
        estimatedDwellMs: sample ? sample.estimatedDwellMs : 0,
        estimatedDwell: sample && sample.estimatedDwellMs ? sample.estimatedDwell : '—'
      };
    });
  }

  function topDashboardBarHtml(row, maxViews, partSeries, palette, partCounts) {
    var viewsLabel = (row.views || 0).toLocaleString('en-US') + ' views';
    if (partSeries && partSeries.length) {
      var segs = partSeries.map(function (name, i) {
        var n = (partCounts[name] && partCounts[name][row.page]) || 0;
        if (!n) return '';
        var pct = (n / maxViews) * 100;
        return '<span class="ipu-view-bar-seg" style="width:' + pct.toFixed(2) + '%;background:' + palette[i] +
          '" title="' + escapeHtml(shortenPartitionLabel(name) + ': ' + n.toLocaleString('en-US') + ' views') + '"></span>';
      }).join('');
      return '<div class="ipu-view-bar" role="img" aria-label="' + escapeHtml(viewsLabel) + '">' + segs + '</div>';
    }
    var pct = ((row.views || 0) / maxViews) * 100;
    return '<div class="ipu-view-bar" role="img" aria-label="' + escapeHtml(viewsLabel) + '">' +
      '<span class="ipu-view-bar-fill" style="width:' + pct.toFixed(2) + '%"></span></div>';
  }

  function renderTopPagesLegend(partSeries, palette) {
    var legend = $('ipuTopPagesLegend');
    if (!legend) return;
    if (!partSeries || !partSeries.length) {
      legend.hidden = true;
      legend.innerHTML = '';
      return;
    }
    legend.hidden = false;
    legend.innerHTML = partSeries.map(function (name, i) {
      return '<span class="ipu-bar-legend-item"><span class="ipu-bar-legend-swatch" style="background:' +
        palette[i] + '"></span>' + escapeHtml(shortenPartitionLabel(name)) + '</span>';
    }).join('');
  }

  function renderTopPagesTable(rows) {
    var agg = sortRows(dashboardRankings(rows), state.sortPages);
    var pageRows = paginate(agg, state.pagePages);
    var body = $('ipuTopPagesBody');
    var empty = $('ipuTopPagesEmpty');
    if (!body) return;
    var maxViews = 1;
    agg.forEach(function (r) {
      if ((r.views || 0) > maxViews) maxViews = r.views;
    });
    var partSeries = activePartitionSeries();
    var palette = partSeries ? partitionChartPalette(partSeries.length) : null;
    var partCounts = {};
    if (partSeries) {
      var pageNames = pageRows.map(function (r) { return r.page; });
      partSeries.forEach(function (name) {
        var counts = viewsByPagePartition(rows, pageNames, name);
        partCounts[name] = {};
        pageNames.forEach(function (page, i) { partCounts[name][page] = counts[i]; });
      });
    }
    body.innerHTML = pageRows.map(function (r) {
      return '<tr class="ipu-row-drill" role="button" tabindex="0" data-ipu-drill="dashboard" data-ipu-drill-key="' +
        escapeHtml(drillKeyAttr(r.page)) + '" title="View unique viewers">' +
        '<td>' + escapeHtml(r.page) + '</td>' +
        '<td class="ipu-bar-cell">' + topDashboardBarHtml(r, maxViews, partSeries, palette, partCounts) + '</td>' +
        '<td class="num">' + escapeHtml(String(r.views)) + '</td><td class="num">' +
        escapeHtml(String(r.uniqueUsers)) + '</td>' +
        '<td class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">' + escapeHtml(r.estimatedDwell || '—') + '</td></tr>';
    }).join('');
    renderTopPagesLegend(agg.length ? partSeries : null, palette);
    if (empty) empty.hidden = agg.length > 0;
    renderPager('ipuTopPages', state.pagePages, agg.length);
  }

  function renderTopUsersTable(rows) {
    var agg = sortRows(aggregateByUser(rows, rows), state.sortUsers);
    var pageRows = paginate(agg, state.pageUsers);
    var body = $('ipuTopUsersBody');
    var empty = $('ipuTopUsersEmpty');
    if (!body) return;
    body.innerHTML = pageRows.map(function (r) {
      var label = r.user || '(unknown)';
      var vk = r.viewerKey || '';
      if (!vk) return '';
      return '<tr class="ipu-row-drill" role="button" tabindex="0" data-ipu-drill="viewer" data-ipu-drill-key="' +
        escapeHtml(drillKeyAttr(vk)) + '" title="View viewing history">' +
        '<td class="ipu-viewer-cell">' + escapeHtml(label) + '</td>' +
        '<td class="ipu-partition-cell">' + escapeHtml(r.partition || '—') + '</td>' +
        '<td class="num">' + escapeHtml(String(r.views)) + '</td>' +
        '<td class="num">' + escapeHtml(String(r.uniquePages)) + '</td>' +
        '<td class="num" title="' + escapeHtml(IPU_DWELL_HELP) + '">' + escapeHtml(r.estimatedDwell || '—') + '</td>' +
        '<td class="ipu-when-cell">' + escapeHtml(r.lastView || '—') + '</td>' +
        '</tr>';
    }).join('');
    if (empty) empty.hidden = agg.length > 0;
    renderPager('ipuTopUsers', state.pageUsers, agg.length);
  }

  function refreshUi() {
    if (!tabActive) return;
    ensureScopeSummary();
    stampDwellBasis();
    prunePartitionSelection();
    prunePageSelection();
    syncIpuSearchInput();
    syncRecentLocalInputs();
    updateAudienceTriggerLabel();
    updateRangeTriggerLabel();
    updatePartitionTriggerLabel();
    updatePageTriggerLabel();
    if (ipuFilterMenuOpen()) renderOpenIpuMenus();
    var rows = filteredRows();
    renderKpis(rows);
    renderCharts(rows);
    renderRecentTable(rows);
    renderTopPagesTable(rows);
    renderTopUsersTable(rows);
    renderIpuSortableHeaders();
    var sub = $('ipuSubtitle');
    if (sub) {
      var f = state.filters;
      var audLabel = f.audience === 'client' ? 'Client portal' : f.audience === 'internal' ? 'Internal portal' : 'All audiences';
      var rangeLabel = rangeTriggerLabel(f.rangeDays);
      var summaryForSub = activeScopeSummary();
      var dashN = summaryForSub ? summaryForSub.dashboards : Object.keys(rows.reduce(function (m, r) { m[r.page] = true; return m; }, {})).length;
      var viewN = summaryForSub ? summaryForSub.views : rows.length;
      var partLabel = f.partitions.length ? (f.partitions.length + ' partition' + (f.partitions.length === 1 ? '' : 's')) : 'all partitions';
      var dashFilterLabel = f.selectedPages.length
        ? (f.selectedPages.length === 1 ? f.selectedPages[0] : f.selectedPages.length + ' dashboards')
        : 'all dashboards';
      sub.textContent = audLabel + ' · ' + rangeLabel + ' · ' + partLabel + ' · ' + dashFilterLabel + ' · ' +
        viewN.toLocaleString('en-US') + ' page views' +
        (f.selectedPages.length ? '' : (' across ' + dashN.toLocaleString('en-US') + ' dashboards'));
    }
    if (state.loading) {
      hostStatus('Loading portal page views…', 'loading');
    } else if (state.error) {
      hostStatus(state.error, 'error');
    } else if (!rows.length && state.ready && state.rows.length) {
      var unknownN = state.rows.filter(function (r) { return r.audience === 'unknown'; }).length;
      var hint = '';
      if (state.filters.audience !== 'all' && unknownN) {
        hint = ' Try All audiences under Portal — ' + unknownN.toLocaleString('en-US') + ' rows have no internal/client label.';
      } else if (state.filters.rangeDays > 0) {
        var dated = state.rows.filter(function (r) { return r.whenMs > 0; }).length;
        hint = ' Loaded ' + state.rows.length.toLocaleString('en-US') + ' recent PortalActivity rows (' +
          dated.toLocaleString('en-US') + ' with a parsed date) but none match the last ' + state.filters.rangeDays +
          ' days — try Last 12 months or confirm act_date on the webform.';
      }
      hostStatus('No page views for the current filters.' + hint, 'error');
    } else if (!rows.length && state.ready) {
      var colHint = state.columnNames.length ? ' Columns: ' + state.columnNames.join(', ') + '.' : '';
      var mapHint = state.fields.page ? (' Using `' + state.fields.page + '` as page.') : '';
      hostStatus(
        (state.rawRowCount
          ? state.rawRowCount.toLocaleString('en-US') + ' raw PortalActivity rows but none normalized to page views.'
          : 'PortalActivity returned no rows from the Data API.') + mapHint + colHint,
        'error'
      );
    } else if (state.ready) {
      hostStatus(rows.length.toLocaleString('en-US') + ' page views loaded.');
    }
    if (host && typeof host.onChapterRefresh === 'function') host.onChapterRefresh();
  }

  var loadPromise = null;

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function retryableDatasetError(err) {
    return !!(global.OpsUi && OpsUi.isRetryableDatasetError && OpsUi.isRetryableDatasetError(err));
  }

  function loadData(attempt) {
    attempt = attempt || 0;
    if (attempt === 0 && loadPromise) return loadPromise;
    setLoading(true, attempt ? 'Reconnecting to PortalActivity…' : 'Loading portal page views…');
    state.error = '';
    var run = probeDatasetMapping().then(function () {
      return fetchRows(ROW_CAP);
    }).then(function (raw) {
      if (!raw.length) {
        state.rows = [];
        state.loadCapped = false;
        state.ready = true;
        state.fields = {};
        setLoading(false);
        refreshUi();
        return;
      }
      state.rawRowCount = raw.length;
      state.loadCapped = lastFetchCapped || raw.length >= ROW_CAP;
      state.columnNames = Object.keys(raw[0] || {});
      state.fields = resolveFields(raw[0]);
      if (!state.fields.page) {
        throw new Error('Could not find a portal page column. Columns: ' + state.columnNames.join(', '));
      }
      state.rows = normalizedRows(raw, state.fields);
      state.rows.sort(function (a, b) { return (b.whenMs || 0) - (a.whenMs || 0); });
      state.ready = true;
      state.error = '';
      hideSetupPanel();
      setLoading(false);
      refreshUi();
    }).catch(function (err) {
      if (attempt < 2 && tabActive && retryableDatasetError(err)) {
        return delay(700 * (attempt + 1)).then(function () {
          if (!tabActive) throw err;
          return loadData(attempt + 1);
        });
      }
      state.error = errMessage(err);
      state.ready = false;
      setLoading(false);
      if (tabActive) {
        showSetupPanel(state.error);
        hostStatus(state.error, 'error');
      }
      throw err;
    });
    if (attempt === 0) {
      loadPromise = run.then(function (value) {
        loadPromise = null;
        return value;
      }, function (err) {
        loadPromise = null;
        throw err;
      });
      return loadPromise;
    }
    return run;
  }

  var controlsBound = false;
  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    var root = chapterRoot || document;
    root.addEventListener('click', function (ev) {
      if (!tabActive) return;
      var t = ev.target;
      if (t && t.nodeType === 3) t = t.parentElement;
      if (!t || !t.closest) return;
      var sortTh = t.closest('.ipu-sortable[data-ipu-sort-table]');
      if (sortTh && chapterRoot && chapterRoot.contains(sortTh)) {
        toggleIpuTableSort(sortTh.getAttribute('data-ipu-sort-table'), sortTh.getAttribute('data-ipu-sort-key'));
        return;
      }
      var scopeTrigger = t.closest('#ipuAudienceTrigger, #ipuRangeTrigger, #ipuPartitionTrigger, #ipuPageTrigger');
      if (scopeTrigger && chapterRoot && chapterRoot.contains(scopeTrigger)) {
        ev.stopPropagation();
        toggleIpuFilterMenu(scopeTrigger);
        return;
      }
      var drillRow = t.closest('[data-ipu-drill]');
      if (drillRow && chapterRoot && chapterRoot.contains(drillRow)) {
        var drillKind = drillRow.getAttribute('data-ipu-drill');
        var drillKey = drillKeyFromAttr(drillRow.getAttribute('data-ipu-drill-key'));
        if (drillKind === 'dashboard' && drillKey) {
          openChartDetail('dashboard', drillKey, { fullViewers: true });
        } else if (drillKind === 'viewer' && drillKey) {
          openChartDetail('viewer', drillKey);
        }
        return;
      }
      var pagerBtn = t.closest('[data-ipu-pager]');
      if (pagerBtn && chapterRoot && chapterRoot.contains(pagerBtn)) {
        var table = pagerBtn.getAttribute('data-ipu-pager');
        var dir = pagerBtn.getAttribute('data-dir');
        var key = table === 'recent' ? 'pageRecent' : table === 'pages' ? 'pagePages' : 'pageUsers';
        if (dir === 'prev') state[key] = Math.max(0, state[key] - 1);
        else state[key] = state[key] + 1;
        refreshUi();
      }
    });
    var searchEl = $('ipuSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.draft.search = searchEl.value;
      });
    }
    var applyBtn = $('ipuApplyFilters');
    if (applyBtn) applyBtn.addEventListener('click', applyIpuFilters);
    var resetBtn = $('ipuResetFilters');
    if (resetBtn) resetBtn.addEventListener('click', resetIpuFilters);
    var audMenu = $('ipuAudienceMenu');
    if (audMenu) {
      audMenu.addEventListener('click', function (ev) { ev.stopPropagation(); });
      audMenu.addEventListener('change', function (ev) {
        var input = ev.target;
        if (!input || input.type !== 'radio') return;
        var aud = input.getAttribute('data-ipu-audience');
        if (!aud) return;
        state.draft.audience = aud;
        prunePartitionSelection();
        renderAudienceMenu();
        if (ipuFilterMenuOpen()) {
          renderPartitionMenu();
          renderPageMenu();
        } else {
          updatePartitionTriggerLabel();
          updatePageTriggerLabel();
        }
      });
    }
    var rangeMenu = $('ipuRangeMenu');
    if (rangeMenu) {
      rangeMenu.addEventListener('click', function (ev) { ev.stopPropagation(); });
      rangeMenu.addEventListener('change', function (ev) {
        var input = ev.target;
        if (!input || input.type !== 'radio') return;
        var d = parseInt(input.getAttribute('data-ipu-range'), 10);
        state.draft.rangeDays = isNaN(d) ? 0 : d;
        renderRangeMenu();
        if (ipuFilterMenuOpen()) {
          renderAudienceMenu();
          renderPartitionMenu();
          renderPageMenu();
        }
      });
    }
    var partMenu = $('ipuPartitionMenu');
    if (partMenu) {
      partMenu.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      partMenu.addEventListener('change', function (ev) {
        var input = ev.target;
        if (!input || input.type !== 'checkbox') return;
        var p = input.getAttribute('data-ipu-partition');
        if (!p) return;
        var idx = state.draft.partitions.indexOf(p);
        if (input.checked && idx < 0) state.draft.partitions.push(p);
        else if (!input.checked && idx >= 0) state.draft.partitions.splice(idx, 1);
        updatePartitionTriggerLabel();
        renderPageMenu();
      });
    }
    var pageMenu = $('ipuPageMenu');
    if (pageMenu) {
      pageMenu.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      pageMenu.addEventListener('change', function (ev) {
        var input = ev.target;
        if (!input || input.type !== 'checkbox') return;
        var p = input.getAttribute('data-ipu-page');
        if (!p) return;
        var idx = state.draft.selectedPages.indexOf(p);
        if (input.checked && idx < 0) state.draft.selectedPages.push(p);
        else if (!input.checked && idx >= 0) state.draft.selectedPages.splice(idx, 1);
        updatePageTriggerLabel();
      });
    }
    document.addEventListener('click', function (ev) {
      if (!tabActive || !chapterRoot || !chapterRoot.contains(ev.target)) return;
      if (!isIpuScopeFilterClusterOpen()) return;
      var t = ev.target;
      if (t && t.nodeType === 3) t = t.parentElement;
      if (!t || !t.closest) return;
      var cluster = ipuScopeClusterEl();
      if (cluster && cluster.contains(t)) return;
      closeIpuFilterMenus();
    });
    var detailClose = $('ipuChartDetailClose');
    if (detailClose) {
      detailClose.addEventListener('click', function () {
        closeChartDetailPanel();
      });
    }
    var detailApply = $('ipuChartDetailApply');
    if (detailApply) {
      detailApply.addEventListener('click', function () {
        var page = detailApply.getAttribute('data-ipu-detail-page');
        if (!page) return;
        state.draft.selectedPages = [page];
        closeChartDetailPanel();
        applyIpuFilters();
      });
    }
    function bindRecentLocalInput(id, key) {
      var el = $(id);
      if (!el) return;
      var timer = null;
      el.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.recentLocal[key] = el.value;
          state.pageRecent = 0;
          refreshRecentTableOnly();
        }, 200);
      });
    }
    bindRecentLocalInput('ipuRecentSearchDashboard', 'dashboard');
    bindRecentLocalInput('ipuRecentSearchViewer', 'viewer');
    bindRecentLocalInput('ipuRecentSearchPartition', 'partition');
    var recentClear = $('ipuRecentLocalClear');
    if (recentClear) {
      recentClear.addEventListener('click', function () {
        state.recentLocal = { dashboard: '', viewer: '', partition: '' };
        state.pageRecent = 0;
        refreshRecentTableOnly();
      });
    }
    var exportReportBtn = $('ipuExportReport');
    if (exportReportBtn) {
      exportReportBtn.addEventListener('click', function () {
        exportIpuMetricsWorkbook();
      });
    }
    var exportBtn = $('ipuExportActivity');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        exportActivityCsv();
      });
    }
    root.addEventListener('keydown', function (ev) {
      if (!tabActive || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var drillRow = t.closest('[data-ipu-drill]');
      if (!drillRow || !chapterRoot || !chapterRoot.contains(drillRow)) return;
      ev.preventDefault();
      drillRow.click();
    });
  }

  global.PartnerInsightsUsageTab = {
    init: function (h, opts) {
      host = h;
      opts = opts || {};
      if (opts.datasetId) DATASET.id = opts.datasetId;
      chapterRoot = document.getElementById('insightsActivityChapter');
      bindControls();
      if (typeof domo !== 'undefined' && typeof domo.onDataUpdate === 'function' && !global._ipuDataUpdateBound) {
        global._ipuDataUpdateBound = true;
        domo.onDataUpdate(function (alias) {
          if (alias !== DATASET.alias && alias !== DATASET.id) return;
          if (!tabActive) return;
          loadData();
        });
      }
    },
    activate: function () {
      tabActive = true;
      if (typeof domo === 'undefined') {
        showSetupPanel('Domo SDK not available — open this app from a Domo card.');
        hostStatus('Domo SDK not available — open this app from a Domo card.', 'error');
        return;
      }
      if (state.ready && state.rows.length) {
        hideSetupPanel();
        syncIpuDraftFromApplied();
        refreshUi();
        return;
      }
      return loadData().catch(function () { /* handled in loadData */ });
    },
    deactivate: function () {
      tabActive = false;
      destroyCharts();
    },
    refresh: refreshUi,
    isLoading: function () { return state.loading; },
    getRowCount: function () { return filteredRows().length; },
    getError: function () { return state.error; },
    getHubStat: function () {
      if (!state.ready) return { value: null, label: 'views' };
      var rows = filteredRows();
      return { value: rows.length, label: 'views in scope' };
    },
    prefetchForCommandCenter: function () {
      if (typeof domo === 'undefined') return Promise.resolve();
      if (state.ready) return Promise.resolve();
      return loadData().then(function () {
        if (host && typeof host.onCommandCenterRefresh === 'function') host.onCommandCenterRefresh();
      }).catch(function () {});
    },
    getClientViewsByPartition: function (lookbackDays) {
      if (!state.ready) return null;
      if (!state.rows.length) return {};
      var days = lookbackDays == null ? 30 : Number(lookbackDays);
      if (!isFinite(days) || days <= 0) days = 30;
      var cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      var out = {};
      state.rows.forEach(function (r) {
        if (!rowMatchesAudienceTab(r, 'client')) return;
        if ((r.whenMs || 0) < cutoff) return;
        var p = trimStr(r.partition).toLowerCase();
        if (!p) return;
        out[p] = (out[p] || 0) + 1;
      });
      return out;
    },
    exportChapterReport: exportIpuMetricsWorkbook
  };
})(window);
