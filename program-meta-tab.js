(function (global) {
  'use strict';

  var host = null;
  var chapterRoot = null;
  var tabActive = false;
  var embedState = { ready: false, loading: false, error: '' };
  var controlsBound = false;

  function $(id) {
    if (chapterRoot) {
      var scoped = chapterRoot.querySelector('#' + id);
      if (scoped) return scoped;
    }
    return document.getElementById(id);
  }

  function chapterQueryAll(sel) {
    return chapterRoot ? chapterRoot.querySelectorAll(sel) : document.querySelectorAll(sel);
  }

  function hostStatus(msg, kind) {
    if (statusEl && window.OpsUi && OpsUi.setStatusEl) OpsUi.setStatusEl(statusEl, msg, kind);
    else if (statusEl) {
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('is-error', kind === 'error');
    }
    if (tabActive && host && typeof host.setStatus === 'function') host.setStatus(msg, kind);
  }

  function panelLoading(active, label) {
    var sk = $('pmSkeleton');
    if (sk) sk.hidden = !active;
    embedState.loading = !!active;
    if (active && label) hostStatus(label, 'loading');
  }

  var PROGRAM_META_ALIAS = 'programMeta';
  var PROGRAM_META_DATASET_ID = 'efa412ee-ca5b-483a-9cf0-f7eca03034ed';
  var EMAIL_SKEW_ALIAS = 'emailSkew';
  var EMAIL_SKEW_DATASET_ID = 'c9aced4a-18bd-43df-aa45-df993c868726';
  var DOWNLOADS_ALIAS = 'downloads';
  var DOWNLOADS_DATASET_ID = '422fec3e-c1f1-4e9d-baba-2e8365cb6289';
  var EMAIL_SKEW_FIELD_KEYS = [
    'PARTITION',
    'CAMPAIGN_YEAR',
    'PROGRAM_SOLUTION',
    'PERCENTAGE_DIFF',
    'TRANSLATION'
  ];
  var Join = window.OpsJoin || {};
  var CAMPAIGN_CODE_ORDER = Join.CAMPAIGN_CODE_ORDER || ['CNVAAFF', 'CNVASC', 'CNVAU', 'CNVAA', 'CNVD', 'CNVA', 'AWRSS', 'AWRRS', 'AWR'];
  var DOWNLOAD_SUMMARY_KEYS = ['CLIENT', 'CAMPAIGN', 'CY', 'LAST_DOWNLOAD'];
  var DOWNLOAD_EVENT_KEYS = [
    'EVENT_DATE', 'DOWNLOAD_DATE', 'CLIENT', 'PARTITION', 'PARTNER',
    'CAMPAIGN', 'PROGRAM_SOLUTION', 'CY', 'CAMPAIGN_YEAR', 'FILE_NAME', 'FILE_PATH'
  ];
  var ENABLED_OPTIONS = [
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Not enabled' }
  ];
  var LAST_DOWNLOAD_OPTIONS = [
    { value: 'downloaded', label: 'Has downloaded' },
    { value: 'never', label: 'Never downloaded' },
    { value: 'd7', label: 'Last 7 days' },
    { value: 'd14', label: 'Last 14 days' },
    { value: 'd30', label: 'Last 30 days' },
    { value: 'older', label: 'Older than 30 days' }
  ];
  var FIELD_KEYS = [
    'INSTANCE_NUM',
    'INSTANCE_ID',
    'PROGRAM_ID',
    'PARTITION',
    'PARTNER_IPEDS_ID',
    'PROGRAM_SOLUTION',
    'CAMPAIGN_YEAR',
    'MQL_SCORE',
    'PARTITION_STATE_CODE',
    'LANDING_PAGE_URL',
    'DIGITAL_EXPORT',
    'SUNSET_DATE',
    'RETURNS_ENABLED',
    'RETURNS_CRON',
    'MAP_CRON',
    'MAP_ENABLED',
    'MARKET_REVISION',
    'MARKET_TIER',
    'PROGRAM_STATUS',
    'ACTIVE_FLAG',
    'DQ_STATUS',
    'DQ_NOTES'
  ];

  var overlayEl = null;
  var overlayLabelEl = null;
  var subtitleEl = null;
  var statusEl = null;
  var gridEl = null;
  var searchFilterEl = null;
  var filterMarketRevisionMissingEl = null;
  var filterPrintNotReadyEl = null;
  var groupByButtonsEl = null;
  var sortButtonsEl = null;
  var applyBtnEl = null;
  var resetBtnEl = null;
  var filterEls = {
    partners: { trigger: null, label: null, menu: null, field: null },
    campaigns: { trigger: null, label: null, menu: null, field: null },
    years: { trigger: null, label: null, menu: null, field: null },
    returns: { trigger: null, label: null, menu: null, field: null },
    map: { trigger: null, label: null, menu: null, field: null },
    dashboards: { trigger: null, label: null, menu: null, field: null },
    lastDownload: { trigger: null, label: null, menu: null, field: null },
    statuses: { trigger: null, label: null, menu: null, field: null }
  };

  function bindFilterPair(key, triggerId, labelId, menuId) {
    var pair = filterEls[key];
    pair.trigger = $(triggerId);
    pair.label = $(labelId);
    pair.menu = $(menuId);
    pair.field = pair.trigger && pair.trigger.closest('.field-multi');
  }

  function bindEls() {
    overlayEl = $('pmSkeleton');
    overlayLabelEl = $('pmSkeletonLabel');
    subtitleEl = $('pmCampaignSubtitle');
    statusEl = $('pmCampaignStatus');
    gridEl = $('pmCampaignGrid');
    searchFilterEl = $('pmSearchFilter');
    filterMarketRevisionMissingEl = $('pmFilterMarketRevisionMissing');
    filterPrintNotReadyEl = $('pmFilterPrintNotReady');
    groupByButtonsEl = $('pmGroupByButtons');
    sortButtonsEl = $('pmSortButtons');
    applyBtnEl = $('pmBtnApplyFilters');
    resetBtnEl = $('pmBtnResetFilters');
    bindFilterPair('partners', 'pmPartnerTrigger', 'pmPartnerTriggerLabel', 'pmPartnerMenu');
    bindFilterPair('campaigns', 'pmCampaignTrigger', 'pmCampaignTriggerLabel', 'pmCampaignMenu');
    bindFilterPair('years', 'pmYearTrigger', 'pmYearTriggerLabel', 'pmYearMenu');
    bindFilterPair('returns', 'pmReturnsTrigger', 'pmReturnsTriggerLabel', 'pmReturnsMenu');
    bindFilterPair('map', 'pmMapTrigger', 'pmMapTriggerLabel', 'pmMapMenu');
    bindFilterPair('dashboards', 'pmDashboardsTrigger', 'pmDashboardsTriggerLabel', 'pmDashboardsMenu');
    bindFilterPair('lastDownload', 'pmDownloadTrigger', 'pmDownloadTriggerLabel', 'pmDownloadMenu');
    bindFilterPair('statuses', 'pmStatusTrigger', 'pmStatusTriggerLabel', 'pmStatusMenu');
  }

  var allEntries = [];
  var groupBy = 'year';
  var sortBy = 'name';
  var loadPromise = null;
  var didDefaultYear = false;
  var filterDraft = emptyPmFilters();
  var filterApplied = emptyPmFilters();
  var pmHubScopeSig = '';

  function emptyPmFilters() {
    return {
      partners: [],
      campaigns: [],
      years: [],
      search: '',
      returns: [],
      map: [],
      dashboards: [],
      lastDownload: [],
      statuses: []
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setAppLoading(active, label) {
    panelLoading(active, label);
  }

  function setStatus(msg, kind) {
    hostStatus(msg, kind);
  }

  function trimStr(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function parseTriState(raw) {
    var s = trimStr(raw);
    if (!s) return 'missing';
    var upper = s.toUpperCase();
    if (upper === 'TRUE' || upper === '1' || upper === 'YES' || upper === 'Y') return 'enabled';
    if (upper === 'FALSE' || upper === '0' || upper === 'NO' || upper === 'N') return 'disabled';
    return 'missing';
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

  function startOfToday() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysSince(date) {
    var d = parseDate(date);
    if (!d) return null;
    return Math.round((startOfToday() - d) / 86400000);
  }

  function campaignYearToken(value) {
    return Join.campaignYearToken ? Join.campaignYearToken(value) : '';
  }

  function yearTokenFromFileName(name) {
    return Join.yearTokenFromFileName ? Join.yearTokenFromFileName(name) : '';
  }

  function compactJoinKey(v) {
    return Join.compactJoinKey ? Join.compactJoinKey(v) : trimStr(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function canonicalCampaignCode(v) {
    return Join.canonicalCampaignCode ? Join.canonicalCampaignCode(v) : trimStr(v).toUpperCase();
  }

  function rowVal(row, key) {
    if (!row) return '';
    if (row[key] !== undefined && row[key] != null) return row[key];
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

  function partitionKeysOverlap(a, b) {
    return Join.partitionKeysOverlap ? Join.partitionKeysOverlap(a, b) : compactJoinKey(a) === compactJoinKey(b);
  }

  function yearsEquivalent(a, b) {
    return Join.yearsEquivalent ? Join.yearsEquivalent(a, b) : campaignYearToken(a) === campaignYearToken(b);
  }

  function summarizeDownloads(rows) {
    if (Join.summarizeDownloadEvents) return Join.summarizeDownloadEvents(rows, parseDate);
    return {};
  }

  function triStateLabel(state) {
    return state === 'enabled' ? 'Enabled' : 'Not Enabled';
  }

  function triStateClass(state) {
    return state === 'enabled' ? 'is-enabled' : 'is-disabled';
  }

  function printReadyLabel(ready) {
    return ready ? 'Ready' : 'Not Ready';
  }

  function printReadyClass(ready) {
    return ready ? 'is-enabled' : 'is-disabled';
  }

  function valueOrMissing(raw) {
    var s = trimStr(raw);
    return s ? s : null;
  }

  function isCy26(year) {
    var s = trimStr(year).toUpperCase().replace(/[\s_-]+/g, '');
    return s === 'CY26' || s === 'CY2026' || s === '2026';
  }

  function dqStatusDisplay(raw) {
    var s = trimStr(raw);
    if (!s) return { label: 'Pending', tone: 'red' };
    var key = s.toLowerCase();
    if (key === 'green') return { label: 'Green', tone: 'green' };
    if (key === 'yellow') return { label: 'Yellow', tone: 'yellow' };
    if (key === 'red') return { label: 'Red', tone: 'red' };
    return { label: s, tone: 'unknown' };
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
      return {
        cols: c,
        rows: resp.map(function (r) { return c.map(function (k) { return r[k]; }); })
      };
    }
    if (resp && Array.isArray(resp.columns) && Array.isArray(resp.rows)) {
      return { cols: resp.columns.map(columnName), rows: resp.rows };
    }
    console.warn('[programMeta] unexpected response shape', resp && typeof resp === 'object' ? Object.keys(resp) : typeof resp);
    return { cols: [], rows: [] };
  }

  function colIdx(cols, name) {
    var upper = String(name).toUpperCase();
    for (var i = 0; i < cols.length; i++) {
      if (String(cols[i]).toUpperCase() === upper) return i;
    }
    return -1;
  }

  function rowsFromSqlRaw(raw, fieldKeys) {
    var keys = fieldKeys || FIELD_KEYS;
    var parsed = parseSqlResp(raw);
    var idxs = {};
    keys.forEach(function (f) {
      idxs[f] = colIdx(parsed.cols, f);
    });
    return parsed.rows.map(function (row) {
      var o = {};
      keys.forEach(function (f) {
        var i = idxs[f];
        if (i < 0) {
          o[f] = row && !Array.isArray(row) && row[f] !== undefined ? row[f] : null;
          return;
        }
        if (Array.isArray(row)) {
          o[f] = row[i];
          return;
        }
        if (row && typeof row === 'object') {
          var col = parsed.cols[i];
          o[f] = row[f] !== undefined ? row[f] :
            (col != null && row[col] !== undefined ? row[col] : null);
          return;
        }
        o[f] = null;
      });
      return o;
    });
  }

  function normalizePayloadRows(payload, fieldKeys) {
    var keys = fieldKeys || FIELD_KEYS;
    if (payload && Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
      return rowsFromSqlRaw(payload, keys);
    }
    if (payload && payload.data && Array.isArray(payload.data.columns) && Array.isArray(payload.data.rows)) {
      return rowsFromSqlRaw(payload.data, keys);
    }
    if (Array.isArray(payload) && payload.length && Array.isArray(payload[0])) {
      return rowsFromSqlRaw(payload, keys);
    }
    var raw = Array.isArray(payload) ? payload :
      (payload && Array.isArray(payload.rows)) ? payload.rows :
      (payload && Array.isArray(payload.data)) ? payload.data : [];
    return raw.map(function (r) {
      if (Array.isArray(r)) {
        var oArr = {};
        keys.forEach(function (f, i) {
          oArr[f] = i < r.length ? r[i] : null;
        });
        return oArr;
      }
      if (!r || typeof r !== 'object') return null;
      var upper = {};
      Object.keys(r).forEach(function (k) {
        upper[String(k).toUpperCase()] = r[k];
      });
      var o = {};
      keys.forEach(function (f) {
        o[f] = upper[f] !== undefined ? upper[f] : null;
      });
      return o;
    }).filter(Boolean);
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

  function normalizeEntry(row) {
    var partition = trimStr(row.PARTITION) || 'Unknown';
    var solution = trimStr(row.PROGRAM_SOLUTION) || '—';
    var year = trimStr(row.CAMPAIGN_YEAR) || '—';
    var programId = trimStr(row.PROGRAM_ID);
    var stateCode = trimStr(row.PARTITION_STATE_CODE);
    var landing = trimStr(row.LANDING_PAGE_URL);
    var ready = !!(stateCode && landing);
    var returnsState = parseTriState(row.RETURNS_ENABLED);
    var mapState = parseTriState(row.MAP_ENABLED);
    var revision = valueOrMissing(row.MARKET_REVISION);
    var tier = valueOrMissing(row.MARKET_TIER);

    return {
      key: trimStr(row.INSTANCE_ID) + '|' + programId,
      partition: partition,
      solution: solution,
      year: year,
      programId: programId,
      instanceId: trimStr(row.INSTANCE_ID),
      stateCode: stateCode,
      landingPage: landing,
      ready: ready,
      returnsState: returnsState,
      mapState: mapState,
      dashboardState: 'disabled',
      marketRevision: revision,
      marketTier: tier,
      marketMissing: !revision && !tier,
      emailSkewPct: null,
      emailSkewTranslation: '',
      showDataQuality: isCy26(year),
      dqStatus: dqStatusDisplay(row.DQ_STATUS),
      dqNotes: trimStr(row.DQ_NOTES),
      lastDownload: null,
      programStatus: '',
      activeFlag: ''
    };
  }

  function programIdKey(value) {
    var s = trimStr(value);
    if (!s) return '';
    if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
    return s;
  }

  function statusMatchKey(value) {
    return trimStr(value).toLowerCase();
  }

  function activityRowsByProgramId() {
    var programs = host && typeof host.getPrograms === 'function' ? host.getPrograms() : [];
    var grouped = {};
    (programs || []).forEach(function (p) {
      var part = trimStr(rowVal(p, 'PARTITION'));
      if (Join.isIgnoredPartition && Join.isIgnoredPartition(part)) return;
      var id = programIdKey(rowVal(p, 'PROGRAM_ID'));
      if (!id) return;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(p);
    });
    return grouped;
  }

  function findProgramActivityRow(entry, byId) {
    var rows = (byId || activityRowsByProgramId())[programIdKey(entry.programId)] || [];
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];
    var samePartner = rows.filter(function (p) {
      return trimStr(rowVal(p, 'PARTITION')) === entry.partition;
    });
    if (samePartner.length) rows = samePartner;
    var withStatus = rows.filter(function (p) {
      return trimStr(rowVal(p, 'PROGRAM_STATUS'));
    });
    return (withStatus.length ? withStatus : rows)[0];
  }

  function dashboardExceptions() {
    if (global.OpsCommandCenter && typeof global.OpsCommandCenter.getExceptions === 'function') {
      return global.OpsCommandCenter.getExceptions() || [];
    }
    return [];
  }

  function availabilityDateForProgram(prog) {
    if (!prog) return null;
    var programs = host && typeof host.getPrograms === 'function' ? (host.getPrograms() || []) : [];
    if (Join.effectiveCampaignAvailabilityDate) {
      return Join.effectiveCampaignAvailabilityDate(prog, programs, dashboardExceptions());
    }
    if (Join.dashboardAvailabilityDate) return Join.dashboardAvailabilityDate(rowVal(prog, 'FIRST_ACTIVITY'));
    return null;
  }

  function dashboardStateFromDate(date) {
    var on = Join.dashboardEnabledOn ? Join.dashboardEnabledOn(date, new Date()) : false;
    return on ? 'enabled' : 'disabled';
  }

  function attachProgramLifecycle(entries) {
    var byId = activityRowsByProgramId();
    (entries || []).forEach(function (e) {
      var prog = findProgramActivityRow(e, byId);
      if (prog) {
        e.programStatus = trimStr(rowVal(prog, 'PROGRAM_STATUS'));
        e.activeFlag = rowVal(prog, 'ACTIVE_FLAG');
        e.dashboardState = dashboardStateFromDate(availabilityDateForProgram(prog));
      } else {
        e.programStatus = '';
        e.activeFlag = '';
        e.dashboardState = 'disabled';
      }
    });
  }

  function programStatusFilterOptions() {
    var seen = {};
    var opts = [];
    (allEntries || []).forEach(function (e) {
      var label = trimStr(e.programStatus);
      if (!label) return;
      var key = statusMatchKey(label);
      if (seen[key]) return;
      seen[key] = true;
      opts.push({ value: key, label: label });
    });
    opts.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
    return opts;
  }

  function matchesProgramStatusFilter(entry, selected) {
    if (!selected || !selected.length) return true;
    var key = statusMatchKey(entry.programStatus);
    if (!key) return false;
    return selected.some(function (value) { return statusMatchKey(value) === key; });
  }

  function skewJoinKey(partition, year, solution) {
    var part = Join.compactJoinKey ? Join.compactJoinKey(partition) : trimStr(partition).toUpperCase();
    var yr = Join.campaignYearToken
      ? (Join.campaignYearToken(year) || trimStr(year).toUpperCase())
      : trimStr(year).toUpperCase();
    var camp = Join.canonicalCampaignCode
      ? (Join.canonicalCampaignCode(solution) || trimStr(solution).toUpperCase())
      : trimStr(solution).toUpperCase();
    return [part, yr, camp].join('|');
  }

  function attachEmailSkew(entries, skewRows) {
    var map = {};
    (skewRows || []).forEach(function (row) {
      var key = skewJoinKey(row.PARTITION, row.CAMPAIGN_YEAR, row.PROGRAM_SOLUTION);
      if (!key || key === '||') return;
      map[key] = {
        pct: trimStr(row.PERCENTAGE_DIFF),
        translation: trimStr(row.TRANSLATION)
      };
    });
    (entries || []).forEach(function (e) {
      var hit = map[skewJoinKey(e.partition, e.year, e.solution)];
      e.emailSkewPct = hit && hit.pct ? hit.pct : null;
      e.emailSkewTranslation = hit && hit.translation ? hit.translation : '';
    });
  }

  function attachLastDownloads(entries, dateMap) {
    (entries || []).forEach(function (e) {
      e.lastDownload = Join.lookupLastDownload
        ? Join.lookupLastDownload(e, dateMap)
        : null;
    });
  }

  function errMessage(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    return err.message || String(err);
  }

  function fetchViaDataApi(alias, fieldKeys) {
    var keys = fieldKeys || FIELD_KEYS;
    var urls = [
      '/data/v1/' + encodeURIComponent(alias) + '?limit=10000',
      '/data/v1/' + encodeURIComponent(alias)
    ];
    function tryUrl(i) {
      if (i >= urls.length) return Promise.reject(new Error(alias + ' Data API returned no rows'));
      return withTimeout(domo.get(urls[i]), 25000, alias + ' Data API').then(function (payload) {
        var rows = normalizePayloadRows(payload, keys);
        console.log('[' + alias + '] Data API OK', urls[i], '—', rows.length, 'row(s)');
        if (rows && rows.length) return rows;
        return tryUrl(i + 1);
      }).catch(function (err) {
        console.warn('[' + alias + '] Data API failed', urls[i], errMessage(err));
        return tryUrl(i + 1);
      });
    }
    return tryUrl(0);
  }

  function fetchViaSql(alias, fieldKeys) {
    var keys = fieldKeys || FIELD_KEYS;
    var sql = 'SELECT ' + keys.join(', ') + ' FROM ' + alias;
    return fetchViaSqlQuery(alias, sql, keys);
  }

  function fetchViaSqlQuery(alias, sql, keys) {
    return withTimeout(
      domo.post('/sql/v1/' + alias, sql, { contentType: 'text/plain' }),
      45000,
      alias + ' SQL API'
    ).then(function (raw) {
      if (raw && typeof raw === 'object' && !Array.isArray(raw) &&
          (raw.error || raw.status === 'error') && !raw.columns && !raw.rows) {
        throw new Error(raw.error || raw.message || alias + ' SQL error');
      }
      var rows = rowsFromSqlRaw(raw, keys);
      console.log('[' + alias + '] SQL OK —', rows.length, 'row(s)');
      return rows;
    });
  }

  function aliasesFor(alias) {
    if (alias === PROGRAM_META_ALIAS) return [PROGRAM_META_ALIAS, PROGRAM_META_DATASET_ID];
    if (alias === EMAIL_SKEW_ALIAS) return [EMAIL_SKEW_ALIAS, EMAIL_SKEW_DATASET_ID];
    if (alias === DOWNLOADS_ALIAS) return [DOWNLOADS_ALIAS, DOWNLOADS_DATASET_ID];
    return [alias];
  }

  function allowDatasetIdFallback(err) {
    return !!(global.OpsUi && OpsUi.shouldFallbackToDatasetId && OpsUi.shouldFallbackToDatasetId(err));
  }

  function fetchMappedRows(alias, fieldKeys) {
    var keys = fieldKeys || FIELD_KEYS;
    var aliases = aliasesFor(alias);
    function tryAlias(i) {
      if (i >= aliases.length) {
        return Promise.reject(new Error('No rows from ' + alias + ' (tried Data API + SQL). Map alias "' + alias + '" on this card.'));
      }
      var a = aliases[i];
      function fallbackAlias(err) {
        if (i !== 0 || !allowDatasetIdFallback(err)) return Promise.reject(err);
        return tryAlias(i + 1).catch(function (idErr) {
          var prefer = global.OpsUi && OpsUi.errorAfterDatasetIdFallback;
          return Promise.reject(prefer ? prefer(err, idErr) : idErr);
        });
      }
      return fetchViaDataApi(a, keys).then(function (rows) {
        if (rows && rows.length >= 10000) {
          return fetchViaSql(a, keys).then(function (sqlRows) {
            if (sqlRows && sqlRows.length) return sqlRows;
            return rows;
          }).catch(function () { return rows; });
        }
        return rows;
      }).catch(function (dataErr) {
        console.warn('[' + a + '] Data API exhausted — trying SQL:', errMessage(dataErr));
        return fetchViaSql(a, keys).then(function (rows) {
          if (rows && rows.length) return rows;
          console.warn('[' + a + '] SQL returned 0 rows');
          if (allowDatasetIdFallback(dataErr)) return fallbackAlias(dataErr);
          return Promise.reject(dataErr);
        }).catch(function (sqlErr) {
          console.warn('[' + a + '] SQL failed:', errMessage(sqlErr));
          if (allowDatasetIdFallback(dataErr) || allowDatasetIdFallback(sqlErr)) return fallbackAlias(sqlErr);
          return Promise.reject(dataErr);
        });
      });
    }
    return tryAlias(0);
  }

  function fetchProgramMetaRows() {
    if (typeof domo === 'undefined' || typeof domo.get !== 'function') {
      return Promise.reject(new Error('Domo SDK not available — open this app from a Domo card'));
    }
    return fetchMappedRows(PROGRAM_META_ALIAS, FIELD_KEYS);
  }

  function fetchEmailSkewRows() {
    if (typeof domo === 'undefined' || typeof domo.get !== 'function') {
      return Promise.resolve([]);
    }
    return fetchMappedRows(EMAIL_SKEW_ALIAS, EMAIL_SKEW_FIELD_KEYS).catch(function (err) {
      console.warn('[emailSkew] skipped:', errMessage(err));
      return [];
    });
  }

  function fetchLastDownloadMap() {
    function fromHost() {
      if (!host || typeof host.getDownloads !== 'function') return null;
      var existing = host.getDownloads();
      if (existing && existing.length) return summarizeDownloads(existing);
      return null;
    }

    function finish(map) {
      var hostMap = fromHost();
      if (hostMap && Object.keys(hostMap).length && Join.mergeDownloadDateMaps) {
        return Join.mergeDownloadDateMaps(map || {}, hostMap);
      }
      return map || {};
    }

    if (typeof domo === 'undefined' || typeof domo.post !== 'function') {
      return Promise.resolve(finish(fromHost()));
    }

    var aliases = aliasesFor(DOWNLOADS_ALIAS);
    var groupSqlStatements = [
      'SELECT CLIENT, PARTITION, CAMPAIGN, CY, MAX(EVENT_DATE) AS LAST_DOWNLOAD FROM {alias} GROUP BY CLIENT, PARTITION, CAMPAIGN, CY',
      'SELECT CLIENT, PARTITION, CAMPAIGN, CY, MAX(COALESCE(EVENT_DATE, DOWNLOAD_DATE)) AS LAST_DOWNLOAD FROM {alias} GROUP BY CLIENT, PARTITION, CAMPAIGN, CY'
    ];
    var groupKeys = ['CLIENT', 'PARTITION', 'CAMPAIGN', 'CY', 'LAST_DOWNLOAD'];

    function tryFullRows(i) {
      if (i >= aliases.length) return tryGroupedSql(0, 0);
      var a = aliases[i];
      return fetchViaDataApi(a, DOWNLOAD_EVENT_KEYS).catch(function () {
        return fetchViaSql(a, DOWNLOAD_EVENT_KEYS);
      }).then(function (rows) {
        var map = summarizeDownloads(rows);
        if (Object.keys(map).length) return finish(map);
        return tryFullRows(i + 1);
      }).catch(function (err) {
        console.warn('[' + a + '] full download fetch failed:', errMessage(err));
        return tryFullRows(i + 1);
      });
    }

    function tryGroupedSql(i, sqlIdx) {
      if (i >= aliases.length) {
        return fetchMappedRows(DOWNLOADS_ALIAS, DOWNLOAD_EVENT_KEYS)
          .then(function (rows) { return finish(summarizeDownloads(rows)); })
          .catch(function (err) {
            console.warn('[downloads] last-download skipped:', errMessage(err));
            return finish(fromHost());
          });
      }
      if (sqlIdx >= groupSqlStatements.length) return tryGroupedSql(i + 1, 0);
      var a = aliases[i];
      var sql = groupSqlStatements[sqlIdx].replace(/{alias}/g, a);
      return fetchViaSqlQuery(a, sql, groupKeys).then(function (rows) {
        var map = summarizeDownloads(rows);
        if (Object.keys(map).length) return finish(map);
        return tryGroupedSql(i, sqlIdx + 1);
      }).catch(function (err) {
        console.warn('[' + a + '] last-download SQL failed:', errMessage(err));
        return tryGroupedSql(i, sqlIdx + 1);
      });
    }

    return tryGroupedSql(0, 0);
  }

  function refreshLastDownloads() {
    if (!allEntries.length) return Promise.resolve();
    return fetchLastDownloadMap().then(function (map) {
      attachLastDownloads(allEntries, map);
      if (tabActive && typeof render === 'function') render();
    }).catch(function (err) {
      console.warn('[programMeta] last-download refresh failed:', errMessage(err));
    });
  }

  function yearSortKey(year) {
    var s = trimStr(year).toUpperCase();
    if (s === 'CY-ALL' || s === '—') return -1;
    var m = s.match(/^CY(\d{2})$/);
    if (m) return parseInt(m[1], 10);
    return 0;
  }

  function uniqueSorted(values, sortFn) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (v) {
      var s = trimStr(v);
      if (!s || s === '—' || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    out.sort(sortFn || function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  function clonePmFilters(src) {
    src = src || {};
    return {
      partners: (src.partners || []).slice(),
      campaigns: (src.campaigns || []).slice(),
      years: (src.years || []).slice(),
      search: src.search || '',
      returns: (src.returns || []).slice(),
      map: (src.map || []).slice(),
      dashboards: (src.dashboards || []).slice(),
      lastDownload: (src.lastDownload || []).slice(),
      statuses: (src.statuses || []).slice()
    };
  }

  function portalPartnerAllow() {
    if (!host || typeof host.getFilters !== 'function') return null;
    var partners = host.getFilters().portalPartners;
    if (!partners || !partners.length) return null;
    var allow = {};
    partners.forEach(function (p) { allow[String(p).toLowerCase()] = true; });
    return allow;
  }

  function scopedEntries() {
    var allow = portalPartnerAllow();
    if (!allow) return allEntries;
    return allEntries.filter(function (e) {
      return allow[String(e.partition || '').toLowerCase()];
    });
  }

  /** Same partner list as Partner Data Health (programs + status + cascade). */
  function hubPartnerFilterOptions() {
    if (host && typeof host.getPartnerFilterOptions === 'function') {
      return host.getPartnerFilterOptions() || [];
    }
    return uniqueSorted(scopedEntries().map(function (e) { return e.partition; }));
  }

  function matchesSelected(value, selected) {
    if (!selected || !selected.length) return true;
    return selected.indexOf(value) >= 0;
  }

  function uniqueYears(entries) {
    return uniqueSorted((entries || []).map(function (e) { return e.year; }), function (a, b) {
      return yearSortKey(b) - yearSortKey(a);
    });
  }

  function optionValue(opt) {
    return opt && typeof opt === 'object' ? String(opt.value) : String(opt);
  }

  function optionLabel(opt) {
    return opt && typeof opt === 'object' ? String(opt.label) : String(opt);
  }

  var pmMenuSearchQueries = {};
  var PM_MENU_SEARCH_PLACEHOLDER = 'Search…';

  function applyPmMenuSearchFilter(menuEl) {
    if (!menuEl) return;
    var q = trimStr(pmMenuSearchQueries[menuEl.id]).toLowerCase();
    menuEl.querySelectorAll('.multi-select-option').forEach(function (row) {
      var textEl = row.querySelector('span');
      var label = textEl ? trimStr(textEl.textContent).toLowerCase() : '';
      row.classList.toggle('is-hidden', q && label.indexOf(q) < 0);
    });
  }

  function clearPmMenuSearchQueries() {
    pmMenuSearchQueries = {};
  }

  function updateFilterLabel(key, selected, allLabel, noun, options) {
    var el = filterEls[key] && filterEls[key].label;
    if (!el) return;
    if (key === 'statuses') {
      var statusSel = selected || [];
      if (!statusSel.length ||
          (Join.isAllProgramStatusesSelected && Join.isAllProgramStatusesSelected(statusSel))) {
        el.textContent = allLabel;
        return;
      }
      if (statusSel.length === 1) {
        var statusMatch = null;
        (options || []).forEach(function (opt) {
          if (!statusMatch && optionValue(opt) === statusSel[0]) statusMatch = opt;
        });
        el.textContent = statusMatch ? optionLabel(statusMatch) : statusSel[0];
        return;
      }
      var statusNames = statusSel.map(function (value) {
        var hit = null;
        (options || []).forEach(function (opt) {
          if (!hit && optionValue(opt) === value) hit = opt;
        });
        return hit ? optionLabel(hit) : value;
      });
      el.textContent = statusNames.join(', ');
      return;
    }
    if (!selected.length) {
      el.textContent = allLabel;
      return;
    }
    if (selected.length === 1) {
      var match = null;
      (options || []).forEach(function (opt) {
        if (!match && optionValue(opt) === selected[0]) match = opt;
      });
      el.textContent = match ? optionLabel(match) : selected[0];
      return;
    }
    el.textContent = selected.length + ' ' + noun + ' selected';
  }

  function appendPmClearSection(menu, selectedCount, onClear) {
    var actions = document.createElement('div');
    actions.className = 'multi-select-actions';
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'multi-select-clear-section';
    clearBtn.textContent = 'Clear section';
    clearBtn.disabled = !selectedCount;
    clearBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      onClear();
    });
    actions.appendChild(clearBtn);
    menu.appendChild(actions);
  }

  function renderFilterMenu(key, options, selected, onChange, emptyLabel) {
    var menu = filterEls[key] && filterEls[key].menu;
    if (!menu) return;
    var prevQuery = pmMenuSearchQueries[menu.id] || '';
    var mount = window.OpsFilterMenu && window.OpsFilterMenu.mountPinnedHead
      ? window.OpsFilterMenu.mountPinnedHead(menu, {
        placeholder: PM_MENU_SEARCH_PLACEHOLDER,
        searchValue: prevQuery,
        selectedCount: selected.length,
        onSearchInput: function () {
          pmMenuSearchQueries[menu.id] = mount.searchInput.value;
          applyPmMenuSearchFilter(menu);
        },
        onClear: function () {
          filterDraft[key] = [];
          pmMenuSearchQueries[menu.id] = '';
          onChange();
        }
      })
      : null;
    var optionsParent = mount ? mount.optionsEl : menu;
    if (!mount) menu.innerHTML = '';
    if (!options.length) {
      var empty = document.createElement('div');
      empty.className = 'multi-select-empty';
      empty.textContent = emptyLabel || 'No options';
      optionsParent.appendChild(empty);
      return;
    }
    var optionsHtml = options.map(function (opt) {
      var value = optionValue(opt);
      var label = optionLabel(opt);
      var checked = selected.indexOf(value) >= 0 ? ' checked' : '';
      return '<label class="multi-select-option">' +
        '<input type="checkbox" value="' + escapeHtml(value) + '"' + checked + ' />' +
        '<span>' + escapeHtml(label) + '</span></label>';
    }).join('');
    var wrap = document.createElement('div');
    wrap.innerHTML = optionsHtml;
    while (wrap.firstChild) optionsParent.appendChild(wrap.firstChild);
    var inputs = optionsParent.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('change', function () {
        var value = this.value;
        var list = filterDraft[key].slice();
        var idx = list.indexOf(value);
        if (this.checked) {
          if (idx < 0) list.push(value);
        } else if (idx >= 0) {
          list.splice(idx, 1);
        }
        filterDraft[key] = list;
        onChange();
      });
    }
    applyPmMenuSearchFilter(menu);
  }

  var PM_SCOPE_FILTER_KEYS = {
    partners: true,
    campaigns: true,
    years: true,
    statuses: true
  };

  var PM_SCOPE_MENU_IDS = {
    pmPartnerMenu: true,
    pmCampaignMenu: true,
    pmYearMenu: true,
    pmStatusMenu: true
  };

  function isPmScopeKey(key) {
    return !!PM_SCOPE_FILTER_KEYS[key];
  }

  function isPmScopeMenu(menu) {
    return !!(menu && menu.id && PM_SCOPE_MENU_IDS[menu.id]);
  }

  function pmScopeClusterEl() {
    if (chapterRoot) {
      var scoped = chapterRoot.querySelector('#pmScopeFilterCluster');
      if (scoped) return scoped;
    }
    return document.getElementById('pmScopeFilterCluster');
  }

  function isPmScopeClusterOpen() {
    var cluster = pmScopeClusterEl();
    return !!(cluster && cluster.classList.contains('is-linked-open'));
  }

  function setPmScopeMenusOpen(open) {
    ['partners', 'campaigns', 'years', 'statuses'].forEach(function (key) {
      var pair = filterEls[key];
      if (!pair || !pair.menu || !pair.trigger) return;
      pair.menu.hidden = !open;
      pair.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (pair.field) pair.field.classList.toggle('is-open', open);
    });
    var cluster = pmScopeClusterEl();
    if (cluster) cluster.classList.toggle('is-linked-open', open);
    var bar = chapterRoot ? chapterRoot.querySelector('.campaign-filters') : null;
    if (bar) bar.classList.toggle('is-scope-filters-open', open);
  }

  function closePmMenus(exceptMenu) {
    var scopeHold = exceptMenu && isPmScopeMenu(exceptMenu);
    Object.keys(filterEls).forEach(function (key) {
      var pair = filterEls[key];
      if (!pair.menu || pair.menu === exceptMenu) return;
      if (scopeHold && isPmScopeMenu(pair.menu)) return;
      pair.menu.hidden = true;
      if (pair.trigger) pair.trigger.setAttribute('aria-expanded', 'false');
      if (pair.field) pair.field.classList.remove('is-open');
    });
    if (!scopeHold) setPmScopeMenusOpen(false);
  }

  function togglePmMenu(key) {
    var pair = filterEls[key];
    if (!pair.trigger || !pair.menu) return;
    if (isPmScopeKey(key)) {
      if (isPmScopeClusterOpen()) {
        setPmScopeMenusOpen(false);
        return;
      }
      closePmMenus(pair.menu);
      setPmScopeMenusOpen(true);
      return;
    }
    var open = pair.menu.hidden;
    setPmScopeMenusOpen(false);
    closePmMenus(open ? pair.menu : null);
    pair.menu.hidden = !open;
    pair.trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (pair.field) pair.field.classList.toggle('is-open', open);
  }

  function pmMatchesPartners(value, selected) {
    if (Join.matchesSelectedPartners) return Join.matchesSelectedPartners(value, selected);
    return matchesSelected(value, selected);
  }

  function pmMatchesCampaigns(value, selected) {
    if (Join.matchesSelectedCampaigns) return Join.matchesSelectedCampaigns(value, selected);
    return matchesSelected(value, selected);
  }

  function populatePmFilterMenus() {
    var rows = scopedEntries();
    var draft = filterDraft;
    var cascade = Join.cascadeFilterOptions
      ? Join.cascadeFilterOptions(rows, {
        partners: draft.partners,
        campaigns: draft.campaigns,
        years: draft.years
      }, {
        partition: function (e) { return e.partition; },
        campaign: function (e) { return e.solution; },
        year: function (e) { return e.year; }
      })
      : null;

    var partnerSource = cascade ? cascade.partnerRows : rows;
    var campaignSource = cascade ? cascade.campaignRows : rows;
    var yearSource = cascade ? cascade.yearRows : rows;
    var multiPartner = !!(cascade && cascade.multiPartnerScope);
    var noSharedCampaigns = (Join && Join.NO_SHARED_CAMPAIGNS_LABEL) || 'No shared campaigns';
    var noSharedYears = (Join && Join.NO_SHARED_YEARS_LABEL) || 'No shared campaign years';

    var partners = hubPartnerFilterOptions();
    if (!partners.length && host && typeof host.getPartnerFilterOptions === 'function') {
      partners = [];
    } else if (!partners.length) {
      partners = uniqueSorted(partnerSource.map(function (e) { return e.partition; }));
    }
    draft.partners = draft.partners.filter(function (p) {
      return partners.some(function (opt) { return pmMatchesPartners(p, [opt]); });
    });
    var campaigns = cascade && cascade.sharedCampaignOptions
      ? uniqueSorted(cascade.sharedCampaignOptions)
      : uniqueSorted(campaignSource.map(function (e) { return e.solution; }));
    draft.campaigns = draft.campaigns.filter(function (c) {
      return campaigns.some(function (opt) { return pmMatchesCampaigns(c, [opt]); });
    });
    var years = cascade && cascade.sharedYearOptions
      ? uniqueSorted(cascade.sharedYearOptions, function (a, b) { return yearSortKey(b) - yearSortKey(a); })
      : uniqueYears(yearSource);
    draft.years = draft.years.filter(function (y) { return years.indexOf(y) >= 0; });
    if (!didDefaultYear && years.length && !draft.years.length && !filterApplied.years.length) {
      draft.years = [years[0]];
      filterApplied.years = [years[0]];
      didDefaultYear = true;
    }
    renderFilterMenu('partners', partners, draft.partners, populatePmFilterMenus);
    updateFilterLabel('partners', draft.partners, 'All partners', 'partners');
    renderFilterMenu('campaigns', campaigns, draft.campaigns, populatePmFilterMenus, multiPartner ? noSharedCampaigns : undefined);
    updateFilterLabel('campaigns', draft.campaigns, 'All campaigns', 'campaigns');
    renderFilterMenu('years', years, draft.years, populatePmFilterMenus, multiPartner ? noSharedYears : undefined);
    updateFilterLabel('years', draft.years, 'All years', 'years');
    renderFilterMenu('returns', ENABLED_OPTIONS, draft.returns, function () {
      updateFilterLabel('returns', filterDraft.returns, 'Any', 'statuses', ENABLED_OPTIONS);
    });
    updateFilterLabel('returns', draft.returns, 'Any', 'statuses', ENABLED_OPTIONS);
    renderFilterMenu('map', ENABLED_OPTIONS, draft.map, function () {
      updateFilterLabel('map', filterDraft.map, 'Any', 'statuses', ENABLED_OPTIONS);
    });
    updateFilterLabel('map', draft.map, 'Any', 'statuses', ENABLED_OPTIONS);
    renderFilterMenu('dashboards', ENABLED_OPTIONS, draft.dashboards, function () {
      updateFilterLabel('dashboards', filterDraft.dashboards, 'Any', 'statuses', ENABLED_OPTIONS);
    });
    updateFilterLabel('dashboards', draft.dashboards, 'Any', 'statuses', ENABLED_OPTIONS);
    renderFilterMenu('lastDownload', LAST_DOWNLOAD_OPTIONS, draft.lastDownload, function () {
      updateFilterLabel('lastDownload', filterDraft.lastDownload, 'Any date', 'windows', LAST_DOWNLOAD_OPTIONS);
    });
    updateFilterLabel('lastDownload', draft.lastDownload, 'Any date', 'windows', LAST_DOWNLOAD_OPTIONS);
    var statusOptions = programStatusFilterOptions();
    renderFilterMenu('statuses', statusOptions, draft.statuses, function () {
      updateFilterLabel('statuses', filterDraft.statuses, 'All statuses', 'statuses', statusOptions);
    });
    updateFilterLabel('statuses', draft.statuses, 'All statuses', 'statuses', statusOptions);

    if (isPmScopeClusterOpen()) setPmScopeMenusOpen(true);
  }

  function applyPmFilters() {
    if (searchFilterEl) filterDraft.search = trimStr(searchFilterEl.value);
    filterApplied = clonePmFilters(filterDraft);
    didDefaultYear = false;
    closePmMenus(null);
    populatePmFilterMenus();
    render();
  }

  function resetPmFilters() {
    clearPmMenuSearchQueries();
    closePmMenus(null);
    var years = uniqueYears(allEntries);
    filterDraft = emptyPmFilters();
    filterDraft.years = years.length ? [years[0]] : [];
    if (searchFilterEl) searchFilterEl.value = '';
    [filterMarketRevisionMissingEl, filterPrintNotReadyEl].forEach(function (el) {
      if (el) el.checked = false;
    });
    didDefaultYear = true;
    filterApplied = clonePmFilters(filterDraft);
    if (host && typeof host.getFilters === 'function') {
      var hubFilters = host.getFilters() || {};
      var hubHasScope = (hubFilters.scopePartners && hubFilters.scopePartners.length) ||
        (hubFilters.partners && hubFilters.partners.length) ||
        (hubFilters.campaigns && hubFilters.campaigns.length) ||
        (hubFilters.years && hubFilters.years.length);
      if (hubHasScope) {
        pmHubScopeSig = '';
        applyHostFilters();
      } else {
        pmHubScopeSig = hubScopeSig(hubFilters);
      }
    }
    populatePmFilterMenus();
    render();
  }

  function isChecked(el) {
    return !!(el && el.checked);
  }

  function getFilteredEntries() {
    var partners = filterApplied.partners || [];
    var campaigns = filterApplied.campaigns || [];
    var years = filterApplied.years || [];
    var q = trimStr(filterApplied.search).toLowerCase();
    var returnsSel = filterApplied.returns || [];
    var mapSel = filterApplied.map || [];
    var dashboardSel = filterApplied.dashboards || [];
    var downloadSel = filterApplied.lastDownload || [];
    var statusSel = filterApplied.statuses || [];
    var marketRevisionMissing = isChecked(filterMarketRevisionMissingEl);
    var printNotReady = isChecked(filterPrintNotReadyEl);
    var portalAllow = portalPartnerAllow();

    return allEntries.filter(function (e) {
      if (portalAllow && !portalAllow[e.partition.toLowerCase()]) return false;
      if (partners.length) {
        if (Join.matchesSelectedPartners) {
          if (!Join.matchesSelectedPartners(e.partition, partners)) return false;
        } else if (partners.indexOf(e.partition) < 0) return false;
      }
      if (campaigns.length) {
        if (Join.matchesSelectedCampaigns) {
          if (!Join.matchesSelectedCampaigns(e.solution, campaigns)) return false;
        } else if (campaigns.indexOf(e.solution) < 0) return false;
      }
      if (years.length) {
        if (Join.matchesSelectedYears) {
          if (!Join.matchesSelectedYears(e.year, years)) return false;
        } else if (years.indexOf(e.year) < 0) return false;
      }
      if (q) {
        var hay = (e.partition + ' ' + e.solution + ' ' + e.programId + ' ' + e.year).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      if (!matchesEnabledFilter(e.returnsState, returnsSel)) return false;
      if (!matchesEnabledFilter(e.mapState, mapSel)) return false;
      if (!matchesEnabledFilter(e.dashboardState, dashboardSel)) return false;
      if (!matchesDownloadFilter(e, downloadSel)) return false;
      if (!matchesProgramStatusFilter(e, statusSel)) return false;
      if (marketRevisionMissing && e.marketRevision) return false;
      if (printNotReady && e.ready) return false;
      return true;
    });
  }

  function matchesEnabledFilter(state, selected) {
    if (!selected || !selected.length) return true;
    var on = state === 'enabled';
    return selected.some(function (id) {
      if (id === 'enabled') return on;
      if (id === 'disabled') return !on;
      return false;
    });
  }

  function matchesDownloadFilter(entry, selected) {
    if (!selected || !selected.length) return true;
    var days = daysSince(entry.lastDownload);
    return selected.some(function (id) {
      if (id === 'never') return entry.lastDownload == null;
      if (id === 'downloaded') return entry.lastDownload != null;
      if (id === 'd7') return days != null && days <= 7;
      if (id === 'd14') return days != null && days <= 14;
      if (id === 'd30') return days != null && days <= 30;
      if (id === 'older') return days != null && days > 30;
      return false;
    });
  }

  function compareName(a, b) {
    var p = a.partition.localeCompare(b.partition, undefined, { sensitivity: 'base' });
    if (p) return p;
    var y = yearSortKey(b.year) - yearSortKey(a.year);
    if (y) return y;
    return a.solution.localeCompare(b.solution, undefined, { sensitivity: 'base' });
  }

  function compareSolution(a, b) {
    var s = a.solution.localeCompare(b.solution, undefined, { sensitivity: 'base' });
    if (s) return s;
    return compareName(a, b);
  }

  function emailSkewNumeric(entry) {
    var s = trimStr(entry && entry.emailSkewPct);
    if (!s) return null;
    var n = Number(String(s).replace(/%/g, '').replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }

  function emailSkewPillClass(entry) {
    var n = emailSkewNumeric(entry);
    if (n == null) return 'is-missing';
    return n < 1 ? 'is-green' : 'is-red';
  }

  function compareEmailSkew(a, b) {
    var na = emailSkewNumeric(a);
    var nb = emailSkewNumeric(b);
    if (na == null && nb == null) return compareName(a, b);
    if (na == null) return 1;
    if (nb == null) return -1;
    if (nb !== na) return nb - na;
    return compareName(a, b);
  }

  function compareBySort(a, b) {
    if (sortBy === 'solution') return compareSolution(a, b);
    if (sortBy === 'skew') return compareEmailSkew(a, b);
    return compareName(a, b);
  }

  function sortEntries(entries) {
    var arr = entries.slice();
    arr.sort(compareBySort);
    return arr;
  }

  function groupEntries(entries) {
    var sorted = sortEntries(entries);
    var sections = [];
    var map = {};

    function ensureSection(key, label) {
      if (!map[key]) {
        map[key] = { key: key, label: label, entries: [] };
        sections.push(map[key]);
      }
      return map[key];
    }

    if (groupBy === 'none') {
      return [{ key: 'all', label: '', entries: sorted, flat: true }];
    }

    if (groupBy === 'year') {
      sorted.forEach(function (e) {
        ensureSection(e.year, e.year).entries.push(e);
      });
      sections.sort(function (a, b) {
        return yearSortKey(b.key) - yearSortKey(a.key);
      });
      sections.forEach(function (sec) {
        sec.entries.sort(compareBySort);
      });
    } else {
      sorted.forEach(function (e) {
        ensureSection(e.partition, e.partition).entries.push(e);
      });
      sections.sort(function (a, b) {
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      });
      sections.forEach(function (sec) {
        sec.entries.sort(compareBySort);
      });
    }

    return sections;
  }

  function truncateUrl(url, maxLen) {
    var s = trimStr(url);
    if (!s) return '';
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
  }

  function ensureHttpUrl(url) {
    var s = trimStr(url);
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  function statusValueHtml(text, cls) {
    return '<span class="meta-status-value ' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function marketValueHtml(value) {
    if (!value) return statusValueHtml('Missing', 'is-missing');
    return statusValueHtml(value, '');
  }

  function formatEmailSkewPct(raw) {
    var s = trimStr(raw);
    if (!s) return '';
    if (/%\s*$/.test(s)) return s;
    var n = Number(String(s).replace(/,/g, ''));
    if (!isFinite(n)) return s;
    return n.toFixed(1) + '%';
  }

  function emailSkewRowHtml(entry) {
    var pct = formatEmailSkewPct(entry.emailSkewPct);
    var translation = trimStr(entry.emailSkewTranslation);
    if (!pct) return '';
    var aria = ' aria-label="Email Skew ' + escapeHtml(pct) +
      (translation ? '. ' + escapeHtml(translation) : '') + '"';
    var translationHtml = translation
      ? '<p class="meta-status-translation">' + escapeHtml(translation) + '</p>'
      : '';
    return (
      '<li class="meta-status-skew" tabindex="0"' + aria + '>' +
        '<div class="meta-status-row">' +
          '<span class="meta-status-label">Email Skew</span>' +
          '<span class="meta-status-value is-pill ' + emailSkewPillClass(entry) + '">' + escapeHtml(pct) + '</span>' +
        '</div>' +
        translationHtml +
      '</li>'
    );
  }

  function dataQualityHtml(entry) {
    if (!entry.showDataQuality) return '';
    var status = entry.dqStatus || { label: 'Pending', tone: 'red' };
    var notes = trimStr(entry.dqNotes);
    var notesHtml = notes
      ? '<p class="meta-dq-notes">' + escapeHtml(notes) + '</p>'
      : '';
    return (
      '<li class="meta-dq">' +
        '<div class="meta-dq-head">' +
          '<span class="meta-status-label">Data Quality</span>' +
          '<span class="meta-status-value is-pill is-' + status.tone + '">' + escapeHtml(status.label) + '</span>' +
        '</div>' +
        notesHtml +
      '</li>'
    );
  }

  function lastDownloadRowHtml(entry) {
    if (!entry.lastDownload) {
      return '<li><span class="meta-status-label">Last download</span>' +
        statusValueHtml('Never downloaded', 'is-disabled') + '</li>';
    }
    var days = daysSince(entry.lastDownload);
    var cls = days != null && days <= 30 ? 'is-enabled' : 'is-stale';
    return '<li><span class="meta-status-label">Last download</span>' +
      statusValueHtml(formatDate(entry.lastDownload), cls) + '</li>';
  }

  function cardHtml(entry) {
    var footerState = entry.stateCode || 'No state';
    var landingHtml;
    if (entry.landingPage) {
      var href = escapeHtml(ensureHttpUrl(entry.landingPage));
      var label = escapeHtml(truncateUrl(entry.landingPage, 42));
      landingHtml = '<a class="ftf-footer-link" href="' + href + '" target="_blank" rel="noopener noreferrer" title="' +
        escapeHtml(entry.landingPage) + '">' + label + '</a>';
    } else {
      landingHtml = '<span>No landing page</span>';
    }

    var title =
      escapeHtml(entry.partition) +
      '<span class="ftf-card-title-sep">·</span>' +
      escapeHtml(entry.solution) +
      '<span class="ftf-card-title-sep">·</span>' +
      escapeHtml(entry.year);

    var programIdHtml = entry.programId
      ? '<div class="ftf-card-program-id" title="Program ID"><span class="ftf-card-program-id-label">Program ID</span> ' +
          escapeHtml(entry.programId) + '</div>'
      : '<div class="ftf-card-program-id is-missing" title="Program ID"><span class="ftf-card-program-id-label">Program ID</span> —</div>';

    return (
      '<article class="ftf-card" data-key="' + escapeHtml(entry.key) + '">' +
        '<header class="ftf-card-head">' +
          '<div class="ftf-card-client">' + title + '</div>' +
          programIdHtml +
        '</header>' +
        '<ul class="meta-status-list">' +
          '<li><span class="meta-status-label">Status</span>' +
            (entry.programStatus
              ? statusValueHtml(entry.programStatus, 'is-pill is-unknown')
              : statusValueHtml('—', 'is-missing')) + '</li>' +
          '<li><span class="meta-status-label">Returns</span>' +
            statusValueHtml(triStateLabel(entry.returnsState), triStateClass(entry.returnsState)) + '</li>' +
          '<li><span class="meta-status-label">MAP</span>' +
            statusValueHtml(triStateLabel(entry.mapState), triStateClass(entry.mapState)) + '</li>' +
          '<li title="Campaign dashboard is available 14 days after this program’s first activity."><span class="meta-status-label">Dashboards</span>' +
            statusValueHtml(triStateLabel(entry.dashboardState), triStateClass(entry.dashboardState)) + '</li>' +
          lastDownloadRowHtml(entry) +
          '<li><span class="meta-status-label">Market Revision</span>' +
            marketValueHtml(entry.marketRevision) + '</li>' +
          '<li><span class="meta-status-label">Market Tier</span>' +
            marketValueHtml(entry.marketTier) + '</li>' +
          '<li><span class="meta-status-label">Print Ready</span>' +
            statusValueHtml(printReadyLabel(entry.ready), printReadyClass(entry.ready)) + '</li>' +
          emailSkewRowHtml(entry) +
          dataQualityHtml(entry) +
        '</ul>' +
        '<footer class="ftf-card-footer">' +
          '<span><span class="ftf-footer-key">State</span> ' + escapeHtml(footerState) + '</span>' +
          landingHtml +
        '</footer>' +
      '</article>'
    );
  }

  function sectionHtml(section) {
    var head = (section.flat || !section.label)
      ? ''
      : (
        '<div class="campaign-section">' +
          '<div class="campaign-section-title">' + escapeHtml(section.label) + '</div>' +
          '<div class="campaign-section-count">' + section.entries.length +
            (section.entries.length === 1 ? ' campaign' : ' campaigns') + '</div>' +
        '</div>'
      );
    return head + section.entries.map(cardHtml).join('');
  }

  function updateSubtitle(filtered) {
    var readyCount = filtered.filter(function (e) { return e.ready; }).length;
    var downloadedCount = filtered.filter(function (e) { return e.lastDownload; }).length;
    var msg =
      filtered.length.toLocaleString() + ' campaigns · ' +
      readyCount.toLocaleString() + ' ready for print · ' +
      downloadedCount.toLocaleString() + ' downloaded' +
      (filtered.length !== allEntries.length
        ? ' (of ' + allEntries.length.toLocaleString() + ' total)'
        : '');
    if (subtitleEl) subtitleEl.textContent = msg;
    if (statusEl) {
      if (!allEntries.length && (embedState.loading || (!embedState.ready && !embedState.error))) {
        if (window.OpsUi && OpsUi.setStatusEl) OpsUi.setStatusEl(statusEl, 'Loading program meta…', 'loading');
      } else if (!allEntries.length && embedState.error) {
        if (window.OpsUi && OpsUi.setStatusEl) OpsUi.setStatusEl(statusEl, embedState.error, 'error');
      } else if (!allEntries.length) {
        if (window.OpsUi && OpsUi.setStatusEl) OpsUi.setStatusEl(statusEl, 'No program meta rows loaded.', 'error');
      } else if (window.OpsUi && OpsUi.setStatusEl) {
        OpsUi.setStatusEl(statusEl, msg);
      } else {
        statusEl.textContent = msg;
        statusEl.classList.remove('is-error', 'is-loading');
      }
    }
  }

  function updateAdvancedFiltersHint() {
    /* Filter chips only — no row highlight chrome. */
  }

  function render() {
    if (!gridEl) return;
    if (allEntries.length) attachProgramLifecycle(allEntries);
    updateAdvancedFiltersHint();
    var filtered = getFilteredEntries();
    updateSubtitle(filtered);

    if (!filtered.length) {
      if (!allEntries.length) {
        if (embedState.loading || (!embedState.ready && !embedState.error)) {
          gridEl.innerHTML = window.OpsUi && OpsUi.gridLoadingHtml
            ? OpsUi.gridLoadingHtml('Loading program meta')
            : '<div class="ftf-grid-empty">Loading…</div>';
          setStatus('Loading program meta…', 'loading');
        } else {
          gridEl.innerHTML = '<div class="ftf-grid-empty">No program meta rows loaded. On this card, map <strong>programMeta</strong> and <strong>emailSkew</strong>, then hard-refresh.</div>';
          setStatus(embedState.error || 'No program meta rows available.', 'error');
        }
      } else {
        gridEl.innerHTML = '<div class="ftf-grid-empty">No campaigns match the current filters.</div>';
        setStatus('0 campaigns shown · adjust filters');
      }
      return;
    }

    var sections = groupEntries(filtered);
    gridEl.innerHTML = sections.map(sectionHtml).join('');

    var readyCount = filtered.filter(function (e) { return e.ready; }).length;
    var downloadedCount = filtered.filter(function (e) { return e.lastDownload; }).length;
    var groupLabel = groupBy === 'year' ? 'years' : groupBy === 'partition' ? 'partitions' : '';
    setStatus(
      filtered.length.toLocaleString() + ' campaigns · ' +
      readyCount.toLocaleString() + ' ready · ' +
      downloadedCount.toLocaleString() + ' downloaded' +
      (groupLabel ? ' · ' + sections.length.toLocaleString() + ' ' + groupLabel : '')
    );
  }

  function setSegmentedActive(container, attr, value) {
    if (!container) return;
    var buttons = container.querySelectorAll('.segment[' + attr + ']');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var active = btn.getAttribute(attr) === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function chapterRefresh() {
    if (host && typeof host.onChapterRefresh === 'function') host.onChapterRefresh();
  }

  function hubScopeSig(f) {
    if (host && typeof host.getScopeSignature === 'function') return host.getScopeSignature(f);
    f = f || {};
    var p = (f.scopePartners || f.partners || []).slice().sort().join('\0');
    var c = (f.campaigns || []).slice().sort().join('\0');
    var y = (f.years || []).slice().sort().join('\0');
    return p + '|' + c + '|' + y;
  }

  function applyHostFilters() {
    if (!host || typeof host.getFilters !== 'function') return false;
    var f = host.getFilters() || {};
    var sig = hubScopeSig(f);
    if (sig === pmHubScopeSig) return false;
    pmHubScopeSig = sig;

    var scope = f.scopePartners || [];
    var entries = scopedEntries();
    var partnerOptions = hubPartnerFilterOptions();
    var partnerPick = Join.pickKnownPartners ? Join.pickKnownPartners(scope, partnerOptions) : scope.slice();

    var campPick = [];
    if (f.campaigns && f.campaigns.length) {
      var solutions = uniqueSorted(entries.map(function (e) { return e.solution; }));
      solutions.forEach(function (s) {
        if (Join.matchesSelectedCampaigns && Join.matchesSelectedCampaigns(s, f.campaigns) && campPick.indexOf(s) < 0) {
          campPick.push(s);
        }
      });
    }

    var yearPick = filterApplied.years.slice();
    var hubScopeEmpty = !scope.length &&
      !(f.campaigns && f.campaigns.length) &&
      !(f.years && f.years.length);
    if (f.years && f.years.length) {
      yearPick = [];
      var yearOpts = uniqueYears(entries);
      yearOpts.forEach(function (opt) {
        if (Join.matchesSelectedYears && Join.matchesSelectedYears(opt, f.years) && yearPick.indexOf(opt) < 0) {
          yearPick.push(opt);
        }
      });
      if (yearPick.length) didDefaultYear = false;
    } else if (hubScopeEmpty || f.hubScopeSuppressed) {
      yearPick = [];
    } else if (didDefaultYear && !filterApplied.years.length) {
      var defaultYears = uniqueYears(entries);
      yearPick = defaultYears.length ? [defaultYears[0]] : [];
    }

    filterDraft.partners = partnerPick.slice();
    filterDraft.campaigns = campPick.slice();
    filterDraft.years = yearPick.slice();
    filterApplied = clonePmFilters(filterDraft);
    populatePmFilterMenus();
    render();
    return true;
  }

  function retryableDatasetError(err) {
    return !!(global.OpsUi && OpsUi.isRetryableDatasetError && OpsUi.isRetryableDatasetError(err));
  }

  function datasetAccessError(err) {
    return !!(global.OpsUi && OpsUi.isDatasetAccessError && OpsUi.isDatasetAccessError(err));
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function loadProgramMeta(force, attempt) {
    attempt = attempt || 0;
    if (loadPromise && !force) return loadPromise;
    setAppLoading(true, attempt ? 'Reconnecting to program meta…' : 'Loading program meta…');
    setStatus(attempt ? 'Reconnecting to program meta…' : 'Loading program meta…', 'loading');

    loadPromise = Promise.resolve()
      .then(function () { return fetchProgramMetaRows(); })
      .then(function (rows) {
        allEntries = (rows || []).map(normalizeEntry).filter(function (e) {
          return !(Join.isIgnoredPartition && Join.isIgnoredPartition(e.partition));
        });
        attachProgramLifecycle(allEntries);
        populatePmFilterMenus();
        applyHostFilters();
        try {
          render();
        } catch (renderErr) {
          console.error('[programMeta] render failed', renderErr);
          setStatus('Loaded data but failed to render: ' + ((renderErr && renderErr.message) || String(renderErr)), 'error');
        }
        return Promise.all([
          fetchEmailSkewRows().catch(function (err) {
            console.warn('[emailSkew] load failed — Email Skew rows will be omitted:', err && err.message ? err.message : err);
            return [];
          }),
          fetchLastDownloadMap()
        ]);
      })
      .then(function (extra) {
        attachEmailSkew(allEntries, extra[0]);
        attachLastDownloads(allEntries, extra[1]);
        try {
          render();
        } catch (renderErr) {
          console.error('[programMeta] render failed after enrichment', renderErr);
        }
        return allEntries;
      })
      .catch(function (err) {
        console.error('[programMeta] load failed', err);
        if (attempt < 2 && tabActive && retryableDatasetError(err)) {
          return delay(700 * (attempt + 1)).then(function () {
            if (!tabActive) throw err;
            return loadProgramMeta(true, attempt + 1);
          });
        }
        allEntries = [];
        loadPromise = null;
        if (gridEl) {
          if (datasetAccessError(err)) {
            gridEl.innerHTML =
              '<div class="ftf-grid-empty">' +
                '<p><strong>Program Meta could not open its dataset just now.</strong></p>' +
                '<p>This shows up when you switch chapters while Domo is still opening the previous card. Open Program Meta again.</p>' +
                '<p>' + escapeHtml(errMessage(err)) + '</p>' +
              '</div>';
          } else {
            gridEl.innerHTML =
              '<div class="ftf-grid-empty">' +
                '<p><strong>Could not load program meta.</strong></p>' +
                '<p>On this card, map both datasets, then hard-refresh:</p>' +
                '<p><code>programMeta</code> → VW_PROGRAM_META<br>' +
                '<code>efa412ee-ca5b-483a-9cf0-f7eca03034ed</code></p>' +
                '<p><code>emailSkew</code> → EMAIL_SKEW_STATUS<br>' +
                '<code>c9aced4a-18bd-43df-aa45-df993c868726</code></p>' +
                '<p>' + escapeHtml(errMessage(err)) + '</p>' +
              '</div>';
          }
        }
        setStatus('Could not load program meta: ' + errMessage(err), 'error');
        throw err;
      })
      .then(function (result) {
        setAppLoading(false);
        embedState.ready = true;
        embedState.error = '';
        chapterRefresh();
        return result;
      }, function (err) {
        setAppLoading(false);
        embedState.error = errMessage(err);
        chapterRefresh();
        throw err;
      });

    return loadPromise;
  }

  function bindControlsOnce() {
    if (controlsBound) return;
    controlsBound = true;
    if (groupByButtonsEl) {
      groupByButtonsEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-group-by]');
        if (!btn) return;
        groupBy = btn.getAttribute('data-group-by') || 'year';
        setSegmentedActive(groupByButtonsEl, 'data-group-by', groupBy);
        render();
      });
    }
    if (sortButtonsEl) {
      sortButtonsEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-sort]');
        if (!btn) return;
        sortBy = btn.getAttribute('data-sort') || 'name';
        setSegmentedActive(sortButtonsEl, 'data-sort', sortBy);
        render();
      });
    }
    if (applyBtnEl) applyBtnEl.addEventListener('click', applyPmFilters);
    if (resetBtnEl) resetBtnEl.addEventListener('click', resetPmFilters);
    Object.keys(filterEls).forEach(function (key) {
      var pair = filterEls[key];
      if (!pair.trigger || !pair.menu) return;
      pair.menu.addEventListener('click', function (ev) { ev.stopPropagation(); });
      pair.trigger.addEventListener('click', function (ev) {
        ev.stopPropagation();
        togglePmMenu(key);
      });
    });
    document.addEventListener('click', function (ev) {
      if (!tabActive || !chapterRoot || !chapterRoot.contains(ev.target)) return;
      var scopeCluster = pmScopeClusterEl();
      if (scopeCluster && scopeCluster.contains(ev.target)) return;
      var wrap = ev.target.closest && ev.target.closest('.field-multi');
      if (wrap && chapterRoot.contains(wrap)) return;
      closePmMenus(null);
    });
    if (searchFilterEl) {
      searchFilterEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          applyPmFilters();
        }
      });
    }
    [filterMarketRevisionMissingEl, filterPrintNotReadyEl].forEach(function (el) {
      if (el) el.addEventListener('change', render);
    });
  }

  function bootProgramMeta() {
    bindEls();
    bindControlsOnce();
    if (embedState.ready && allEntries.length) {
      applyHostFilters();
      render();
      return Promise.resolve(allEntries);
    }
    return loadProgramMeta(false);
  }

  if (typeof domo !== 'undefined' && typeof domo.onDataUpdate === 'function') {
    domo.onDataUpdate(function (alias) {
      console.log('[domo] onDataUpdate:', alias);
      if (alias &&
          alias !== PROGRAM_META_ALIAS && alias !== PROGRAM_META_DATASET_ID &&
          alias !== EMAIL_SKEW_ALIAS && alias !== EMAIL_SKEW_DATASET_ID &&
          alias !== DOWNLOADS_ALIAS && alias !== DOWNLOADS_DATASET_ID) return;
      loadProgramMeta(true).catch(function () {});
    });
  }

  global.PartnerProgramMetaTab = {
    init: function (h) {
      host = h;
      chapterRoot = document.getElementById('programMetaChapter');
      bindEls();
    },
    activate: function () {
      tabActive = true;
      bindEls();
      if (!embedState.ready && !embedState.loading) {
        return bootProgramMeta().catch(function () { /* shown in the chapter */ });
      }
      applyHostFilters();
      if (embedState.ready && typeof render === 'function') render();
    },
    deactivate: function () {
      tabActive = false;
    },
    refresh: function () {
      if (!tabActive) return;
      embedState.ready = false;
      if (typeof state !== 'undefined' && state.loadPromise) state.loadPromise = null;
      if (typeof loadPromise !== 'undefined') loadPromise = null;
      return bootProgramMeta();
    },
    refreshLastDownloads: refreshLastDownloads,
    onFiltersChanged: function () {
      if (!embedState.ready) return;
      applyHostFilters();
      populatePmFilterMenus();
      if (typeof render === 'function') render();
    },
    handleClick: function (ev) {
      return !!(tabActive && chapterRoot && chapterRoot.contains(ev.target));
    },
    isLoading: function () { return embedState.loading; },
    getRowCount: function () {
      return embedState.ready ? getFilteredEntries().length : 0;
    },
    getHubStat: function () {
      if (!embedState.ready) return { value: null, label: 'campaigns' };
      return { value: getFilteredEntries().length, label: 'campaigns' };
    },
    prefetchForCommandCenter: function () {
      if (embedState.ready && allEntries.length) return Promise.resolve();
      if (embedState.loading) return Promise.resolve();
      return Promise.resolve(bootProgramMeta());
    },
    getCommandCenterIssues: function () {
      if (!embedState.ready) return [];
      var issues = [];
      getFilteredEntries().forEach(function (e) {
        if (e.lastDownload == null) {
          issues.push({
            severity: 'medium',
            partner: e.partition,
            campaign: e.solution,
            year: e.year,
            issue: 'Program Meta: never downloaded',
            chapter: 'programMeta'
          });
        }
        if (!e.ready) {
          issues.push({
            severity: 'low',
            partner: e.partition,
            campaign: e.solution,
            year: e.year,
            issue: 'Program Meta: print not ready',
            chapter: 'programMeta'
          });
        }
        if (!e.marketRevision) {
          issues.push({
            severity: 'low',
            partner: e.partition,
            campaign: e.solution,
            year: e.year,
            issue: 'Program Meta: missing market revision',
            chapter: 'programMeta'
          });
        }
        var skewN = emailSkewNumeric(e);
        if (skewN != null && Math.abs(skewN) >= 10) {
          issues.push({
            severity: 'medium',
            partner: e.partition,
            campaign: e.solution,
            year: e.year,
            issue: 'Program Meta: email skew ' + skewN + '%',
            chapter: 'programMeta'
          });
        }
      });
      return issues;
    },
    getError: function () { return embedState.error; },
    exportChapterReport: function () {
      var OER = global.OpsExportReport;
      if (!OER || typeof ExcelJS === 'undefined') {
        setStatus('Excel export requires ExcelJS.', 'error');
        return;
      }
      if (!embedState.ready || embedState.loading) {
        setStatus('Data is still loading.', 'loading');
        return;
      }
      var entries = sortEntries(getFilteredEntries());
      if (!entries.length) {
        setStatus('No campaigns to export for the current filters.', 'error');
        return;
      }
      var headers = [
        'Partner', 'Campaign', 'Year', 'Program ID', 'Status', 'State', 'Returns', 'Map', 'Dashboards',
        'Market revision', 'Market tier', 'Email skew', 'Last download', 'Print ready', 'Landing page'
      ];
      var body = entries.map(function (e) {
        return [
          e.partition,
          e.solution,
          e.year,
          e.programId,
          e.programStatus || '',
          e.stateCode || '',
          triStateLabel(e.returnsState),
          triStateLabel(e.mapState),
          triStateLabel(e.dashboardState),
          e.marketRevision || '',
          e.marketTier || '',
          formatEmailSkewPct(e.emailSkewPct),
          e.lastDownload ? formatDate(e.lastDownload) : '',
          printReadyLabel(e.ready),
          e.landingPage || ''
        ];
      });
      var subtitle = 'Filtered program meta  ·  ' + entries.length + ' campaigns';
      var block = {
        title: 'Campaign roster',
        headers: headers,
        rows: body,
        colAlign: headers.map(function (_, i) { return i >= 9 && i <= 10 ? 'right' : 'left'; })
      };
      var wb = OER.createWorkbook();
      OER.addConsolidatedSheet(wb, {
        name: 'All Together',
        docTitle: 'Program Meta',
        subtitle: subtitle,
        blocks: [block]
      });
      OER.addDataSheet(wb, {
        name: 'Campaign roster',
        docTitle: 'Program Meta',
        sectionTitle: 'Campaign roster',
        subtitle: subtitle,
        headers: headers,
        rows: body,
        colAlign: block.colAlign
      });
      OER.downloadWorkbook(wb, 'program-meta-report-' + OER.fileStamp() + '.xlsx')
        .then(function () { setStatus('Exported Program Meta report.'); })
        .catch(function (err) {
          console.warn('[Program Meta] Export failed:', err);
          setStatus('Export failed.', 'error');
        });
    }
  };
})(window);
