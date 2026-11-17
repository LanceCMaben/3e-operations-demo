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
    if (host && typeof host.setStatus === 'function') host.setStatus(msg, kind);
  }

  function setAnalyticsLoading(active) {
    if (chapterRoot) chapterRoot.classList.toggle('clh-is-loading-analytics', !!active);
  }

  function clearMembershipPanelLoadingChrome(el) {
    if (!el) return;
    el.classList.remove('is-loading', 'is-error');
  }

  function setMembershipPanelMessage(el, msg, kind) {
    if (!el) return;
    if (kind === 'loading') return;
    if (window.OpsUi && OpsUi.setPanelEmpty) {
      OpsUi.setPanelEmpty(el, msg, kind);
      return;
    }
    el.classList.remove('is-loading', 'is-error');
    if (kind === 'error') el.classList.add('is-error');
    el.textContent = msg || '';
  }

  function showMembershipPanelsLoading() {
    state.membershipLoadPending = (state.membershipLoadPending || 0) + 1;
    setAnalyticsLoading(true);
    if (els.analyticsLoadingOverlay) {
      els.analyticsLoadingOverlay.hidden = false;
      els.analyticsLoadingOverlay.setAttribute('aria-busy', 'true');
    }
  }

  function hideMembershipPanelsLoading() {
    state.membershipLoadPending = Math.max(0, (state.membershipLoadPending || 0) - 1);
    if (state.membershipLoadPending > 0) return;
    setAnalyticsLoading(false);
    if (els.analyticsLoadingOverlay) {
      els.analyticsLoadingOverlay.hidden = true;
      els.analyticsLoadingOverlay.setAttribute('aria-busy', 'false');
    }
    clearMembershipPanelLoadingChrome(els.chartEmpty);
    clearMembershipPanelLoadingChrome(els.loadEmpty);
  }

  function panelLoading(active, label) {
    embedState.loading = !!active;
    if (active && label) setStatus(label);
  }

  var DATA_ALIAS = 'leads';
  var DEFAULT_LOAD_CLIENT = 'HighPoint';
  var PROGRAMS_ALIAS = 'programs';
  var DATASET_ID = 'e4871332-8b50-4d6a-8021-dcb29669f5b8';
  var SENTINEL = '1900-01-01';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CHART_COLORS = ['#FFDA0F', '#5BA4C9', '#6B7178', '#2d8a68', '#9a7b00'];
  var DEFAULT_RECORD_TYPES = ['Student', 'Seed', 'Parent', 'Deceased'];
  var DEFAULT_ORIGINS = ['Other', 'List Acquired', 'Client Provided'];
  /** When "Student" is selected, also include Fr (freshman) like other XPL apps. */
  var STUDENT_ALIASES = ['Student', 'Fr', 'FR', 'student', 'fr'];

  var els = {};

  function bindEls() {
    els.client = $('clhClientSelect');
    els.campaign = $('clhCampaignSelect');
    els.clientTrigger = $('clhClientTrigger');
    els.clientTriggerLabel = $('clhClientTriggerLabel');
    els.clientMenu = $('clhClientMenu');
    els.campaignTrigger = $('clhCampaignTrigger');
    els.campaignTriggerLabel = $('clhCampaignTriggerLabel');
    els.campaignMenu = $('clhCampaignMenu');
    els.pitToggle = $('clhPitToggle');
    els.yearsTrigger = $('clhYearsTrigger');
    els.yearsTriggerLabel = $('clhYearsTriggerLabel');
    els.yearsMenu = $('clhYearsMenu');
    els.recordTypeTrigger = $('clhRecordTypeTrigger');
    els.recordTypeTriggerLabel = $('clhRecordTypeTriggerLabel');
    els.recordTypeMenu = $('clhRecordTypeMenu');
    els.originTrigger = $('clhOriginTrigger');
    els.originTriggerLabel = $('clhOriginTriggerLabel');
    els.originMenu = $('clhOriginMenu');
    els.chartSubtitle = $('clhChartSubtitle');
    els.loadSubtitle = $('clhLoadSubtitle');
    els.chartCanvas = $('clhMembershipChart');
    els.chartEmpty = $('clhChartEmpty');
    els.loadHead = $('clhLoadTableHead');
    els.loadBody = $('clhLoadTableBody');
    els.loadEmpty = $('clhLoadEmpty');
    els.pitTitle = $('clhPitTitle');
    els.pitStatus = $('clhPitStatus');
    els.pitBody = $('clhPitTableBody');
    els.pitEmpty = $('clhPitEmpty');
    els.pitSearch = $('clhPitSearch');
    els.pitExport = $('clhPitExport');
    els.pitColPrior = $('clhPitColPrior');
    els.pitColCurrent = $('clhPitColCurrent');
    els.yearLegend = $('clhYearLegend');
    els.scopeSummary = $('clhScopeSummary');
    els.btnReset = $('clhBtnResetFilters');
    els.btnApply = $('clhBtnApplyFilters');
    els.analyticsLoadingOverlay = $('clhAnalyticsLoadingOverlay');
    bindFilterActionButtons();
  }

  function bindFilterActionButtons() {
    /* Apply/Reset use chapterRoot delegation in bindEventsOnce (single handler). */
  }

  function emptyChartRefine() {
    return { years: [], recordTypes: {}, origins: {}, pitOnly: true };
  }

  function cloneChartRefine(src) {
    src = src || emptyChartRefine();
    return {
      years: (src.years || []).slice(),
      recordTypes: Object.assign({}, src.recordTypes || {}),
      origins: Object.assign({}, src.origins || {}),
      pitOnly: src.pitOnly !== false
    };
  }

  var state = {
    clients: [],
    clientsByCampaign: {},
    campaignsByClient: {},
    yearOptionsAll: [],
    yearOptions: [],
    chartDraft: emptyChartRefine(),
    chartApplied: emptyChartRefine(),
    refinePending: false,
    dailyRows: [],
    pitRows: [],
    pitSort: { key: 'client', dir: 'asc' },
    pitSearch: '',
    yearsMenuSearch: '',
    recordTypeOptions: [],
    originOptions: [],
    hubCampaignOverride: false,
    pendingHubSync: false,
    clientMenuSearch: '',
    campaignMenuSearch: '',
    loadGen: 0,
    membershipLoadPending: 0,
    resetInFlight: false,
    userPickedClient: false,
    chart: null,
    appliedScope: { client: '', campaign: '' },
    lastScopeClient: ''
  };

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

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

  function formatNum(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function setAppLoading(active, label) {
    panelLoading(active, label);
  }

  function setStatus(msg, kind) {
    hostStatus(msg, kind);
  }

  function setPitStatus(msg, kind) {
    if (!els.pitStatus) return;
    if (window.OpsUi && OpsUi.setStatusEl) {
      OpsUi.setStatusEl(els.pitStatus, msg, kind);
      return;
    }
    els.pitStatus.textContent = msg || '';
    els.pitStatus.classList.toggle('is-error', kind === 'error');
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
    if (resp && resp.columns && Array.isArray(resp.rows)) {
      return { cols: resp.columns.map(columnName), rows: resp.rows };
    }
    if (Array.isArray(resp) && resp.length && Array.isArray(resp[0])) {
      return { cols: resp[0].map(columnName), rows: resp.slice(1) };
    }
    if (Array.isArray(resp) && resp.length && typeof resp[0] === 'object') {
      var c = Object.keys(resp[0]);
      return { cols: c, rows: resp.map(function (r) { return c.map(function (k) { return r[k]; }); }) };
    }
    if (resp && Array.isArray(resp.columns) && Array.isArray(resp.rows)) {
      return { cols: resp.columns.map(columnName), rows: resp.rows };
    }
    throw new Error('Unexpected SQL response shape');
  }

  function colIdx(cols, name) {
    var upper = String(name).toUpperCase();
    for (var i = 0; i < cols.length; i++) {
      if (String(cols[i]).toUpperCase() === upper) return i;
    }
    return -1;
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

  function runSql(sql, label) {
    return withTimeout(
      domo.post('/sql/v1/' + DATA_ALIAS, sql, { contentType: 'text/plain' }),
      90000,
      label || 'SQL'
    ).then(parseSqlResp);
  }

  function runProgramsSql(sql, label) {
    return withTimeout(
      domo.post('/sql/v1/' + PROGRAMS_ALIAS, sql, { contentType: 'text/plain' }),
      90000,
      label || 'SQL'
    ).then(parseSqlResp);
  }

  function hubPartnerFilterOptions() {
    if (host && typeof host.getPartnerFilterOptions === 'function') {
      return host.getPartnerFilterOptions() || [];
    }
    return null;
  }

  function clientMatchesPartnerFilter(client, partnerOptions) {
    if (!partnerOptions || !partnerOptions.length) return true;
    var join = window.OpsJoin || {};
    if (join.matchesSelectedPartners) return join.matchesSelectedPartners(client, partnerOptions);
    return partnerOptions.indexOf(client) >= 0;
  }

  function fetchPartnerFilterOptions() {
    var fromHub = hubPartnerFilterOptions();
    if (fromHub && fromHub.length) return Promise.resolve(fromHub);
    if (host && typeof host.getPartnerFilterOptions === 'function') {
      return Promise.resolve(fromHub || []);
    }
    var join = window.OpsJoin || {};
    return runProgramsSql(
      'SELECT PARTITION, PROGRAM_STATUS, ACTIVE_FLAG, PROGRAM_SOLUTION, CAMPAIGN_YEAR FROM ' +
      PROGRAMS_ALIAS + ' WHERE PARTITION IS NOT NULL',
      'Programs for client filter'
    ).then(function (parsed) {
      var cols = parsed.cols;
      var objects = parsed.rows.map(function (row) {
        var o = {};
        cols.forEach(function (c, i) { o[c] = row[i]; });
        return o;
      });
      if (join.partnerFilterOptionsFromPrograms) {
        return join.partnerFilterOptionsFromPrograms(objects, { statuses: ['active'] });
      }
      return objects.map(function (r) { return trimStr(r.PARTITION); }).filter(Boolean);
    }).catch(function (err) {
      console.warn('[clh] Could not load partner filter from programs; client list uses all leads partitions.', err);
      return null;
    });
  }

  function rebuildCampaignMapsFromPairs(pairsParsed, partnerOptions) {
    state.campaignsByClient = {};
    state.clientsByCampaign = {};
    if (!pairsParsed || !pairsParsed.rows) return;
    var iPairPart = colIdx(pairsParsed.cols, 'PARTITION');
    var iPairCamp = colIdx(pairsParsed.cols, 'PROGRAM_SOLUTION');
    pairsParsed.rows.forEach(function (row) {
      var part = trimStr(row[iPairPart]);
      var camp = trimStr(row[iPairCamp]);
      if (!part || !camp) return;
      if (Join.isIgnoredPartition && Join.isIgnoredPartition(part)) return;
      if (!clientMatchesPartnerFilter(part, partnerOptions)) return;
      if (!state.campaignsByClient[part]) state.campaignsByClient[part] = [];
      if (state.campaignsByClient[part].indexOf(camp) < 0) state.campaignsByClient[part].push(camp);
      if (!state.clientsByCampaign[camp]) state.clientsByCampaign[camp] = [];
      if (state.clientsByCampaign[camp].indexOf(part) < 0) state.clientsByCampaign[camp].push(part);
    });
    Object.keys(state.campaignsByClient).forEach(function (p) {
      state.campaignsByClient[p].sort();
    });
    Object.keys(state.clientsByCampaign).forEach(function (c) {
      state.clientsByCampaign[c].sort();
    });
  }

  function applyClientListFromPartnerFilter(rawClients, partnerOptions) {
    state.leadClientCandidates = (rawClients || []).slice();
    state.clients = state.leadClientCandidates.filter(function (name) {
      if (!name) return false;
      if (Join.isIgnoredPartition && Join.isIgnoredPartition(name)) return false;
      return clientMatchesPartnerFilter(name, partnerOptions);
    }).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  }

  function refreshClientFilterFromHub() {
    if (!embedState.ready || !state.leadClientCandidates) return Promise.resolve();
    return fetchPartnerFilterOptions().then(function (partnerOptions) {
      applyClientListFromPartnerFilter(state.leadClientCandidates, partnerOptions);
      if (state.clientCampaignPairsParsed) {
        rebuildCampaignMapsFromPairs(state.clientCampaignPairsParsed, partnerOptions);
      }
      refreshClientSelect(hostPreferredClient());
      return syncCampaignSelectForClient(els.client && els.client.value, {
        useHubPreferred: true,
        autoPickSingle: false
      });
    });
  }

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    var s = String(v).trim();
    if (!s || s.indexOf(SENTINEL) === 0) return null;
    // Prefer YYYY-MM-DD / ISO
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) return new Date(Number(m2[3]), Number(m2[1]) - 1, Number(m2[2]));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function ymd(d) {
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function mdLabel(d) {
    if (!d) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function mdKey(d) {
    if (!d) return '';
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function cyNumber(cy) {
    var m = String(cy || '').toUpperCase().match(/CY\s*(\d{2,4})/);
    if (!m) return null;
    var n = Number(m[1]);
    if (n < 100) n += 2000;
    return n;
  }

  function entryYearFromCy(cy) {
    if (Join.entryYearFromCampaignYear) {
      var fromToken = Join.entryYearFromCampaignYear(cy);
      if (fromToken != null) return fromToken;
    }
    var n = cyNumber(cy);
    return n == null ? null : n + 1;
  }

  function placeMembershipOnCycle(rows, cycleStart, maxDay) {
    if (Join.placeMembershipOnCycle) return Join.placeMembershipOnCycle(rows, cycleStart, maxDay);
    var grand = 0;
    (rows || []).forEach(function (row) { grand += Number(row && row.count) || 0; });
    return { data: [grand], total: grand, lastDay: grand ? 0 : -1 };
  }

  /** Aug 1 of the year before the entry class. CY26 / entry 2027 starts Aug 1 2026. */
  function cycleStartForCy(cy, fallbackYear) {
    var entry = entryYearFromCy(cy);
    if (entry != null) return new Date(entry - 1, 7, 1);
    if (fallbackYear != null) return new Date(fallbackYear, 7, 1);
    return new Date(todayLocal().getFullYear(), 7, 1);
  }

  function yearLabel(cy) {
    var e = entryYearFromCy(cy);
    return 'Campaign Year: ' + cy + (e != null ? ' | Entry Year: ' + e : '');
  }

  function todayLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function sqlInList(values) {
    return values.map(function (v) { return "'" + escapeSql(v) + "'"; }).join(',');
  }

  // --------------------------------------------------------------------------
  // Filter UI
  // --------------------------------------------------------------------------

  function selectedRecordTypes() {
    return Object.keys(state.chartApplied.recordTypes).filter(function (k) {
      return state.chartApplied.recordTypes[k];
    });
  }

  function selectedOrigins() {
    return Object.keys(state.chartApplied.origins).filter(function (k) {
      return state.chartApplied.origins[k];
    });
  }

  function defaultYearsForOptions(options) {
    return (options || []).slice(0, 2).map(function (y) { return y.cy; });
  }

  function pickDefaultYearsFromOptions(options, preferYears) {
    var picked = [];
    var prefer = preferYears || [];
    var i;
    for (i = 0; i < prefer.length; i++) {
      (options || []).forEach(function (o) {
        if (picked.indexOf(o.cy) >= 0) return;
        if (Join.matchesSelectedYears && Join.matchesSelectedYears(o.cy, [prefer[i]])) {
          picked.push(o.cy);
        } else if (o.cy === prefer[i]) {
          picked.push(o.cy);
        }
      });
    }
    if (picked.length) return picked;
    return defaultYearsForOptions(options);
  }

  function buildYearOptionsFromParsed(parsed) {
    var iCy = colIdx(parsed.cols, 'CAMPAIGN_YEAR');
    var iEntry = colIdx(parsed.cols, 'CF_ENTRY_YEAR');
    var yearMap = {};
    parsed.rows.forEach(function (row) {
      var cy = trimStr(row[iCy]);
      var entry = trimStr(row[iEntry]);
      if (!cy) return;
      if (!yearMap[cy]) {
        yearMap[cy] = { cy: cy, entry: entryYearFromCy(cy) || entry };
      }
    });
    return Object.keys(yearMap).map(function (k) { return yearMap[k]; })
      .sort(function (a, b) { return (cyNumber(b.cy) || 0) - (cyNumber(a.cy) || 0); });
  }

  function scopeDraftSig() {
    bindEls();
    return trimStr(els.client && els.client.value) + '\0' + trimStr(els.campaign && els.campaign.value);
  }

  function scopeAppliedSig() {
    var a = state.appliedScope || {};
    return trimStr(a.client) + '\0' + trimStr(a.campaign);
  }

  function invalidateMembershipUntilApply() {
    state.dailyRows = [];
    state.loadGen++;
    clearMembershipViewsIfEmpty();
    var hint = 'Click Apply to load membership for the selected client and campaign.';
    if (els.chartSubtitle) els.chartSubtitle.textContent = hint;
    if (els.loadSubtitle) els.loadSubtitle.textContent = hint;
  }

  function markScopeApplied(client, campaign) {
    state.appliedScope = { client: client || '', campaign: campaign || '' };
  }

  function markRefinePending() {
    state.refinePending = true;
    updateFilterActionsUi();
  }

  function updateFilterActionsUi() {
    if (!els.btnApply) return;
    els.btnApply.classList.toggle('is-pending', !!state.refinePending);
    els.btnApply.setAttribute('aria-describedby', state.refinePending ? 'clhScopeSummary' : '');
  }

  function syncPitToggleUi() {
    if (!els.pitToggle) return;
    var on = state.chartDraft.pitOnly;
    els.pitToggle.classList.toggle('is-active', on);
    els.pitToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    els.pitToggle.textContent = on ? 'Point in Time Only' : 'All Records';
  }

  function updateScopeSummary() {
    if (!els.scopeSummary) return;
    var client = els.client && els.client.value;
    var campaign = els.campaign && els.campaign.value;
    var parts = [];
    if (client) parts.push(client);
    if (campaign) parts.push(campaign);
    var years = state.chartApplied.years.slice().sort(function (a, b) {
      return (cyNumber(b) || 0) - (cyNumber(a) || 0);
    });
    if (years.length) parts.push(years.join(', '));
    if (state.refinePending) {
      els.scopeSummary.textContent = (parts.length ? parts.join(' · ') + ' · ' : '') +
        'Chart options changed — click Apply to update the chart.';
      return;
    }
    if (!client || !campaign) {
      els.scopeSummary.textContent = 'Select a client and campaign. Years and chart options follow that program.';
      return;
    }
    els.scopeSummary.textContent = parts.length
      ? 'Showing membership for ' + parts.join(' · ') + '.'
      : 'Select at least one year to compare.';
  }

  function applyRefineFromDraft() {
    bindEls();
    var client = trimStr(els.client && els.client.value);
    var campaign = trimStr(els.campaign && els.campaign.value);
    state.refinePending = false;
    updateFilterActionsUi();
    if (!client || !campaign) {
      state.chartApplied = cloneChartRefine(state.chartDraft);
      updateScopeSummary();
      return refreshMembershipViews();
    }
    showMembershipPanelsLoading();
    setStatus('Loading membership…', 'loading');
    var runApply = function () {
      return refreshScopedYears(client, campaign)
        .then(function () {
          state.chartApplied = cloneChartRefine(state.chartDraft);
          markScopeApplied(client, campaign);
          updateScopeSummary();
          return refreshMembershipViews({ skipLoadChrome: true });
        })
        .catch(function (err) {
          hideMembershipPanelsLoading();
          setStatus((err && err.message) || 'Failed to apply filters', 'error');
        });
    };
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          resolve(runApply());
        });
      });
    });
  }

  function syncAppliedFromDraft() {
    state.chartApplied = cloneChartRefine(state.chartDraft);
    state.refinePending = false;
    updateFilterActionsUi();
    updateScopeSummary();
  }

  function expandRecordTypesForSql(selected) {
    var out = [];
    var seen = {};
    selected.forEach(function (rt) {
      var vals = (String(rt).toLowerCase() === 'student') ? STUDENT_ALIASES : [rt];
      vals.forEach(function (v) {
        var key = String(v);
        if (!seen[key]) {
          seen[key] = true;
          out.push(key);
        }
      });
    });
    return out;
  }

  function countSelectedMap(selectedMap) {
    return Object.keys(selectedMap || {}).filter(function (k) { return selectedMap[k]; }).length;
  }

  function updateYearsTriggerLabel() {
    var selected = state.chartDraft.years.slice().sort(function (a, b) {
      return (cyNumber(b) || 0) - (cyNumber(a) || 0);
    });
    if (!selected.length) {
      els.yearsTriggerLabel.textContent = 'Select years…';
      return;
    }
    if (selected.length === 1) {
      var opt = state.yearOptions.filter(function (y) { return y.cy === selected[0]; })[0];
      els.yearsTriggerLabel.textContent = opt ? yearLabel(opt.cy, opt.entry) : selected[0];
      return;
    }
    els.yearsTriggerLabel.textContent = selected.length + ' years selected';
  }

  function appendClhClearSection(menu, selectedCount, onClear) {
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

  function filterYearOptionsForMenu() {
    var q = trimStr(state.yearsMenuSearch).toLowerCase();
    if (!q) return state.yearOptions.slice();
    return state.yearOptions.filter(function (opt) {
      var label = yearLabel(opt.cy, opt.entry).toLowerCase();
      return label.indexOf(q) >= 0 || String(opt.cy).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderYearsMenu() {
    if (!els.yearsMenu) return;
    if (!state.yearOptions.length) {
      els.yearsMenu.innerHTML = '<div class="multi-select-empty">No campaign years found</div>';
      updateYearsTriggerLabel();
      return;
    }
    var mount = window.OpsFilterMenu && window.OpsFilterMenu.mountPinnedHead
      ? window.OpsFilterMenu.mountPinnedHead(els.yearsMenu, {
        searchValue: state.yearsMenuSearch,
        searchAriaLabel: 'Search campaign years',
        selectedCount: state.chartDraft.years.length,
        onSearchInput: function () {
          state.yearsMenuSearch = mount.searchInput.value;
          renderYearsMenu();
        },
        onClear: function () {
          state.chartDraft.years = [];
          state.yearsMenuSearch = '';
          renderYearsMenu();
          markRefinePending();
          updateScopeSummary();
        }
      })
      : null;
    var listEl = mount ? mount.optionsEl : els.yearsMenu;

    var visible = filterYearOptionsForMenu();
    if (!visible.length) {
      var empty = document.createElement('div');
      empty.className = 'multi-select-empty';
      empty.textContent = 'No matching years';
      listEl.appendChild(empty);
      updateYearsTriggerLabel();
      return;
    }
    visible.forEach(function (opt) {
      var label = document.createElement('label');
      label.className = 'multi-select-option';
      var checked = state.chartDraft.years.indexOf(opt.cy) >= 0;
      label.innerHTML =
        '<input type="checkbox" value="' + escapeHtml(opt.cy) + '"' + (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(yearLabel(opt.cy, opt.entry)) + '</span>';
      var input = label.querySelector('input');
      input.addEventListener('change', function () {
        if (input.checked) {
          if (state.chartDraft.years.indexOf(opt.cy) < 0) state.chartDraft.years.push(opt.cy);
        } else {
          state.chartDraft.years = state.chartDraft.years.filter(function (y) { return y !== opt.cy; });
        }
        updateYearsTriggerLabel();
        markRefinePending();
        updateScopeSummary();
      });
      listEl.appendChild(label);
    });
    updateYearsTriggerLabel();
  }

  function fillSelect(selectEl, values, placeholder, preferred, opts) {
    if (!selectEl) return;
    opts = opts || {};
    var prev = selectEl.value;
    var list = values || [];
    selectEl.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
    list.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
    var pick = '';
    if (opts.clearSelection) {
      pick = '';
    } else if (preferred && list.indexOf(preferred) >= 0) {
      pick = preferred;
    } else if (prev && list.indexOf(prev) >= 0) {
      pick = prev;
    } else if (opts.autoPickSingle && list.length === 1) {
      pick = list[0];
    }
    selectEl.value = pick;
    if (opts.kind === 'campaign') {
      selectEl.disabled = !opts.clientSelected;
    } else {
      selectEl.disabled = !list.length;
    }
    if (opts.kind === 'client' || selectEl === els.client) syncScopeSelectUi('client');
    if (opts.kind === 'campaign' || selectEl === els.campaign) syncScopeSelectUi('campaign');
  }

  function syncScopeSelectUi(kind) {
    var selectEl = kind === 'campaign' ? els.campaign : els.client;
    var trigger = kind === 'campaign' ? els.campaignTrigger : els.clientTrigger;
    var labelEl = kind === 'campaign' ? els.campaignTriggerLabel : els.clientTriggerLabel;
    if (!selectEl || !labelEl) return;
    var text = selectEl.options[0] ? selectEl.options[0].textContent : 'Select…';
    if (trimStr(selectEl.value)) {
      var i;
      for (i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value === selectEl.value) {
          text = selectEl.options[i].textContent;
          break;
        }
      }
    }
    labelEl.textContent = text;
    if (trigger) {
      trigger.disabled = !!selectEl.disabled;
      trigger.classList.toggle('is-placeholder', !trimStr(selectEl.value));
    }
  }

  function scopeMenuSearchKey(kind) {
    return kind === 'campaign' ? 'campaignMenuSearch' : 'clientMenuSearch';
  }

  function applyClhScopeMenuSearchFilter(menu, kind) {
    if (!menu) return;
    var q = trimStr(state[scopeMenuSearchKey(kind)]).toLowerCase();
    menu.querySelectorAll('.clh-scope-option').forEach(function (row) {
      var textEl = row.querySelector('span');
      var label = textEl ? trimStr(textEl.textContent).toLowerCase() : '';
      row.classList.toggle('is-hidden', q && label.indexOf(q) < 0);
    });
  }

  function renderScopeSelectMenu(kind) {
    var selectEl = kind === 'campaign' ? els.campaign : els.client;
    var menu = kind === 'campaign' ? els.campaignMenu : els.clientMenu;
    if (!selectEl || !menu) return;
    var searchKey = scopeMenuSearchKey(kind);
    var mount = window.OpsFilterMenu && window.OpsFilterMenu.mountPinnedHead
      ? window.OpsFilterMenu.mountPinnedHead(menu, {
        searchValue: state[searchKey] || '',
        searchAriaLabel: kind === 'campaign' ? 'Search campaigns' : 'Search clients',
        selectedCount: trimStr(selectEl.value) ? 1 : 0,
        onSearchInput: function () {
          state[searchKey] = mount.searchInput.value;
          applyClhScopeMenuSearchFilter(menu, kind);
        },
        onClear: function () {
          state[searchKey] = '';
          if (trimStr(selectEl.value)) {
            selectEl.value = '';
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            syncScopeSelectUi(kind);
            renderScopeSelectMenu(kind);
          }
        }
      })
      : null;
    var listEl = mount ? mount.optionsEl : menu;
    if (!mount) menu.innerHTML = '';

    var optionCount = 0;
    var i;
    var radioName = kind === 'campaign' ? 'clhScopeCampaign' : 'clhScopeClient';
    for (i = 0; i < selectEl.options.length; i++) {
      (function (opt) {
        if (!trimStr(opt.value)) return;
        optionCount += 1;
        var row = document.createElement('label');
        row.className = 'multi-select-option clh-scope-option';
        row.setAttribute('role', 'option');
        var checked = selectEl.value === opt.value;
        row.innerHTML =
          '<input type="radio" name="' + radioName + '" value="' + escapeHtml(opt.value) + '"' +
          (checked ? ' checked' : '') + ' />' +
          '<span>' + escapeHtml(opt.textContent) + '</span>';
        var input = row.querySelector('input');
        input.addEventListener('change', function () {
          if (!input.checked) return;
          if (selectEl.value !== opt.value) {
            selectEl.value = opt.value;
            syncScopeSelectUi(kind);
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            syncScopeSelectUi(kind);
          }
          if (kind === 'client') {
            toggleClhMenu(els.clientTrigger, els.clientMenu, false);
            if (trimStr(selectEl.value) && els.campaignTrigger && !els.campaignTrigger.disabled) {
              renderScopeSelectMenu('campaign');
              toggleClhMenu(els.campaignTrigger, els.campaignMenu, true);
            }
          } else {
            toggleClhMenu(
              kind === 'campaign' ? els.campaignTrigger : els.clientTrigger,
              menu,
              false
            );
          }
        });
        listEl.appendChild(row);
      })(selectEl.options[i]);
    }
    if (!optionCount) {
      var empty = document.createElement('div');
      empty.className = 'multi-select-empty';
      empty.textContent = kind === 'campaign' ? 'No campaigns' : 'No clients';
      listEl.appendChild(empty);
    }
    applyClhScopeMenuSearchFilter(menu, kind);
  }

  function contextSubtitle() {
    var client = els.client.value;
    var campaign = els.campaign.value;
    var years = state.chartApplied.years.slice().sort(function (a, b) {
      return (cyNumber(b) || 0) - (cyNumber(a) || 0);
    });
    var rts = selectedRecordTypes();
    var yearPart = years.map(function (cy) {
      var opt = state.yearOptions.filter(function (y) { return y.cy === cy; })[0];
      return yearLabel(cy, opt && opt.entry);
    }).join(', ');
    var bits = [];
    if (rts.length) bits.push(rts.join(', '));
    if (yearPart) bits.push(yearPart);
    if (client) bits.push(client);
    if (campaign) bits.push(campaign);
    return bits.join(' ') || 'Select a client and campaign';
  }

  // --------------------------------------------------------------------------
  // Data loading
  // --------------------------------------------------------------------------

  function applyRecordTypeOptions(rtSet) {
    var rtOptions = DEFAULT_RECORD_TYPES.slice();
    Object.keys(rtSet || {}).forEach(function (rt) {
      var canon = DEFAULT_RECORD_TYPES.filter(function (d) {
        return d.toLowerCase() === rt.toLowerCase();
      })[0];
      if (!canon && STUDENT_ALIASES.indexOf(rt) < 0 && rtOptions.indexOf(rt) < 0) {
        rtOptions.push(rt);
      }
    });
    state.chartDraft.recordTypes = {};
    state.chartApplied.recordTypes = {};
    rtOptions.forEach(function (rt) {
      var on = rt === 'Student';
      state.chartDraft.recordTypes[rt] = on;
      state.chartApplied.recordTypes[rt] = on;
    });
    state.recordTypeOptions = rtOptions.slice();
    renderRecordTypeMenu();
  }

  function applyOriginOptions(originSet) {
    var originOptions = DEFAULT_ORIGINS.slice();
    Object.keys(originSet || {}).forEach(function (o) {
      if (originOptions.indexOf(o) < 0) originOptions.push(o);
    });
    state.chartDraft.origins = {};
    state.chartApplied.origins = {};
    originOptions.forEach(function (o) {
      state.chartDraft.origins[o] = false;
      state.chartApplied.origins[o] = false;
    });
    state.originOptions = originOptions.slice();
    renderOriginMenu();
  }

  function updateRecordTypeTriggerLabel() {
    if (!els.recordTypeTriggerLabel) return;
    var options = state.recordTypeOptions.length
      ? state.recordTypeOptions
      : Object.keys(state.chartDraft.recordTypes);
    var selected = options.filter(function (opt) { return state.chartDraft.recordTypes[opt]; });
    if (!selected.length) {
      els.recordTypeTriggerLabel.textContent = 'Select record types…';
      return;
    }
    if (selected.length === 1) {
      els.recordTypeTriggerLabel.textContent = selected[0];
      return;
    }
    if (selected.length === options.length) {
      els.recordTypeTriggerLabel.textContent = 'All record types';
      return;
    }
    els.recordTypeTriggerLabel.textContent = selected.length + ' record types';
  }

  function updateOriginTriggerLabel() {
    if (!els.originTriggerLabel) return;
    var options = state.originOptions.length
      ? state.originOptions
      : Object.keys(state.chartDraft.origins);
    var selected = options.filter(function (opt) { return state.chartDraft.origins[opt]; });
    if (!selected.length) {
      els.originTriggerLabel.textContent = 'All origins';
      return;
    }
    if (selected.length === 1) {
      els.originTriggerLabel.textContent = selected[0];
      return;
    }
    if (selected.length === options.length) {
      els.originTriggerLabel.textContent = 'All origins';
      return;
    }
    els.originTriggerLabel.textContent = selected.length + ' origins';
  }

  function renderCheckboxMultiMenu(menuEl, options, selectedMap, onChange, clearFn) {
    if (!menuEl) return;
    if (!options.length) {
      menuEl.innerHTML = '<div class="multi-select-empty">No options</div>';
      return;
    }
    var mount = window.OpsFilterMenu && window.OpsFilterMenu.mountPinnedHead
      ? window.OpsFilterMenu.mountPinnedHead(menuEl, {
        selectedCount: countSelectedMap(selectedMap),
        onSearchInput: function () {
          var q = trimStr(mount.searchInput.value).toLowerCase();
          menuEl.querySelectorAll('.multi-select-option').forEach(function (row) {
            var textEl = row.querySelector('span');
            var label = textEl ? trimStr(textEl.textContent).toLowerCase() : '';
            row.classList.toggle('is-hidden', q && label.indexOf(q) < 0);
          });
        },
        onClear: function () {
          options.forEach(function (opt) { selectedMap[opt] = false; });
          if (clearFn) clearFn();
          onChange();
          renderCheckboxMultiMenu(menuEl, options, selectedMap, onChange, clearFn);
        }
      })
      : null;
    var listEl = mount ? mount.optionsEl : menuEl;
    if (!mount) menuEl.innerHTML = '';
    options.forEach(function (opt) {
      var label = document.createElement('label');
      label.className = 'multi-select-option';
      var checked = !!selectedMap[opt];
      label.innerHTML =
        '<input type="checkbox" value="' + escapeHtml(opt) + '"' + (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(opt) + '</span>';
      var input = label.querySelector('input');
      input.addEventListener('change', function () {
        selectedMap[opt] = !!input.checked;
        onChange();
      });
      listEl.appendChild(label);
    });
  }

  function renderRecordTypeMenu() {
    var options = state.recordTypeOptions.length
      ? state.recordTypeOptions
      : Object.keys(state.chartDraft.recordTypes);
    renderCheckboxMultiMenu(
      els.recordTypeMenu,
      options,
      state.chartDraft.recordTypes,
      function () {
        updateRecordTypeTriggerLabel();
        markRefinePending();
        updateScopeSummary();
      }
    );
    updateRecordTypeTriggerLabel();
  }

  function renderOriginMenu() {
    var options = state.originOptions.length
      ? state.originOptions
      : Object.keys(state.chartDraft.origins);
    renderCheckboxMultiMenu(
      els.originMenu,
      options,
      state.chartDraft.origins,
      function () {
        updateOriginTriggerLabel();
        markRefinePending();
        updateScopeSummary();
      }
    );
    updateOriginTriggerLabel();
  }

  function chapterRefresh() {
    if (host && typeof host.onChapterRefresh === 'function') host.onChapterRefresh();
  }

  var Join = window.OpsJoin || {};
  var clhHubScopeSig = '';

  function hostHubCampaigns() {
    if (!host || typeof host.getFilters !== 'function') return [];
    return (host.getFilters().campaigns || []).slice();
  }

  function hostPreferredClient() {
    if (!host || typeof host.getFilters !== 'function') return '';
    var f = host.getFilters();
    var scope = f.scopePartners || f.partners || [];
    if (!scope.length) return '';
    var picked = Join.pickKnownPartners ? Join.pickKnownPartners(scope, state.clients) : scope.slice();
    return picked.length ? picked[0] : scope[0];
  }

  function campaignOptionsForClient(client) {
    if (!client) return [];
    if (state.campaignsByClient[client] && state.campaignsByClient[client].length) {
      return state.campaignsByClient[client];
    }
    if (!els.campaign || !els.campaign.options) return [];
    var list = [];
    for (var i = 0; i < els.campaign.options.length; i++) {
      var v = els.campaign.options[i].value;
      if (v) list.push(v);
    }
    return list;
  }

  function pickCampaignForHub(list, hubCampaigns) {
    if (!list || !list.length || !hubCampaigns || !hubCampaigns.length) return '';
    var i;
    for (i = 0; i < list.length; i++) {
      if (Join.matchesSelectedCampaigns && Join.matchesSelectedCampaigns(list[i], hubCampaigns)) {
        return list[i];
      }
    }
    for (i = 0; i < list.length; i++) {
      var j;
      for (j = 0; j < hubCampaigns.length; j++) {
        if (list[i] === hubCampaigns[j]) return list[i];
      }
    }
    return '';
  }

  function preferredCampaignForClient(client) {
    return pickCampaignForHub(campaignOptionsForClient(client), hostHubCampaigns());
  }

  function applyHostYears() {
    if (!host || typeof host.getFilters !== 'function') return false;
    var years = host.getFilters().years;
    if (!years || !years.length || !state.yearOptions.length) return false;
    var valid = [];
    state.yearOptions.forEach(function (o) {
      var i;
      for (i = 0; i < years.length; i++) {
        if (Join.matchesSelectedYears && Join.matchesSelectedYears(o.cy, [years[i]])) {
          if (valid.indexOf(o.cy) < 0) valid.push(o.cy);
          break;
        }
        if (o.cy === years[i] && valid.indexOf(o.cy) < 0) {
          valid.push(o.cy);
          break;
        }
      }
    });
    if (!valid.length) return false;
    var same = valid.length === state.chartDraft.years.length &&
      valid.slice().sort().join('\0') === state.chartDraft.years.slice().sort().join('\0');
    if (same) return false;
    state.chartDraft.years = valid;
    if (!state.refinePending) {
      state.chartApplied.years = valid.slice();
    }
    renderYearsMenu();
    return true;
  }

  function refreshScopedYears(client, campaign) {
    var memberOk =
      "MEMBERSHIP_DATE IS NOT NULL AND MEMBERSHIP_DATE > '" + SENTINEL + "'";
    if (!client || !campaign) {
      state.yearOptions = state.yearOptionsAll.slice();
      var hubYears = host && host.getFilters ? host.getFilters().years : [];
      state.chartDraft.years = pickDefaultYearsFromOptions(state.yearOptions, hubYears);
      renderYearsMenu();
      return Promise.resolve(state.yearOptions);
    }
    var sql =
      'SELECT CAMPAIGN_YEAR, CF_ENTRY_YEAR FROM ' + DATA_ALIAS +
      " WHERE PARTITION = '" + escapeSql(client) + "' " +
      " AND PROGRAM_SOLUTION = '" + escapeSql(campaign) + "' AND " + memberOk +
      ' GROUP BY CAMPAIGN_YEAR, CF_ENTRY_YEAR';
    return runSql(sql, 'Scoped campaign years').then(function (parsed) {
      var scoped = buildYearOptionsFromParsed(parsed);
      state.yearOptions = scoped.length ? scoped : state.yearOptionsAll.slice();
      var prefer = state.chartDraft.years.length
        ? state.chartDraft.years
        : (host && host.getFilters ? host.getFilters().years : []);
      state.chartDraft.years = pickDefaultYearsFromOptions(state.yearOptions, prefer);
      renderYearsMenu();
      return state.yearOptions;
    });
  }

  function onScopeDraftChanged() {
    markRefinePending();
    if (scopeDraftSig() !== scopeAppliedSig()) {
      invalidateMembershipUntilApply();
    }
    return updateCampaignOptions({ useHubPreferred: false, autoPickSingle: false })
      .then(function () {
        syncScopeSelectUi('client');
        syncScopeSelectUi('campaign');
        updateScopeSummary();
        updateFilterActionsUi();
        if (trimStr(els.client && els.client.value) && trimStr(els.campaign && els.campaign.value)) {
          setStatus('Click Apply to load membership for the selected client and campaign.');
        }
      })
      .catch(function (err) {
        setStatus((err && err.message) || 'Failed to update scope', 'error');
      });
  }

  function resetClhRefineDefaults() {
    state.refinePending = false;
    state.chartDraft.pitOnly = true;
    state.chartApplied.pitOnly = true;
    state.chartDraft.years = [];
    state.chartApplied.years = [];
    syncPitToggleUi();
    Object.keys(state.chartDraft.recordTypes).forEach(function (k) {
      var on = k === 'Student';
      state.chartDraft.recordTypes[k] = on;
      state.chartApplied.recordTypes[k] = on;
    });
    Object.keys(state.chartDraft.origins).forEach(function (k) {
      state.chartDraft.origins[k] = false;
      state.chartApplied.origins[k] = false;
    });
    renderRecordTypeMenu();
    renderOriginMenu();
    renderYearsMenu();
  }

  function finishClhResetUi() {
    syncAppliedFromDraft();
    syncPitToggleUi();
    renderRecordTypeMenu();
    renderOriginMenu();
    renderYearsMenu();
    updateFilterActionsUi();
    updateScopeSummary();
  }

  function clearClhScopeAndViews() {
    state.dailyRows = [];
    state.loadGen++;
    markScopeApplied('', '');
    if (els.client) {
      fillSelect(els.client, state.clients, 'Select client…', '', { clearSelection: true, kind: 'client' });
    }
    fillCampaignSelect('', [], 'Select client first…');
    state.yearOptions = state.yearOptionsAll.slice();
    renderYearsMenu();
    finishClhResetUi();
    clearMembershipViewsIfEmpty();
    var placeholder = 'Select a client and campaign';
    if (els.chartSubtitle) els.chartSubtitle.textContent = placeholder;
    if (els.loadSubtitle) els.loadSubtitle.textContent = placeholder;
    setStatus('Choose a client and campaign to load membership history.');
  }

  function resetClhFilters() {
    bindEls();
    if (state.resetInFlight) return Promise.resolve();
    state.resetInFlight = true;
    closeAllClhMenus();
    state.yearsMenuSearch = '';
    state.hubCampaignOverride = false;
    state.userPickedClient = false;
    resetClhRefineDefaults();
    clhHubScopeSig = '';

    try {
      clearClhScopeAndViews();
    } catch (err) {
      setStatus((err && err.message) || 'Failed to reset filters', 'error');
    } finally {
      state.resetInFlight = false;
    }
    return Promise.resolve();
  }

  function applyHostCampaignPick() {
    if (!els.campaign || state.hubCampaignOverride) return false;
    var hubCampaigns = hostHubCampaigns();
    if (!hubCampaigns.length) return false;
    var client = els.client && els.client.value;
    if (!client) return false;
    var pick = preferredCampaignForClient(client);
    if (!pick || els.campaign.value === pick) return false;
    els.campaign.value = pick;
    syncScopeSelectUi('campaign');
    return true;
  }

  function resolveClientOption(pref) {
    if (!pref) return '';
    if (Join.pickKnownPartners) {
      var picked = Join.pickKnownPartners([pref], state.clients);
      if (picked.length) return picked[0];
    }
    if (state.clients.indexOf(pref) >= 0) return pref;
    if (Join.partitionKeysOverlap) {
      var i;
      for (i = 0; i < state.clients.length; i++) {
        if (Join.partitionKeysOverlap(state.clients[i], pref)) return state.clients[i];
      }
    }
    return '';
  }

  function clientMatchesHub(clientVal) {
    var pref = hostPreferredClient();
    if (!pref) return true;
    if (!clientVal) return false;
    var resolved = resolveClientOption(pref);
    if (resolved && clientVal === resolved) return true;
    if (Join.matchesSelectedPartners && Join.matchesSelectedPartners(clientVal, [pref])) return true;
    if (Join.partitionKeysOverlap && Join.partitionKeysOverlap(clientVal, pref)) return true;
    return false;
  }

  function hubScopeDiffersFromUi() {
    if (!host || typeof host.getFilters !== 'function') return false;
    var f = host.getFilters();
    var partners = f.scopePartners || f.partners || [];
    if (partners.length && !clientMatchesHub(els.client && els.client.value)) return true;
    var hubCampaigns = hostHubCampaigns();
    if (hubCampaigns.length && !state.hubCampaignOverride) {
      var client = els.client && els.client.value;
      if (!client) return true;
      var pick = preferredCampaignForClient(client);
      if (pick && els.campaign && els.campaign.value !== pick) return true;
    }
    return false;
  }

  function applyHubScopeToChapter(opts) {
    opts = opts || {};
    if (!host || typeof host.getFilters !== 'function') return Promise.resolve();
    if (!embedState.ready) {
      state.pendingHubSync = true;
      return Promise.resolve();
    }

    if (opts.fromHubApply) {
      state.hubCampaignOverride = false;
      state.refinePending = false;
    }

    var f = host.getFilters();
    var sig = host.getScopeSignature ? host.getScopeSignature(f) : '';
    var sigChanged = sig !== clhHubScopeSig;
    if (sigChanged) {
      state.hubCampaignOverride = false;
      state.refinePending = false;
      clhHubScopeSig = sig;
    }

    if (!sigChanged && !opts.force && !hubScopeDiffersFromUi()) {
      return Promise.resolve();
    }

    if (opts.fromHubApply && !hostPreferredClient() && !hostHubCampaigns().length) {
      if (els.client && trimStr(els.client.value)) {
        clearClhScopeAndViews();
        return Promise.resolve();
      }
    }

    var fHub = host.getFilters();
    if (fHub && fHub.hubScopeSuppressed && !hostPreferredClient() && !hostHubCampaigns().length) {
      if (els.client && trimStr(els.client.value)) {
        clearClhScopeAndViews();
        return Promise.resolve();
      }
    }

    var prefClient = hostPreferredClient();
    var resolved = resolveClientOption(prefClient);
    var clientChanged = false;
    if (resolved && els.client && els.client.value !== resolved) {
      els.client.value = resolved;
      syncScopeSelectUi('client');
      clientChanged = true;
      if (opts.fromHubApply || sigChanged) state.hubCampaignOverride = false;
    }

    var runPipeline = function () {
      applyHostCampaignPick();
      markRefinePending();
      if (scopeDraftSig() !== scopeAppliedSig()) {
        invalidateMembershipUntilApply();
      }
      updateScopeSummary();
      updateFilterActionsUi();
      return Promise.resolve();
    };

    if (clientChanged) {
      return updateCampaignOptions({ useHubPreferred: true, autoPickSingle: false }).then(runPipeline);
    }
    return updateCampaignOptions({ useHubPreferred: true, autoPickSingle: false }).then(runPipeline);
  }

  function applyHostFilters() {
    return applyHubScopeToChapter({ force: false, fromHubApply: false });
  }

  function campaignPickForClient(client, list) {
    var hubPick = preferredCampaignForClient(client);
    if (hubPick) return hubPick;
    var options = list && list.length ? list : campaignOptionsForClient(client);
    var i;
    for (i = 0; i < options.length; i++) {
      if (String(options[i]).toUpperCase() === 'CNVA') return options[i];
    }
    return options.length ? options[0] : '';
  }

  function ensureDefaultMembershipLoaded() {
    bindEls();
    if (!els.client) return Promise.resolve();
    if (state.userPickedClient && trimStr(els.client.value)) {
      if (scopeDraftSig() !== scopeAppliedSig() && trimStr(els.campaign && els.campaign.value)) {
        return applyRefineFromDraft();
      }
      return Promise.resolve();
    }
    var hubClient = hostPreferredClient();
    var highPoint = resolveClientOption(DEFAULT_LOAD_CLIENT);
    var client = (hubClient && state.clients.indexOf(hubClient) >= 0) ? hubClient : '';
    if (!client && highPoint && state.clients.indexOf(highPoint) >= 0) client = highPoint;
    if (!client) return Promise.resolve();
    if (els.client.value !== client) {
      els.client.value = client;
      syncScopeSelectUi('client');
    }
    return syncCampaignSelectForClient(client, { useHubPreferred: true, autoPickSingle: false }).then(function (list) {
      var pick = campaignPickForClient(client, list);
      if (pick && els.campaign && els.campaign.value !== pick) {
        els.campaign.value = pick;
        syncScopeSelectUi('campaign');
      }
      updateScopeSummary();
      if (!trimStr(els.client.value) || !trimStr(els.campaign && els.campaign.value)) return;
      if (scopeDraftSig() === scopeAppliedSig() && state.dailyRows.length) return;
      return applyRefineFromDraft();
    });
  }

  function fetchFilterOptions() {
    // Lightweight DISTINCT queries — avoid scanning full client×campaign cartesian up front.
    var memberOk =
      "MEMBERSHIP_DATE IS NOT NULL AND MEMBERSHIP_DATE > '" + SENTINEL + "'";

    return Promise.all([
      runSql(
        'SELECT PARTITION FROM ' + DATA_ALIAS +
        ' WHERE PARTITION IS NOT NULL AND ' + memberOk +
        ' GROUP BY PARTITION',
        'Clients'
      ),
      runSql(
        'SELECT CAMPAIGN_YEAR, CF_ENTRY_YEAR FROM ' + DATA_ALIAS +
        ' WHERE CAMPAIGN_YEAR IS NOT NULL AND ' + memberOk +
        ' GROUP BY CAMPAIGN_YEAR, CF_ENTRY_YEAR',
        'Campaign years'
      ),
      runSql(
        'SELECT CF_RECORD_TYPE FROM ' + DATA_ALIAS +
        ' WHERE CF_RECORD_TYPE IS NOT NULL AND ' + memberOk +
        ' GROUP BY CF_RECORD_TYPE',
        'Record types'
      ),
      runSql(
        'SELECT ORIGIN_SEGMENT FROM ' + DATA_ALIAS +
        ' WHERE ORIGIN_SEGMENT IS NOT NULL AND ' + memberOk +
        ' GROUP BY ORIGIN_SEGMENT',
        'Origin segments'
      ),
      runSql(
        'SELECT PARTITION, PROGRAM_SOLUTION FROM ' + DATA_ALIAS +
        ' WHERE PARTITION IS NOT NULL AND PROGRAM_SOLUTION IS NOT NULL AND ' + memberOk +
        ' GROUP BY PARTITION, PROGRAM_SOLUTION',
        'Client × campaign'
      ),
      fetchPartnerFilterOptions()
    ]).then(function (results) {
      var clientsParsed = results[0];
      var years = results[1];
      var rts = results[2];
      var origins = results[3];
      var pairsParsed = results[4];
      var partnerFilterOptions = results[5];
      state.clientCampaignPairsParsed = pairsParsed;

      var iPart = colIdx(clientsParsed.cols, 'PARTITION');
      var rawClients = clientsParsed.rows.map(function (row) {
        return trimStr(row[iPart]);
      }).filter(Boolean);
      applyClientListFromPartnerFilter(rawClients, partnerFilterOptions);
      rebuildCampaignMapsFromPairs(pairsParsed, partnerFilterOptions);

      var iCy = colIdx(years.cols, 'CAMPAIGN_YEAR');
      var iEntry = colIdx(years.cols, 'CF_ENTRY_YEAR');
      var yearMap = {};
      years.rows.forEach(function (row) {
        var cy = trimStr(row[iCy]);
        var entry = trimStr(row[iEntry]);
        if (!cy) return;
        if (!yearMap[cy]) {
          yearMap[cy] = { cy: cy, entry: entryYearFromCy(cy) || entry };
        }
      });
      state.yearOptionsAll = Object.keys(yearMap).map(function (k) { return yearMap[k]; })
        .sort(function (a, b) { return (cyNumber(b.cy) || 0) - (cyNumber(a.cy) || 0); });
      state.yearOptions = state.yearOptionsAll.slice();
      state.chartDraft.years = defaultYearsForOptions(state.yearOptions);
      state.chartApplied.years = state.chartDraft.years.slice();

      var rtSet = {};
      var iRt = colIdx(rts.cols, 'CF_RECORD_TYPE');
      rts.rows.forEach(function (row) {
        var rt = trimStr(row[iRt]);
        if (rt) rtSet[rt] = true;
      });
      applyRecordTypeOptions(rtSet);

      var originSet = {};
      var iOrigin = colIdx(origins.cols, 'ORIGIN_SEGMENT');
      origins.rows.forEach(function (row) {
        var o = trimStr(row[iOrigin]);
        if (o) originSet[o] = true;
      });
      applyOriginOptions(originSet);

      refreshClientSelect(hostPreferredClient());
      renderYearsMenu();
      return syncCampaignSelectForClient(els.client.value, {
        useHubPreferred: true,
        autoPickSingle: false
      }).then(function () {
        applyHostCampaignPick();
        markRefinePending();
        updateScopeSummary();
        updateFilterActionsUi();
      });
    });
  }

  function refreshClientSelect(preferred) {
    if (!els.client) return;
    var raw = preferred || hostPreferredClient() || els.client.value;
    var pick = resolveClientOption(raw) || raw;
    fillSelect(els.client, state.clients, 'Select client…', pick, { kind: 'client' });
  }

  function fillCampaignSelect(client, list, placeholder, fillOpts) {
    fillOpts = fillOpts || {};
    var preferred = '';
    if (fillOpts.preferred != null && fillOpts.preferred !== '') {
      preferred = fillOpts.preferred;
    } else if (fillOpts.useHubPreferred && !state.hubCampaignOverride) {
      preferred = preferredCampaignForClient(client);
    } else if (state.hubCampaignOverride && els.campaign) {
      preferred = els.campaign.value;
    }
    fillSelect(els.campaign, list, placeholder || 'Select campaign…', preferred, {
      kind: 'campaign',
      clientSelected: !!client,
      autoPickSingle: !!fillOpts.autoPickSingle
    });
  }

  function syncCampaignSelectForClient(client, fillOpts) {
    fillOpts = fillOpts || {};
    if (!client) {
      fillCampaignSelect('', [], 'Select client first…', fillOpts);
      return Promise.resolve([]);
    }
    var cached = state.campaignsByClient[client];
    if (cached && cached.length) {
      fillCampaignSelect(client, cached, cached.length ? 'Select campaign…' : 'No campaigns for client', fillOpts);
      return Promise.resolve(cached);
    }
    return loadCampaignsForClient(client, fillOpts);
  }

  function loadCampaignsForClient(client, fillOpts) {
    fillOpts = fillOpts || {};
    if (!client) {
      fillCampaignSelect('', [], 'Select client first…', fillOpts);
      return Promise.resolve([]);
    }
    var cached = state.campaignsByClient[client];
    if (cached && cached.length) {
      fillCampaignSelect(client, cached, undefined, fillOpts);
      return Promise.resolve(cached);
    }
    fillCampaignSelect(client, [], 'Loading campaigns…', fillOpts);
    var sql =
      'SELECT PROGRAM_SOLUTION FROM ' + DATA_ALIAS +
      " WHERE PARTITION = '" + escapeSql(client) + "' " +
      "AND PROGRAM_SOLUTION IS NOT NULL " +
      "AND MEMBERSHIP_DATE IS NOT NULL AND MEMBERSHIP_DATE > '" + SENTINEL + "' " +
      'GROUP BY PROGRAM_SOLUTION';
    return runSql(sql, 'Campaigns for client').then(function (parsed) {
      var iProg = colIdx(parsed.cols, 'PROGRAM_SOLUTION');
      var list = parsed.rows.map(function (row) {
        return trimStr(row[iProg]);
      }).filter(Boolean).sort();
      state.campaignsByClient[client] = list;
      fillCampaignSelect(client, list, list.length ? 'Select campaign…' : 'No campaigns for client', fillOpts);
      return list;
    }).catch(function (err) {
      console.error('[clh] campaigns failed', err);
      delete state.campaignsByClient[client];
      fillCampaignSelect(client, [], 'Could not load campaigns — retry', fillOpts);
      throw err;
    });
  }

  function updateCampaignOptions(fillOpts) {
    return syncCampaignSelectForClient(els.client.value, fillOpts);
  }

  function membershipWhereSql() {
    var client = els.client.value;
    var campaign = els.campaign.value;
    if (!client || !campaign || !state.chartApplied.years.length) return null;

    var parts = [
      "PARTITION = '" + escapeSql(client) + "'",
      "PROGRAM_SOLUTION = '" + escapeSql(campaign) + "'",
      'CAMPAIGN_YEAR IN (' + sqlInList(state.chartApplied.years) + ')',
      'MEMBERSHIP_DATE IS NOT NULL',
      "MEMBERSHIP_DATE > '" + SENTINEL + "'"
    ];

    var rts = expandRecordTypesForSql(selectedRecordTypes());
    if (rts.length) {
      parts.push('CF_RECORD_TYPE IN (' + sqlInList(rts) + ')');
    }

    var origins = selectedOrigins();
    if (origins.length) {
      parts.push('ORIGIN_SEGMENT IN (' + sqlInList(origins) + ')');
    }

    return parts.join(' AND ');
  }

  function fetchDailyMembership() {
    var where = membershipWhereSql();
    if (!where) {
      state.dailyRows = [];
      return Promise.resolve([]);
    }

    var sql =
      'SELECT CAMPAIGN_YEAR, CF_ENTRY_YEAR, MEMBERSHIP_DATE, COUNT(*) AS CNT ' +
      'FROM ' + DATA_ALIAS + ' WHERE ' + where + ' ' +
      'GROUP BY CAMPAIGN_YEAR, CF_ENTRY_YEAR, MEMBERSHIP_DATE ' +
      'ORDER BY MEMBERSHIP_DATE';

    return runSql(sql, 'Membership daily').then(function (parsed) {
      var iCy = colIdx(parsed.cols, 'CAMPAIGN_YEAR');
      var iEntry = colIdx(parsed.cols, 'CF_ENTRY_YEAR');
      var iDate = colIdx(parsed.cols, 'MEMBERSHIP_DATE');
      var iCnt = colIdx(parsed.cols, 'CNT');
      if (iCnt < 0) iCnt = colIdx(parsed.cols, 'COUNT(*)');

      state.dailyRows = parsed.rows.map(function (row) {
        return {
          cy: trimStr(row[iCy]),
          entry: trimStr(row[iEntry]),
          date: parseDate(row[iDate]),
          count: Number(row[iCnt]) || 0
        };
      }).filter(function (r) { return r.cy && r.date && r.count > 0; });
      return state.dailyRows;
    });
  }

  function isOnOrBeforePit(date, cy) {
    if (!state.chartApplied.pitOnly || !date) return true;
    if (Join.pointInTimeIncludes) return Join.pointInTimeIncludes(date, cy, todayLocal());
    var n = cyNumber(cy);
    if (n == null) return true;
    var start = new Date(n, 7, 1);
    var off = Math.round((date - start) / 86400000);
    var today = todayLocal();
    var todayAnchor = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
    var todayOff = Math.round((today - new Date(todayAnchor, 7, 1)) / 86400000);
    if (off < 0) return true;
    return off <= todayOff;
  }

  function filteredDailyRows() {
    var years = state.chartApplied.years || [];
    return state.dailyRows.filter(function (r) {
      if (!r || !r.cy || !r.date) return false;
      if (years.indexOf(r.cy) < 0) return false;
      return isOnOrBeforePit(r.date, r.cy);
    });
  }

  function membershipVisualHasData(pack) {
    if (filteredDailyRows().length > 0) return true;
    return !!(pack && pack.series && pack.series.some(function (s) { return s.total > 0; }));
  }

  function buildSeriesFromDaily() {
    var byYear = {};
    state.dailyRows.forEach(function (r) {
      if (!isOnOrBeforePit(r.date, r.cy)) return;
      if (!byYear[r.cy]) byYear[r.cy] = { cy: r.cy, entry: r.entry, byDay: {} };
      if (!byYear[r.cy].entry && r.entry) byYear[r.cy].entry = r.entry;
      var key = ymd(r.date);
      byYear[r.cy].byDay[key] = (byYear[r.cy].byDay[key] || 0) + r.count;
    });

    var years = state.chartApplied.years.slice().sort(function (a, b) {
      return (cyNumber(a) || 0) - (cyNumber(b) || 0);
    });

    // Align on cycle day using the newest selected year as the label axis
    var labelCy = years.length ? years[years.length - 1] : null;
    var labelYearNum = cyNumber(labelCy) || todayLocal().getFullYear();
    // CY26 is entry year 2027. The cycle is Aug 1 2026 through Jul 31 2027.
    var cycleStart = cycleStartForCy(labelCy, labelYearNum);
    var cycleEnd = new Date(labelYearNum + 1, 6, 31); // Jul 31 next
    var maxDay = Math.floor((cycleEnd - cycleStart) / 86400000);

    var labels = [];
    for (var d = 0; d <= maxDay; d++) {
      var ld = new Date(cycleStart.getTime());
      ld.setDate(ld.getDate() + d);
      labels.push(mdLabel(ld));
    }

    var series = years.map(function (cy) {
      var yd = byYear[cy] || { byDay: {}, entry: entryYearFromCy(cy) };
      var yearStart = cycleStartForCy(cy, labelYearNum);
      var yearRows = state.dailyRows.filter(function (r) {
        return r && r.cy === cy && r.date && isOnOrBeforePit(r.date, r.cy);
      });
      var placed = placeMembershipOnCycle(yearRows, yearStart, maxDay);
      var cum = placed.data;
      var lastNonNull = placed.lastDay;
      // When PIT, hide trailing flat line beyond last included day
      if (state.chartApplied.pitOnly && lastNonNull >= 0) {
        cum = cum.slice();
        for (var j = lastNonNull + 1; j <= maxDay; j++) cum[j] = null;
      }
      return {
        cy: cy,
        entry: entryYearFromCy(cy) || yd.entry,
        data: cum,
        total: placed.total,
        lastDay: lastNonNull
      };
    });

    return { labels: labels, series: series, cycleStart: cycleStart, maxDay: maxDay };
  }

  function chartUiColors() {
    var root = document.documentElement;
    var styles = getComputedStyle(root);
    var muted = trimStr(styles.getPropertyValue('--text-muted')) || '#6b7280';
    var grid = trimStr(styles.getPropertyValue('--row-border')) || 'rgba(15, 23, 42, 0.06)';
    var surface = trimStr(styles.getPropertyValue('--surface')) || '#ffffff';
    var text = trimStr(styles.getPropertyValue('--text')) || '#1a1a1a';
    return { muted: muted, grid: grid, surface: surface, text: text };
  }

  function renderYearLegend(pack) {
    if (!els.yearLegend) return;
    if (!pack || !pack.series || !pack.series.length) {
      els.yearLegend.hidden = true;
      els.yearLegend.innerHTML = '';
      return;
    }
    var items = pack.series.filter(function (s) { return s.total > 0; });
    if (!items.length) {
      els.yearLegend.hidden = true;
      els.yearLegend.innerHTML = '';
      return;
    }
    els.yearLegend.hidden = false;
    els.yearLegend.innerHTML = items.map(function (s, idx) {
      var color = CHART_COLORS[idx % CHART_COLORS.length];
      return '<span class="clh-legend-item">' +
        '<span class="clh-legend-swatch" style="background:' + escapeHtml(color) + '"></span>' +
        '<span>' + escapeHtml(s.cy) + ' · ' + escapeHtml(formatNum(s.total)) + '</span></span>';
    }).join('');
  }

  function renderChart(pack) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    renderYearLegend(pack);
    var hasData = membershipVisualHasData(pack);
    if (!hasData) {
      if (els.chartCanvas) els.chartCanvas.style.display = 'none';
      if (els.chartEmpty) {
        els.chartEmpty.hidden = false;
        setMembershipPanelMessage(
          els.chartEmpty,
          pack ? 'No membership data for the current filters.' : 'Select a client and campaign.',
          null
        );
      }
      return;
    }
    if (els.chartEmpty) els.chartEmpty.hidden = true;
    els.chartCanvas.style.display = 'block';
    if (typeof Chart === 'undefined') return;

    var ui = chartUiColors();
    var datasets = pack.series.map(function (s, idx) {
      var color = CHART_COLORS[idx % CHART_COLORS.length];
      return {
        label: s.cy,
        data: s.data,
        borderColor: color,
        backgroundColor: color + '18',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: ui.surface,
        tension: 0.18,
        spanGaps: false,
        fill: false
      };
    });

    state.chart = new Chart(els.chartCanvas.getContext('2d'), {
      type: 'line',
      data: { labels: pack.labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: ui.surface,
            titleColor: ui.text,
            bodyColor: ui.muted,
            borderColor: ui.grid,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function (ctx) {
                var v = ctx.parsed.y;
                return ' ' + ctx.dataset.label + ': ' + (v == null ? '—' : formatNum(v));
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 14,
              font: { size: 10, weight: '500' },
              color: ui.muted
            },
            grid: { display: false },
            border: { color: ui.grid }
          },
          y: {
            beginAtZero: true,
            ticks: {
              font: { size: 10, weight: '500' },
              color: ui.muted,
              callback: function (v) { return formatNum(v); }
            },
            grid: { color: ui.grid },
            border: { display: false }
          }
        }
      }
    });
  }

  function renderLoadTable(pack) {
    var years = (pack && pack.series ? pack.series : []).slice().sort(function (a, b) {
      return (cyNumber(b.cy) || 0) - (cyNumber(a.cy) || 0);
    });
    if (!membershipVisualHasData(pack)) {
      els.loadHead.innerHTML = '';
      els.loadBody.innerHTML = '';
      if (els.loadEmpty) {
        els.loadEmpty.hidden = false;
        setMembershipPanelMessage(
          els.loadEmpty,
          pack ? 'No daily load rows for the current filters.' : 'Select a client and campaign.',
          null
        );
      }
      return;
    }
    if (!years.length) {
      els.loadHead.innerHTML = '';
      els.loadBody.innerHTML = '';
      if (els.loadEmpty) {
        els.loadEmpty.hidden = false;
        setMembershipPanelMessage(els.loadEmpty, 'No daily load rows for the current filters.', null);
      }
      return;
    }

    // Build cumulative-by-MD map per year from daily rows
    var byYearMd = {};
    years.forEach(function (s) { byYearMd[s.cy] = {}; });
    state.dailyRows.forEach(function (r) {
      if (!byYearMd[r.cy]) return;
      if (!isOnOrBeforePit(r.date, r.cy)) return;
      var key = mdKey(r.date);
      byYearMd[r.cy][key] = (byYearMd[r.cy][key] || 0) + r.count;
    });

    var cumByYearMd = {};
    years.forEach(function (s) {
      var keys = Object.keys(byYearMd[s.cy] || {}).sort();
      var running = 0;
      cumByYearMd[s.cy] = {};
      keys.forEach(function (k) {
        running += byYearMd[s.cy][k];
        cumByYearMd[s.cy][k] = running;
      });
    });

    var labelCy = years[0].cy;
    var yi;
    for (yi = 0; yi < years.length; yi++) {
      if (Object.keys(cumByYearMd[years[yi].cy] || {}).length) {
        labelCy = years[yi].cy;
        break;
      }
    }
    var labelKeys = Object.keys(cumByYearMd[labelCy] || {}).sort().reverse();
    if (!labelKeys.length) {
      els.loadHead.innerHTML = '';
      els.loadBody.innerHTML = '';
      if (els.loadEmpty) {
        els.loadEmpty.hidden = false;
        setMembershipPanelMessage(els.loadEmpty, 'No daily load rows for the current filters.', null);
      }
      return;
    }
    if (els.loadEmpty) els.loadEmpty.hidden = true;

    var head = '<tr><th>Campaign Year Membership Date (' + escapeHtml(labelCy) + ')</th>';
    years.slice().reverse().forEach(function (s) {
      var rts = selectedRecordTypes();
      var rtLabel = rts.length === 1 ? rts[0] + ' ' : '';
      head += '<th class="num">' + escapeHtml(s.cy) + ' ' + escapeHtml(rtLabel) + 'Records</th>';
    });
    head += '</tr>';
    els.loadHead.innerHTML = head;

    // Resolve calendar year for labelCy display dates from data
    var labelYearNum = null;
    state.dailyRows.forEach(function (r) {
      if (r.cy === labelCy && r.date) {
        var y = r.date.getFullYear();
        if (labelYearNum == null || y > labelYearNum) labelYearNum = y;
      }
    });
    if (labelYearNum == null) labelYearNum = cyNumber(labelCy) || todayLocal().getFullYear();

    var html = '';
    labelKeys.forEach(function (md) {
      var parts = md.split('-');
      var disp = pad2(Number(parts[0])) + '/' + pad2(Number(parts[1])) + '/' + labelYearNum;
      html += '<tr><td>' + escapeHtml(disp) + '</td>';
      years.slice().reverse().forEach(function (s) {
        var v = cumByYearMd[s.cy][md];
        // If exact MD missing for prior year, carry forward last cumulative <= md
        if (v == null) {
          var keys = Object.keys(cumByYearMd[s.cy]).sort();
          var last = null;
          for (var i = 0; i < keys.length; i++) {
            if (keys[i] <= md) last = cumByYearMd[s.cy][keys[i]];
            else break;
          }
          v = last;
        }
        html += '<td class="num">' + formatNum(v) + '</td>';
      });
      html += '</tr>';
    });
    els.loadBody.innerHTML = html;
  }

  function clearMembershipViewsIfEmpty() {
    renderChart(null);
    renderLoadTable(null);
  }

  function renderMembershipFromCachedRows() {
    if (!state.dailyRows.length) return false;
    var pack = buildSeriesFromDaily();
    if (!membershipVisualHasData(pack)) return false;
    renderChart(pack);
    renderLoadTable(pack);
    return true;
  }

  function refreshMembershipViews(opts) {
    opts = opts || {};
    bindEls();
    var client = els.client ? trimStr(els.client.value) : '';
    var campaign = els.campaign ? trimStr(els.campaign.value) : '';
    var sub = contextSubtitle();
    if (els.chartSubtitle) els.chartSubtitle.textContent = sub;
    if (els.loadSubtitle) els.loadSubtitle.textContent = sub;

    if (!client || !campaign) {
      setStatus('Choose a client and campaign to load membership history.');
      if (!renderMembershipFromCachedRows() && !state.dailyRows.length) clearMembershipViewsIfEmpty();
      return Promise.resolve();
    }
    if (!state.chartApplied.years.length) {
      setStatus('Select at least one campaign year, then Apply.', 'error');
      if (!renderMembershipFromCachedRows() && !state.dailyRows.length) clearMembershipViewsIfEmpty();
      updateScopeSummary();
      return Promise.resolve();
    }

    var gen = ++state.loadGen;
    if (!opts.skipLoadChrome) {
      showMembershipPanelsLoading();
      setStatus('Loading membership…', 'loading');
    }
    return fetchDailyMembership().then(function () {
      if (gen !== state.loadGen) return;
      var pack = buildSeriesFromDaily();
      renderChart(pack);
      renderLoadTable(pack);
      var totals = pack.series.map(function (s) {
        return s.cy + ': ' + formatNum(s.total);
      }).join(' · ');
      setStatus(totals || 'No rows for current filters.');
      updateScopeSummary();
    }).catch(function (err) {
      if (gen !== state.loadGen) return;
      console.error('[clh] membership load failed', err);
      setStatus((err && err.message) || 'Failed to load membership data', 'error');
      if (!renderMembershipFromCachedRows()) {
        renderChart(null);
        renderLoadTable(null);
      }
    }).finally(function () {
      hideMembershipPanelsLoading();
    });
  }

  // --------------------------------------------------------------------------
  // Point-in-time all-clients table (filters do not apply)
  // --------------------------------------------------------------------------

  function currentPriorYearPair() {
    var years = state.yearOptionsAll.slice().sort(function (a, b) {
      return (cyNumber(b.cy) || 0) - (cyNumber(a.cy) || 0);
    });
    var current = years[0] ? years[0].cy : 'CY25';
    var prior = years[1] ? years[1].cy : null;
    if (!prior) {
      var entry = entryYearFromCy(current);
      if (entry != null) {
        var priorYy = entry - 2002;
        prior = 'CY' + (priorYy < 10 ? '0' + priorYy : String(priorYy));
      } else {
        prior = 'CY24';
      }
    }
    return { current: current, prior: prior };
  }

  function pitDateLiteralForCy(cy) {
    var today = todayLocal();
    if (Join.pointInTimeCutoffDate) return ymd(Join.pointInTimeCutoffDate(cy, today));
    var n = cyNumber(cy);
    if (n == null) return ymd(today);
    var todayAnchor = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
    var todayOff = Math.round((today - new Date(todayAnchor, 7, 1)) / 86400000);
    if (todayOff < 0) todayOff = 0;
    var cut = new Date(n, 7, 1);
    cut.setDate(cut.getDate() + todayOff);
    return ymd(cut);
  }

  function fetchPitTable() {
    var pair = currentPriorYearPair();
    var priorCut = pitDateLiteralForCy(pair.prior);
    var currentCut = pitDateLiteralForCy(pair.current);

    els.pitTitle.textContent = pair.prior + '-' + pair.current + ' Point in Time Student Records';
    els.pitColPrior.textContent = pair.prior + ' Student Records';
    els.pitColCurrent.textContent = pair.current + ' Student Records';

    var sql =
      'SELECT PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, COUNT(*) AS CNT ' +
      'FROM ' + DATA_ALIAS + ' ' +
      'WHERE CAMPAIGN_YEAR IN (' + sqlInList([pair.prior, pair.current]) + ') ' +
      "AND CF_RECORD_TYPE IN ('Student','Fr','FR','student','fr') " +
      'AND MEMBERSHIP_DATE IS NOT NULL ' +
      "AND MEMBERSHIP_DATE > '" + SENTINEL + "' " +
      'AND (' +
      "  (CAMPAIGN_YEAR = '" + escapeSql(pair.prior) + "' AND MEMBERSHIP_DATE <= '" + priorCut + "') OR " +
      "  (CAMPAIGN_YEAR = '" + escapeSql(pair.current) + "' AND MEMBERSHIP_DATE <= '" + currentCut + "')" +
      ') ' +
      'GROUP BY PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR';

    setPitStatus('Loading point-in-time student totals…');
    if (chapterRoot) chapterRoot.classList.add('clh-is-loading-pit');
    return runSql(sql, 'PIT table').then(function (parsed) {
      var iPart = colIdx(parsed.cols, 'PARTITION');
      var iProg = colIdx(parsed.cols, 'PROGRAM_SOLUTION');
      var iCy = colIdx(parsed.cols, 'CAMPAIGN_YEAR');
      var iCnt = colIdx(parsed.cols, 'CNT');
      if (iCnt < 0) iCnt = parsed.cols.length - 1;

      var map = {};
      parsed.rows.forEach(function (row) {
        var client = trimStr(row[iPart]);
        var campaign = trimStr(row[iProg]);
        var cy = trimStr(row[iCy]);
        var cnt = Number(row[iCnt]) || 0;
        if (!client || !campaign) return;
        var key = client + '\0' + campaign;
        if (!map[key]) map[key] = { client: client, campaign: campaign, prior: 0, current: 0 };
        if (cy === pair.prior) map[key].prior += cnt;
        if (cy === pair.current) map[key].current += cnt;
      });

      // Keep rows with any current-year activity (active CY campaigns)
      state.pitRows = Object.keys(map).map(function (k) { return map[k]; })
        .filter(function (r) { return r.current > 0 || r.prior > 0; });

      setPitStatus(state.pitRows.length.toLocaleString() + ' client / campaign rows · as of ' +
        currentCut + ' / ' + priorCut);
      renderPitTable();
    }).catch(function (err) {
      console.error('[clh] PIT table failed', err);
      setPitStatus((err && err.message) || 'Failed to load point-in-time table', 'error');
      state.pitRows = [];
      renderPitTable();
    }).finally(function () {
      if (chapterRoot) chapterRoot.classList.remove('clh-is-loading-pit');
    });
  }

  function visiblePitRows() {
    var q = trimStr(state.pitSearch).toLowerCase();
    var rows = (state.pitRows || []).filter(function (r) {
      if (!q) return true;
      return r.client.toLowerCase().indexOf(q) >= 0 || r.campaign.toLowerCase().indexOf(q) >= 0;
    });
    var key = state.pitSort.key;
    var dir = state.pitSort.dir === 'desc' ? -1 : 1;
    rows.sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (typeof av === 'string') {
        return av.toLowerCase().localeCompare(String(bv).toLowerCase()) * dir;
      }
      return ((av || 0) - (bv || 0)) * dir;
    });
    return rows;
  }

  function exportPitTable() {
    var OER = global.OpsExportReport;
    if (!OER || typeof ExcelJS === 'undefined') {
      setPitStatus('Export requires ExcelJS.', 'error');
      return;
    }
    var rows = visiblePitRows();
    if (!rows.length) {
      setPitStatus('No point-in-time rows to export.', 'error');
      return;
    }
    var priorLabel = els.pitColPrior ? els.pitColPrior.textContent : 'Prior year';
    var currentLabel = els.pitColCurrent ? els.pitColCurrent.textContent : 'Current year';
    var title = els.pitTitle ? els.pitTitle.textContent : 'Point in Time Student Records';
    var subtitle = trimStr(state.pitSearch)
      ? 'Search: ' + trimStr(state.pitSearch)
      : 'All client and campaign rows. Chapter filters do not apply.';
    var wb = OER.createWorkbook();
    OER.addDataSheet(wb, {
      name: 'Point-in-time comparison',
      docTitle: 'Campaign Load History',
      sectionTitle: title,
      subtitle: subtitle,
      headers: ['Client', 'Campaign', priorLabel, currentLabel],
      rows: rows.map(function (r) {
        return [r.client, r.campaign, r.prior, r.current];
      }),
      colAlign: ['left', 'left', 'right', 'right']
    });
    var btn = els.pitExport;
    OER.downloadWorkbook(wb, 'point-in-time-student-records-' + OER.fileStamp() + '.xlsx')
      .then(function () {
        if (!btn) return;
        btn.textContent = 'Exported';
        global.setTimeout(function () {
          if (btn) btn.textContent = 'Export table';
        }, 1600);
      })
      .catch(function (err) {
        console.warn('[CLH] Point-in-time export failed:', err);
        setPitStatus('Export failed.', 'error');
      });
  }

  function renderPitTable() {
    var rows = visiblePitRows();
    var key = state.pitSort.key;

    chapterQueryAll('[data-pit-sort]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-pit-sort') === key ? 'true' : 'false');
    });

    if (els.pitExport) els.pitExport.disabled = !rows.length;
    if (!rows.length) {
      els.pitBody.innerHTML = '';
      els.pitEmpty.hidden = false;
      return;
    }
    els.pitEmpty.hidden = true;
    els.pitBody.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.client) + '</td>' +
        '<td>' + escapeHtml(r.campaign) + '</td>' +
        '<td class="num">' + formatNum(r.prior) + '</td>' +
        '<td class="num">' + formatNum(r.current) + '</td>' +
        '</tr>';
    }).join('');
  }

  // --------------------------------------------------------------------------
  // Events + boot
  // --------------------------------------------------------------------------

  function clhMultiMenuPairs() {
    return [
      { trigger: els.clientTrigger, menu: els.clientMenu },
      { trigger: els.campaignTrigger, menu: els.campaignMenu },
      { trigger: els.yearsTrigger, menu: els.yearsMenu },
      { trigger: els.recordTypeTrigger, menu: els.recordTypeMenu },
      { trigger: els.originTrigger, menu: els.originMenu }
    ].filter(function (p) { return p.trigger && p.menu; });
  }

  function clhScopeClusterEl() {
    return chapterRoot ? chapterRoot.querySelector('#clhScopeFilterCluster') : null;
  }

  function syncClhScopeClusterOpen() {
    var cluster = clhScopeClusterEl();
    if (!cluster) return;
    var scopeMenus = [
      { trigger: els.clientTrigger, menu: els.clientMenu },
      { trigger: els.campaignTrigger, menu: els.campaignMenu },
      { trigger: els.yearsTrigger, menu: els.yearsMenu }
    ];
    var open = scopeMenus.some(function (p) {
      return p.trigger && p.trigger.getAttribute('aria-expanded') === 'true';
    });
    cluster.classList.toggle('is-linked-open', open);
  }

  function toggleClhMenu(trigger, menu, open) {
    if (!trigger || !menu) return;
    var show = open == null ? menu.hasAttribute('hidden') : !!open;
    if (show) {
      clhMultiMenuPairs().forEach(function (p) {
        if (p.menu === menu) return;
        toggleClhMenu(p.trigger, p.menu, false);
      });
      menu.removeAttribute('hidden');
    } else {
      menu.setAttribute('hidden', '');
    }
    trigger.setAttribute('aria-expanded', show ? 'true' : 'false');
    var field = trigger.closest('.field-multi');
    if (field) field.classList.toggle('is-open', show);
    syncClhScopeClusterOpen();
  }

  function closeAllClhMenus() {
    clhMultiMenuPairs().forEach(function (p) {
      toggleClhMenu(p.trigger, p.menu, false);
    });
  }

  function toggleClhYearsMenu(open) {
    toggleClhMenu(els.yearsTrigger, els.yearsMenu, open);
  }

  function bindEventsOnce() {
    if (controlsBound) return;
    controlsBound = true;
    if (chapterRoot && !chapterRoot.dataset.clhFilterActionsBound) {
      chapterRoot.dataset.clhFilterActionsBound = '1';
      chapterRoot.addEventListener('click', function (ev) {
        if (!tabActive) return;
        var btn = ev.target && ev.target.closest
          ? ev.target.closest('#clhBtnApplyFilters, #clhBtnResetFilters')
          : null;
        if (!btn || btn.disabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.id === 'clhBtnApplyFilters') applyRefineFromDraft();
        else resetClhFilters();
      });
    }
    if (els.client) {
      els.client.addEventListener('change', function () {
        state.userPickedClient = true;
        state.hubCampaignOverride = false;
        var newClient = trimStr(els.client.value);
        if (newClient !== state.lastScopeClient) {
          if (els.campaign) {
            els.campaign.value = '';
            syncScopeSelectUi('campaign');
          }
        }
        state.lastScopeClient = newClient;
        if (!newClient) state.dailyRows = [];
        onScopeDraftChanged();
      });
    }
    if (els.campaign) {
      els.campaign.addEventListener('change', function () {
        state.hubCampaignOverride = true;
        onScopeDraftChanged();
      });
    }
    if (els.pitToggle) {
      els.pitToggle.addEventListener('click', function () {
        state.chartDraft.pitOnly = !state.chartDraft.pitOnly;
        syncPitToggleUi();
        markRefinePending();
        updateScopeSummary();
      });
    }
    bindFilterActionButtons();
    clhMultiMenuPairs().forEach(function (pair) {
      pair.menu.addEventListener('click', function (ev) { ev.stopPropagation(); });
      pair.trigger.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (pair.trigger.disabled) return;
        var opening = pair.menu.hasAttribute('hidden');
        toggleClhMenu(pair.trigger, pair.menu);
        if (opening && pair.menu === els.clientMenu) renderScopeSelectMenu('client');
        if (opening && pair.menu === els.campaignMenu) renderScopeSelectMenu('campaign');
        if (opening && pair.menu === els.yearsMenu) renderYearsMenu();
        if (opening && pair.menu === els.recordTypeMenu) renderRecordTypeMenu();
        if (opening && pair.menu === els.originMenu) renderOriginMenu();
      });
    });
    document.addEventListener('click', function (e) {
      if (!tabActive) return;
      var inside = clhMultiMenuPairs().some(function (p) {
        return p.menu.contains(e.target) || p.trigger.contains(e.target);
      });
      if (!inside) closeAllClhMenus();
    });
    if (els.pitSearch) {
      els.pitSearch.addEventListener('input', function () {
        state.pitSearch = els.pitSearch.value;
        renderPitTable();
      });
    }
    if (els.pitExport) {
      els.pitExport.addEventListener('click', function () {
        exportPitTable();
      });
    }
    chapterQueryAll('[data-pit-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-pit-sort');
        if (state.pitSort.key === key) {
          state.pitSort.dir = state.pitSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.pitSort.key = key;
          state.pitSort.dir = 'asc';
        }
        renderPitTable();
      });
    });
  }

  function bootLoadHistory() {
    bindEls();
    if (typeof domo === 'undefined') {
      setStatus('Domo API unavailable — open this app from a ClearSquare / Domo card.', 'error');
      return;
    }
    bindEventsOnce();
    setAppLoading(true, 'Loading campaign filters…');
    setStatus('Loading campaign load history…');

    fetchFilterOptions()
      .then(function () {
        setAppLoading(true, 'Loading point-in-time table…');
        return fetchPitTable();
      })
      .then(function () {
        setAppLoading(false);
        setStatus('Select client and campaign, then click Apply to load membership history.');
        var pendingHub = state.pendingHubSync;
        state.pendingHubSync = false;
        embedState.ready = true;
        embedState.error = '';
        chapterRefresh();
        updateScopeSummary();
        updateFilterActionsUi();
        return applyHubScopeToChapter({ force: true, fromHubApply: pendingHub }).then(function () {
          return ensureDefaultMembershipLoaded();
        });
      })
      .catch(function (err) {
        console.error('[clh] boot failed', err);
        setAppLoading(false);
        embedState.error = (err && err.message) || 'Failed to start Campaign Load History';
        setStatus(embedState.error, 'error');
        setPitStatus('Could not load filters / data. Confirm the leads dataset is mapped (alias `leads`, id ' +
          DATASET_ID + ').', 'error');
      });
  }

  global.PartnerCampaignLoadHistoryTab = {
    init: function (h) {
      host = h;
      chapterRoot = document.getElementById('campaignLoadHistoryChapter');
      bindEls();
    },
    activate: function () {
      tabActive = true;
      bindEls();
      if (!embedState.ready && !embedState.loading) return bootLoadHistory();
      return applyHubScopeToChapter({ force: true, fromHubApply: false }).then(function () {
        return ensureDefaultMembershipLoaded();
      });
    },
    deactivate: function () {
      tabActive = false;
      if (state.chart) {
        state.chart.destroy();
        state.chart = null;
      }
    },
    refresh: function () {
      if (!tabActive) return;
      embedState.ready = false;
      if (typeof state !== 'undefined' && state.loadPromise) state.loadPromise = null;
      if (typeof loadPromise !== 'undefined') loadPromise = null;
      return bootLoadHistory();
    },
    onFiltersChanged: function () {
      refreshClientFilterFromHub().then(function () {
        applyHubScopeToChapter({ force: true, fromHubApply: true });
      });
    },
    handleClick: function (ev) {
      return !!(tabActive && chapterRoot && chapterRoot.contains(ev.target));
    },
    isLoading: function () { return embedState.loading; },
    getRowCount: function () {
      return (state.pitRows && state.pitRows.length) || 0;
    },
    getHubStat: function () {
      var n = (state.pitRows && state.pitRows.length) || 0;
      if (!n) return { value: null, label: 'needs client' };
      return { value: n, label: 'PIT students' };
    },
    getError: function () { return embedState.error; },
    exportChapterReport: function () {
      var OER = global.OpsExportReport;
      if (!OER || typeof ExcelJS === 'undefined') {
        setStatus('Export requires ExcelJS.', 'error');
        return;
      }
      if (embedState.loading) {
        setStatus('Data is still loading.', 'loading');
        return;
      }
      var blocks = [];
      var subtitleParts = [];
      if (els.client && els.client.value) subtitleParts.push('Client ' + els.client.value);
      if (els.campaign && els.campaign.value) subtitleParts.push('Campaign ' + els.campaign.value);
      if (state.chartApplied.years && state.chartApplied.years.length) {
        subtitleParts.push('Years ' + state.chartApplied.years.join(', '));
      }
      var subtitle = subtitleParts.length ? subtitleParts.join('  ·  ') : 'Campaign load history';

      if (state.dailyRows && state.dailyRows.length) {
        var dailyHeaders = ['Campaign year', 'Entry year', 'Membership date', 'Count'];
        var dailyBody = state.dailyRows.map(function (r) {
          return [r.cy, r.entry, r.date ? ymd(r.date) : '', r.count];
        });
        blocks.push({
          title: 'Daily membership load',
          headers: dailyHeaders,
          rows: dailyBody,
          colAlign: ['left', 'left', 'left', 'right']
        });
      }

      var pitFiltered = visiblePitRows();
      if (pitFiltered.length) {
        var pitHeaders = [
          'Client',
          'Campaign',
          els.pitColPrior ? els.pitColPrior.textContent : 'Prior year',
          els.pitColCurrent ? els.pitColCurrent.textContent : 'Current year'
        ];
        var pitBody = pitFiltered.map(function (r) {
          return [r.client, r.campaign, r.prior, r.current];
        });
        blocks.push({
          title: 'Point-in-time comparison',
          headers: pitHeaders,
          rows: pitBody,
          colAlign: ['left', 'left', 'right', 'right']
        });
      }

      if (!blocks.length) {
        setStatus('Select a client and campaign with loaded data to export.', 'error');
        return;
      }

      var wb = OER.createWorkbook();
      OER.addConsolidatedSheet(wb, {
        name: 'All Together',
        docTitle: 'Campaign Load History',
        subtitle: subtitle,
        blocks: blocks
      });
      blocks.forEach(function (block) {
        OER.addDataSheet(wb, {
          name: block.title.slice(0, 31),
          docTitle: 'Campaign Load History',
          sectionTitle: block.title,
          subtitle: subtitle,
          headers: block.headers,
          rows: block.rows,
          colAlign: block.colAlign
        });
      });
      OER.downloadWorkbook(wb, 'campaign-load-history-report-' + OER.fileStamp() + '.xlsx')
        .then(function () { setStatus('Exported Campaign Load History report.'); })
        .catch(function (err) {
          console.warn('[CLH] Export failed:', err);
          setStatus('Export failed.', 'error');
        });
    }
  };
})(window);
