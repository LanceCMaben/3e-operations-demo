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

  function panelLoading(active, label) {
    var sk = $('timelinesSkeleton');
    if (sk) sk.hidden = !active;
    embedState.loading = !!active;
    if (active && label) hostStatus(label, 'loading');
  }

  var DATA_ALIAS = 'programs';
  var DATASET_ID = '59afa2d3-bbd8-4ed8-9e1c-c474f6fe7c46';
  var LAUNCH_OFFSET_DAYS = (global.OpsJoin && global.OpsJoin.DASHBOARD_AVAILABILITY_OFFSET_DAYS) || 14;
  var YEAR_COLORS = ['#FFDA0F', '#5BA4C9', '#6B7178', '#A3D6D5', '#C47B5B', '#7B8FA3', '#D4A017'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FIELD_KEYS = [
    'PARTITION',
    'PROGRAM_SOLUTION',
    'CAMPAIGN_YEAR',
    'PROGRAM_NAME',
    'PROGRAM_ID',
    'PROGRAM_STATUS',
    'FIRST_ACTIVITY',
    'LAST_ACTIVITY',
    'ACTIVE_FLAG'
  ];

  var els = {};

  function bindEls() {
    els.yearsTrigger = $('timelinesYearsTrigger');
    els.yearsTriggerLabel = $('timelinesYearsTriggerLabel');
    els.yearsMenu = $('timelinesYearsMenu');
    els.campaignTrigger = $('timelinesCampaignTrigger');
    els.campaignTriggerLabel = $('timelinesCampaignTriggerLabel');
    els.campaignMenu = $('timelinesCampaignMenu');
    els.campaignMulti = $('timelinesCampaignSelect');
    els.search = $('timelinesSearchFilter');
    els.todayToggle = $('timelinesTodayToggle');
    els.chartSubtitle = $('timelinesChartSubtitle');
    els.tableSubtitle = $('timelinesTableSubtitle');
    els.gantt = $('timelinesGantt');
    els.chartEmpty = $('timelinesChartEmpty');
    els.yearLegend = $('timelinesYearLegend');
    els.tableBody = $('timelinesActivityTableBody');
    els.tableEmpty = $('timelinesTableEmpty');
    els.tooltip = $('timelinesTooltip');
  }

  var Join = window.OpsJoin || {};
  var timelinesHubScopeSig = '';

  var state = {
    rows: [],
    yearOptions: [],
    campaignOptions: [],
    selectedYears: [],
    campaign: '',
    search: '',
    scopePartners: [],
    showToday: true,
    yearColor: {},
    cachedFilteredCount: 0,
    loadPromise: null
  };

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

  function errMessage(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    return err.message || String(err);
  }

  function setAppLoading(active, label) {
    panelLoading(active, label);
  }

  function setStatus(msg, kind) {
    hostStatus(msg, kind);
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

  function rowsFromSqlRaw(raw, fieldKeys) {
    var parsed = parseSqlResp(raw);
    var idxs = {};
    fieldKeys.forEach(function (f) { idxs[f] = colIdx(parsed.cols, f); });
    return parsed.rows.map(function (row) {
      var o = {};
      fieldKeys.forEach(function (f) {
        var i = idxs[f];
        if (i < 0) {
          o[f] = row && !Array.isArray(row) && row[f] !== undefined ? row[f] : null;
          return;
        }
        if (Array.isArray(row)) { o[f] = row[i]; return; }
        if (row && typeof row === 'object') {
          var col = parsed.cols[i];
          o[f] = row[f] !== undefined ? row[f] : (col != null && row[col] !== undefined ? row[col] : null);
          return;
        }
        o[f] = null;
      });
      return o;
    });
  }

  function normalizePayloadRows(payload, fieldKeys) {
    if (payload && Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
      return rowsFromSqlRaw(payload, fieldKeys);
    }
    var raw = Array.isArray(payload) ? payload :
      (payload && Array.isArray(payload.rows)) ? payload.rows :
      (payload && Array.isArray(payload.data)) ? payload.data : [];
    return raw.map(function (r) {
      if (Array.isArray(r)) {
        var oArr = {};
        fieldKeys.forEach(function (f, i) { oArr[f] = i < r.length ? r[i] : null; });
        return oArr;
      }
      if (!r || typeof r !== 'object') return null;
      var upper = {};
      Object.keys(r).forEach(function (k) { upper[String(k).toUpperCase()] = r[k]; });
      var o = {};
      fieldKeys.forEach(function (f) { o[f] = upper[f] !== undefined ? upper[f] : null; });
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

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }
    var s = String(v).trim();
    if (!s || s.indexOf('1900-01-01') === 0) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) return new Date(Number(m2[3]), Number(m2[1]) - 1, Number(m2[2]));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function formatDate(d) {
    if (!d) return '—';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function yearSortKey(year) {
    var s = trimStr(year).toUpperCase();
    var m = s.match(/CY\s*(\d{2,4})/) || s.match(/(\d{2,4})/);
    if (!m) return 0;
    var n = Number(m[1]);
    if (n < 100) n += 2000;
    return n;
  }

  function uniqueSorted(values, sortFn) {
    var seen = {};
    var out = [];
    values.forEach(function (v) {
      var s = trimStr(v);
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    out.sort(sortFn);
    return out;
  }

  function fetchViaDataApi(alias) {
    var urls = [
      '/data/v1/' + encodeURIComponent(alias) + '?limit=10000',
      '/data/v1/' + encodeURIComponent(alias)
    ];
    function tryUrl(i) {
      if (i >= urls.length) return Promise.reject(new Error(alias + ' Data API returned no rows'));
      return withTimeout(domo.get(urls[i]), 25000, alias + ' Data API').then(function (payload) {
        var rows = normalizePayloadRows(payload, FIELD_KEYS);
        if (rows && rows.length) return rows;
        return tryUrl(i + 1);
      }).catch(function () {
        return tryUrl(i + 1);
      });
    }
    return tryUrl(0);
  }

  function fetchViaSql(alias) {
    var sql = 'SELECT ' + FIELD_KEYS.join(', ') + ' FROM ' + alias;
    return withTimeout(
      domo.post('/sql/v1/' + alias, sql, { contentType: 'text/plain' }),
      45000,
      alias + ' SQL API'
    ).then(function (raw) {
      return rowsFromSqlRaw(raw, FIELD_KEYS);
    });
  }

  function hostProgramRows() {
    if (!host || typeof host.getPrograms !== 'function') return null;
    var rows = host.getPrograms();
    return rows && rows.length ? rows : null;
  }

  function fetchRows() {
    var hosted = hostProgramRows();
    if (hosted) return Promise.resolve(hosted);
    if (typeof domo === 'undefined' || typeof domo.get !== 'function') {
      return Promise.reject(new Error('Domo SDK not available — open this app from a Domo card'));
    }
    var aliases = [DATA_ALIAS, DATASET_ID];
    function tryAlias(i) {
      if (i >= aliases.length) {
        return Promise.reject(new Error('No rows from programs. Map alias "programs" on this card.'));
      }
      var a = aliases[i];
      return fetchViaDataApi(a).then(function (rows) {
        if (rows && rows.length >= 10000) {
          return fetchViaSql(a).then(function (sqlRows) {
            if (sqlRows && sqlRows.length) return sqlRows;
            return rows;
          }).catch(function () { return rows; });
        }
        return rows;
      }).catch(function () {
        return fetchViaSql(a);
      }).then(function (rows) {
        if (rows && rows.length) return rows;
        return tryAlias(i + 1);
      }).catch(function () {
        return tryAlias(i + 1);
      });
    }
    return tryAlias(0);
  }

  function normalizeRow(raw) {
    var start = parseDate(raw.FIRST_ACTIVITY);
    var end = parseDate(raw.LAST_ACTIVITY);
    if (start && end && end < start) {
      var tmp = start;
      start = end;
      end = tmp;
    }
    return {
      partition: trimStr(raw.PARTITION) || 'Unknown',
      solution: trimStr(raw.PROGRAM_SOLUTION) || '—',
      year: trimStr(raw.CAMPAIGN_YEAR) || '—',
      programName: trimStr(raw.PROGRAM_NAME) || '—',
      programId: trimStr(raw.PROGRAM_ID),
      status: trimStr(raw.PROGRAM_STATUS),
      start: start,
      end: end,
      launch: addDays(start, LAUNCH_OFFSET_DAYS)
    };
  }

  function assignYearColors(years) {
    var map = {};
    years.forEach(function (y, i) {
      map[y] = YEAR_COLORS[i % YEAR_COLORS.length];
    });
    state.yearColor = map;
  }

  function timelineScopeRows() {
    return state.rows.filter(function (r) {
      if (state.scopePartners && state.scopePartners.length) {
        if (Join.matchesSelectedPartners) {
          if (!Join.matchesSelectedPartners(r.partition, state.scopePartners)) return false;
        } else if (state.scopePartners.indexOf(r.partition) < 0) return false;
      }
      return true;
    });
  }

  function rowMatchesTimelineCampaign(r) {
    if (!state.campaign) return true;
    if (Join.matchesSelectedCampaigns) return Join.matchesSelectedCampaigns(r.solution, [state.campaign]);
    return r.solution === state.campaign;
  }

  function refreshTimelineFilterMenus() {
    var base = timelineScopeRows();
    var yearSource = base.filter(function (r) { return rowMatchesTimelineCampaign(r); });
    var years = uniqueSorted(yearSource.map(function (r) { return r.year; }), function (a, b) {
      return yearSortKey(b) - yearSortKey(a);
    });
    state.yearOptions = years;
    assignYearColors(years.slice().sort(function (a, b) { return yearSortKey(a) - yearSortKey(b); }));
    state.selectedYears = state.selectedYears.filter(function (y) { return years.indexOf(y) >= 0; });
    if (!state.selectedYears.length && years.length) state.selectedYears = [years[0]];
    renderYearMenu();

    var yearSet = {};
    state.selectedYears.forEach(function (y) { yearSet[y] = true; });
    var campaignSource = base.filter(function (r) {
      if (state.selectedYears.length && !yearSet[r.year]) return false;
      return true;
    });
    var counts = {};
    campaignSource.forEach(function (r) {
      counts[r.solution] = (counts[r.solution] || 0) + 1;
    });
    var campaigns = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b);
    });
    state.campaignOptions = campaigns;
    if (state.campaign && campaigns.indexOf(state.campaign) < 0) {
      state.campaign = '';
    }
    renderCampaignMenu();
    if (els.campaignTrigger) {
      els.campaignTrigger.disabled = !state.rows.length;
    }
    if (isTimelinesScopeOpen()) setTimelinesScopeOpen(true);
  }

  function populateYearFilter(rows) {
    if (rows && rows.length) state.rows = rows;
    refreshTimelineFilterMenus();
  }

  function populateCampaignFilter(rows) {
    if (rows && rows.length) state.rows = rows;
    refreshTimelineFilterMenus();
  }

  function appendTimelinesClearSection(menu, selectedCount, onClear) {
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

  function renderYearMenu() {
    if (!els.yearsMenu) return;
    els.yearsMenu.innerHTML = '';
    if (!state.yearOptions.length) {
      els.yearsMenu.innerHTML = '<div class="multi-select-option">No campaign years found</div>';
      els.yearsTriggerLabel.textContent = 'No years';
      return;
    }
    appendTimelinesClearSection(els.yearsMenu, state.selectedYears.length, function () {
      state.selectedYears = [];
      refreshTimelineFilterMenus();
      render();
    });
    var optionsHtml = state.yearOptions.map(function (y) {
      var checked = state.selectedYears.indexOf(y) >= 0;
      return '<label class="multi-select-option">' +
        '<input type="checkbox" data-year="' + escapeHtml(y) + '"' + (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(y) + '</span></label>';
    }).join('');
    var wrap = document.createElement('div');
    wrap.innerHTML = optionsHtml;
    while (wrap.firstChild) els.yearsMenu.appendChild(wrap.firstChild);
    updateYearTriggerLabel();
  }

  function renderCampaignMenu() {
    if (!els.campaignMenu) return;
    els.campaignMenu.innerHTML = '';
    if (!state.campaignOptions.length) {
      els.campaignMenu.innerHTML = '<div class="multi-select-empty">No campaigns for selected years</div>';
      updateCampaignTriggerLabel();
      return;
    }
    var allLabel = document.createElement('label');
    allLabel.className = 'multi-select-option';
    allLabel.innerHTML =
      '<input type="radio" name="timelines-campaign" value=""' +
      (!state.campaign ? ' checked' : '') + ' />' +
      '<span>All campaigns</span>';
    els.campaignMenu.appendChild(allLabel);
    state.campaignOptions.forEach(function (c) {
      var label = document.createElement('label');
      label.className = 'multi-select-option';
      var checked = state.campaign === c;
      label.innerHTML =
        '<input type="radio" name="timelines-campaign" value="' + escapeHtml(c) + '"' +
        (checked ? ' checked' : '') + ' />' +
        '<span>' + escapeHtml(c) + '</span>';
      els.campaignMenu.appendChild(label);
    });
    updateCampaignTriggerLabel();
  }

  function updateCampaignTriggerLabel() {
    if (!els.campaignTriggerLabel) return;
    els.campaignTriggerLabel.textContent = state.campaign || 'All campaigns';
  }

  function updateYearTriggerLabel() {
    var n = state.selectedYears.length;
    if (!n) els.yearsTriggerLabel.textContent = 'Select years…';
    else if (n === state.yearOptions.length) els.yearsTriggerLabel.textContent = 'All years';
    else if (n === 1) els.yearsTriggerLabel.textContent = state.selectedYears[0];
    else els.yearsTriggerLabel.textContent = n + ' years';
  }

  function filteredRows() {
    var q = state.search.toLowerCase();
    var yearSet = {};
    state.selectedYears.forEach(function (y) { yearSet[y] = true; });
    var scopePartners = state.scopePartners || [];
    return state.rows.filter(function (r) {
      if (scopePartners.length) {
        if (Join.matchesSelectedPartners) {
          if (!Join.matchesSelectedPartners(r.partition, scopePartners)) return false;
        } else if (scopePartners.indexOf(r.partition) < 0) return false;
      }
      if (state.selectedYears.length && !yearSet[r.year]) return false;
      if (state.campaign) {
        if (Join.matchesSelectedCampaigns) {
          if (!Join.matchesSelectedCampaigns(r.solution, [state.campaign])) return false;
        } else if (r.solution !== state.campaign) return false;
      }
      if (q) {
        var hay = (r.partition + ' ' + r.programName + ' ' + r.solution).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return !!(r.start && r.end);
    }).sort(function (a, b) {
      var c = a.partition.localeCompare(b.partition);
      if (c) return c;
      return (a.start ? a.start.getTime() : 0) - (b.start ? b.start.getTime() : 0);
    });
  }

  function groupByClient(rows) {
    var groups = [];
    var map = {};
    rows.forEach(function (r) {
      if (!map[r.partition]) {
        map[r.partition] = { partition: r.partition, programs: [] };
        groups.push(map[r.partition]);
      }
      map[r.partition].programs.push(r);
    });
    return groups;
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }

  function monthTicks(rangeStart, rangeEnd) {
    var ticks = [];
    var cursor = startOfMonth(rangeStart);
    var guard = 0;
    while (cursor <= rangeEnd && guard < 48) {
      ticks.push(new Date(cursor.getTime()));
      cursor = addMonths(cursor, 1);
      guard += 1;
    }
    return ticks;
  }

  function pctAlong(date, min, max) {
    var span = max.getTime() - min.getTime();
    if (span <= 0) return 0;
    return ((date.getTime() - min.getTime()) / span) * 100;
  }

  function renderYearLegend(years) {
    if (!els.yearLegend) return;
    els.yearLegend.innerHTML = years.map(function (y) {
      return '<span class="year-legend-item">' +
        '<span class="year-legend-dot" style="background:' + (state.yearColor[y] || '#6B7178') + '"></span>' +
        escapeHtml(y) + '</span>';
    }).join('');
  }

  function hideTooltip() {
    if (els.tooltip) els.tooltip.hidden = true;
  }

  function showTooltip(ev, row) {
    if (!els.tooltip) return;
    els.tooltip.hidden = false;
    els.tooltip.innerHTML =
      '<strong>' + escapeHtml(row.programName) + '</strong>' +
      escapeHtml(row.partition) + '<br>' +
      escapeHtml(row.solution) + ' · ' + escapeHtml(row.year) + '<br>' +
      formatDate(row.start) + ' → ' + formatDate(row.end);
    var x = ev.clientX + 12;
    var y = ev.clientY + 12;
    var w = els.tooltip.offsetWidth || 220;
    var h = els.tooltip.offsetHeight || 80;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 12;
    els.tooltip.style.left = Math.max(8, x) + 'px';
    els.tooltip.style.top = Math.max(8, y) + 'px';
  }

  function renderGantt(rows) {
    if (!els.gantt) return;
    if (!rows.length) {
      els.gantt.hidden = true;
      if (els.chartEmpty) els.chartEmpty.hidden = false;
      return;
    }
    if (els.chartEmpty) els.chartEmpty.hidden = true;
    els.gantt.hidden = false;

    var min = null;
    var max = null;
    rows.forEach(function (r) {
      if (!min || r.start < min) min = r.start;
      if (!max || r.end > max) max = r.end;
      if (r.launch && (!max || r.launch > max)) max = r.launch;
    });
    min = addDays(min, -7);
    max = addDays(max, 14);
    var today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var ticks = monthTicks(min, max);
    var groups = groupByClient(rows);
    var barH = 14;
    var gap = 6;
    var padY = 8;

    var axisTicks = ticks.map(function (t) {
      var left = pctAlong(t, min, max);
      return '<div class="gantt-tick" style="left:' + left.toFixed(3) + '%">' +
        '<span class="gantt-tick-label">' + MONTHS[t.getMonth()] + ' ' + String(t.getFullYear()).slice(2) + '</span>' +
        '</div>';
    }).join('');

    var todayLine = '';
    var todayAxis = '';
    if (state.showToday && today >= min && today <= max) {
      var tLeft = pctAlong(today, min, max);
      todayLine = '<div class="gantt-today" style="left:' + tLeft.toFixed(3) + '%"></div>';
      todayAxis = '<div class="gantt-today" style="left:' + tLeft.toFixed(3) + '%">' +
        '<span class="gantt-today-label">Today</span></div>';
    }

    var rowsHtml = groups.map(function (g) {
      var n = g.programs.length;
      var height = padY * 2 + n * barH + Math.max(0, n - 1) * gap;
      var bars = g.programs.map(function (p, i) {
        var left = pctAlong(p.start, min, max);
        var right = pctAlong(p.end, min, max);
        var width = Math.max(0.4, right - left);
        var top = padY + i * (barH + gap);
        var color = state.yearColor[p.year] || '#6B7178';
        var launchHtml = '';
        if (p.launch && p.launch >= min && p.launch <= max) {
          launchHtml = '<span class="gantt-launch" style="left:' + pctAlong(p.launch, min, max).toFixed(3) + '%;top:' + (top + barH / 2) + 'px"></span>';
        }
        return '<button type="button" class="gantt-bar" style="left:' + left.toFixed(3) +
          '%;width:' + width.toFixed(3) + '%;top:' + top + 'px;background:' + color +
          '" data-idx="' + rows.indexOf(p) + '" aria-label="' +
          escapeHtml(p.programName) + '"></button>' + launchHtml;
      }).join('');
      return '<div class="gantt-row">' +
        '<div class="gantt-client">' + escapeHtml(g.partition) +
          '<span class="gantt-client-count">' + n + (n === 1 ? ' program' : ' programs') + '</span>' +
        '</div>' +
        '<div class="gantt-track" style="height:' + height + 'px">' + todayLine + bars + '</div>' +
      '</div>';
    }).join('');

    els.gantt.innerHTML =
      '<div class="gantt-axis">' +
        '<div class="gantt-axis-label">Client</div>' +
        '<div class="gantt-axis-track">' + axisTicks + todayAxis + '</div>' +
      '</div>' + rowsHtml;

    els.gantt.querySelectorAll('.gantt-bar').forEach(function (btn) {
      var idx = Number(btn.getAttribute('data-idx'));
      var row = rows[idx];
      if (!row) return;
      btn.addEventListener('mouseenter', function (ev) { showTooltip(ev, row); });
      btn.addEventListener('mousemove', function (ev) { showTooltip(ev, row); });
      btn.addEventListener('mouseleave', hideTooltip);
      btn.addEventListener('focus', function (ev) { showTooltip(ev, row); });
      btn.addEventListener('blur', hideTooltip);
    });
  }

  function renderTable(rows) {
    if (!els.tableBody) return;
    if (!rows.length) {
      els.tableBody.innerHTML = '';
      if (els.tableEmpty) els.tableEmpty.hidden = false;
      return;
    }
    if (els.tableEmpty) els.tableEmpty.hidden = true;
    els.tableBody.innerHTML = rows.map(function (r) {
      var color = state.yearColor[r.year] || '#6B7178';
      return '<tr>' +
        '<td>' + escapeHtml(r.partition) + '</td>' +
        '<td>' + escapeHtml(r.programName) + '</td>' +
        '<td>' + escapeHtml(r.solution) + '</td>' +
        '<td><span class="year-pill"><span class="year-pill-dot" style="background:' + color + '"></span>' +
          escapeHtml(r.year) + '</span></td>' +
        '<td>' + formatDate(r.start) + '</td>' +
        '<td>' + formatDate(r.launch) + '</td>' +
        '<td>' + formatDate(r.end) + '</td>' +
      '</tr>';
    }).join('');
  }

  function render() {
    if (!tabActive) return;
    refreshTimelineFilterMenus();
    var rows = filteredRows();
    state.cachedFilteredCount = rows.length;
    var clients = {};
    rows.forEach(function (r) { clients[r.partition] = true; });
    var clientCount = Object.keys(clients).length;
    var yearsUsed = uniqueSorted(rows.map(function (r) { return r.year; }), function (a, b) {
      return yearSortKey(a) - yearSortKey(b);
    });
    renderYearLegend(yearsUsed);
    renderGantt(rows);
    renderTable(rows);
    var sub = rows.length
      ? clientCount + ' client' + (clientCount === 1 ? '' : 's') + ' · ' +
        rows.length + ' program' + (rows.length === 1 ? '' : 's')
      : 'No programs for the current filters';
    if (els.chartSubtitle) els.chartSubtitle.textContent = sub;
    if (els.tableSubtitle) els.tableSubtitle.textContent = sub;
    if (embedState.loading || (!embedState.ready && !embedState.error)) {
      setStatus('Loading programs…', 'loading');
    } else if (!state.selectedYears.length) setStatus('Select at least one campaign year.', 'error');
    else setStatus(sub);
  }

  function chapterRefresh() {
    if (host && typeof host.onChapterRefresh === 'function') host.onChapterRefresh();
  }

  function applyHostFilters() {
    if (!host || typeof host.getFilters !== 'function') return false;
    var f = host.getFilters();
    var sig = host.getScopeSignature ? host.getScopeSignature(f) : '';
    if (sig && sig === timelinesHubScopeSig) return false;
    timelinesHubScopeSig = sig;

    var changed = false;
    var scope = f.scopePartners || [];
    var partitions = uniqueSorted(state.rows.map(function (r) { return r.partition; }));
    var partnerPick = Join.pickKnownPartners ? Join.pickKnownPartners(scope, partitions) : scope.slice();
    if (partnerPick.join('\0') !== (state.scopePartners || []).join('\0')) {
      state.scopePartners = partnerPick.slice();
      changed = true;
    }

    if (f.years && f.years.length && state.yearOptions.length) {
      var valid = [];
      state.yearOptions.forEach(function (opt) {
        if (Join.matchesSelectedYears && Join.matchesSelectedYears(opt, f.years) && valid.indexOf(opt) < 0) {
          valid.push(opt);
        } else if (f.years.indexOf(opt) >= 0 && valid.indexOf(opt) < 0) {
          valid.push(opt);
        }
      });
      if (valid.length) {
        state.selectedYears = valid;
        changed = true;
      }
    }
    if (f.campaigns && f.campaigns.length === 1) {
      var picked = '';
      (state.campaignOptions || []).forEach(function (val) {
        if (picked) return;
        if (Join.matchesSelectedCampaigns && Join.matchesSelectedCampaigns(val, f.campaigns)) {
          picked = val;
        }
      });
      if (picked && state.campaign !== picked) {
        state.campaign = picked;
        changed = true;
      }
    } else if (!f.campaigns || !f.campaigns.length) {
      if (state.campaign) {
        state.campaign = '';
        changed = true;
      }
    }
    if (f.search && els.search && !trimStr(state.search) && !scope.length) {
      state.search = f.search;
      els.search.value = f.search;
      changed = true;
    }
    if (changed) {
      refreshTimelineFilterMenus();
      render();
    }
    return changed;
  }

  function bootTimelines() {
    bindControlsOnce();
    if (embedState.ready && state.rows.length) {
      applyHostFilters();
      render();
      return Promise.resolve(state.rows);
    }
    return loadTimelinesData();
  }

  function loadTimelinesData() {
    if (state.loadPromise && embedState.loading) return state.loadPromise;
    if (state.loadPromise && embedState.ready) return state.loadPromise;
    state.loadPromise = null;
    setAppLoading(true, 'Loading campaign timelines…');
    setStatus('Loading programs…', 'loading');
    embedState.loading = true; state.loadPromise = fetchRows()
      .then(function (raw) {
        state.rows = (raw || []).map(normalizeRow);
        if (!tabActive) return state.rows;
        refreshTimelineFilterMenus();
        applyHostFilters();
        render();
        return state.rows;
      })
      .catch(function (err) {
        console.error('[campaignTimelines] load failed', err);
        state.loadPromise = null;
        embedState.error = errMessage(err);
        setStatus('Could not load programs: ' + embedState.error, 'error');
        if (els.gantt) {
          els.gantt.hidden = true;
        }
        if (els.chartEmpty) {
          els.chartEmpty.hidden = false;
          els.chartEmpty.innerHTML =
            '<strong>Could not load program activity.</strong><br>' +
            'Map alias <code>programs</code> to dataset<br>' +
            '<code>' + DATASET_ID + '</code><br>' +
            escapeHtml(errMessage(err));
        }
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
    return state.loadPromise;
  }

  function timelinesScopeClusterEl() {
    return $('timelinesScopeFilterCluster');
  }

  function isTimelinesScopeOpen() {
    var cluster = timelinesScopeClusterEl();
    return !!(cluster && cluster.classList.contains('is-linked-open'));
  }

  function setTimelinesScopeOpen(open) {
    var cluster = timelinesScopeClusterEl();
    if (cluster) cluster.classList.toggle('is-linked-open', open);
    if (els.yearsMenu) els.yearsMenu.hidden = !open;
    if (els.campaignMenu) els.campaignMenu.hidden = !open;
    if (els.yearsTrigger) els.yearsTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (els.campaignTrigger) els.campaignTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    var yearsWrap = $('timelinesYearsSelect');
    if (yearsWrap) yearsWrap.classList.toggle('is-open', open);
    if (els.campaignMulti) els.campaignMulti.classList.toggle('is-open', open);
  }

  function openTimelinesScope() {
    refreshTimelineFilterMenus();
    setTimelinesScopeOpen(true);
  }

  function initScopeFilters() {
    if (!els.yearsTrigger || !els.yearsMenu) return;

    function stopInsideMenu(ev) {
      ev.stopPropagation();
    }

    els.yearsTrigger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (isTimelinesScopeOpen()) {
        setTimelinesScopeOpen(false);
        return;
      }
      openTimelinesScope();
    });
    if (els.campaignTrigger) {
      els.campaignTrigger.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (isTimelinesScopeOpen()) return;
        openTimelinesScope();
      });
    }

    els.yearsMenu.addEventListener('click', stopInsideMenu);
    if (els.campaignMenu) els.campaignMenu.addEventListener('click', stopInsideMenu);

    els.yearsMenu.addEventListener('change', function (ev) {
      var input = ev.target;
      if (!input || !input.getAttribute) return;
      var year = input.getAttribute('data-year');
      if (!year) return;
      if (input.checked) {
        if (state.selectedYears.indexOf(year) < 0) state.selectedYears.push(year);
      } else {
        state.selectedYears = state.selectedYears.filter(function (y) { return y !== year; });
      }
      refreshTimelineFilterMenus();
      render();
    });

    if (els.campaignMenu) {
      els.campaignMenu.addEventListener('change', function (ev) {
        var input = ev.target;
        if (!input || input.name !== 'timelines-campaign') return;
        state.campaign = trimStr(input.value);
        refreshTimelineFilterMenus();
        render();
      });
    }

    document.addEventListener('click', function (ev) {
      if (!tabActive || !chapterRoot || !chapterRoot.contains(ev.target)) return;
      var cluster = timelinesScopeClusterEl();
      if (cluster && cluster.contains(ev.target)) return;
      setTimelinesScopeOpen(false);
    });
  }

  function bindControlsOnce() {
    if (controlsBound) return;
    controlsBound = true;
    initScopeFilters();
    if (els.search) {
      var timer = null;
      els.search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.search = trimStr(els.search.value);
          render();
        }, 150);
      });
    }
    if (els.todayToggle) {
      els.todayToggle.addEventListener('click', function () {
        state.showToday = !state.showToday;
        els.todayToggle.classList.toggle('is-active', state.showToday);
        els.todayToggle.setAttribute('aria-pressed', state.showToday ? 'true' : 'false');
        render();
      });
    }
  }


  global.PartnerCampaignTimelinesTab = {
    init: function (h) {
      host = h;
      chapterRoot = document.getElementById('campaignTimelinesChapter');
      bindEls();
    },
    activate: function () {
      tabActive = true;
      bindEls();
      if (!embedState.ready && !embedState.loading) return bootTimelines();
      applyHostFilters();
      if (embedState.ready && typeof render === 'function') render();
    },
    deactivate: function () {
      tabActive = false;
      hideTooltip();
      if (els.gantt) {
        els.gantt.hidden = true;
        els.gantt.innerHTML = '';
      }
      if (els.tableBody) els.tableBody.innerHTML = '';
    },
    refresh: function () {
      if (!tabActive) return;
      embedState.ready = false;
      if (typeof state !== 'undefined' && state.loadPromise) state.loadPromise = null;
      if (typeof loadPromise !== 'undefined') loadPromise = null;
      return bootTimelines();
    },
    onFiltersChanged: function () {
      if (!embedState.ready) return;
      applyHostFilters();
      render();
    },
    handleClick: function (ev) {
      return !!(tabActive && chapterRoot && chapterRoot.contains(ev.target));
    },
    isLoading: function () { return embedState.loading; },
    getRowCount: function () {
      if (!embedState.ready) return 0;
      if (!tabActive) return state.cachedFilteredCount || 0;
      return filteredRows().length;
    },
    getHubStat: function () {
      if (!embedState.ready) return { value: null, label: 'programs' };
      return { value: filteredRows().length, label: 'programs' };
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
      var rows = filteredRows();
      if (!rows.length) {
        setStatus('No programs to export for the current filters.', 'error');
        return;
      }
      var headers = ['Client', 'Program', 'Campaign', 'Year', 'Start', 'Launch', 'End'];
      var body = rows.map(function (r) {
        return [
          r.partition,
          r.programName,
          r.solution,
          r.year,
          formatDate(r.start),
          formatDate(r.launch),
          formatDate(r.end)
        ];
      });
      var subtitleParts = [];
      if (state.selectedYears.length) subtitleParts.push(state.selectedYears.join(', '));
      if (state.campaign) subtitleParts.push('Campaign ' + state.campaign);
      if (state.search) subtitleParts.push('Search: ' + state.search);
      var subtitle = (subtitleParts.length ? subtitleParts.join('  ·  ') + '  ·  ' : '') +
        rows.length + ' programs';
      var block = { title: 'Campaign timelines', headers: headers, rows: body, colAlign: ['left', 'left', 'left', 'left', 'left', 'left', 'left'] };
      var wb = OER.createWorkbook();
      OER.addConsolidatedSheet(wb, {
        name: 'All Together',
        docTitle: 'Campaign Timelines',
        subtitle: subtitle,
        blocks: [block]
      });
      OER.addDataSheet(wb, {
        name: 'Timelines',
        docTitle: 'Campaign Timelines',
        sectionTitle: 'Campaign timelines',
        subtitle: subtitle,
        headers: headers,
        rows: body,
        colAlign: block.colAlign
      });
      OER.downloadWorkbook(wb, 'campaign-timelines-report-' + OER.fileStamp() + '.xlsx')
        .then(function () { setStatus('Exported Campaign Timelines report.'); })
        .catch(function (err) {
          console.warn('[Campaign Timelines] Export failed:', err);
          setStatus('Export failed.', 'error');
        });
    }
  };
})(window);
