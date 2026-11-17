/**
 * Print Batches tab — embedded in 3E Operations.
 * Source: Print_Batches_On_Demand (PRINT_BATCHES / page 545617545).
 */
(function (global) {
  'use strict';

  var host = null;
  var tabActive = false;
  var loadGen = 0;

  var PAGE_SIZE = 500;
  var DATASET = { alias: 'printBatches', id: '9100cf4b-7aa4-46be-b055-a59cb46e70db' };
  var YEAR_KEYS = ['CAMPAIGN_YEAR', 'N'];
  var AGG_KEYS = ['PARTITION', 'PROGRAM_SOLUTION', 'CAMPAIGN_YEAR', 'SENT_BATCH', 'SENT_DEMAND', 'TOTAL', 'CNV8'];

  var AWR_CODES = { AWR: true, AWRSS: true, AWRRS: true };

  var CLIENT_COLS = [
    { key: 'PARTITION', label: 'Client' },
    { key: 'TOTAL', label: 'Records', kind: 'num' }
  ];
  var AWR_AVAIL_COLS = [
    { key: 'PARTITION', label: 'Client' },
    { key: 'PROGRAM_SOLUTION', label: 'Campaign' },
    { key: 'TOTAL', label: 'Available', kind: 'num' }
  ];

  var PANELS = {
    cnvaOdAvail: { title: 'CNVA Available for On-Demand', countKey: 'CNV8', tone: 'avail', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'CNV8', label: 'Available', kind: 'num' }] },
    cnvaOdSent: { title: 'CNVA On-Demand Sent', countKey: 'TOTAL', tone: 'sent', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Sent', kind: 'num' }] },
    cnvaBatchAvail: { title: 'CNVA Available for Print Batches', countKey: 'TOTAL', tone: 'avail', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Available', kind: 'num' }] },
    cnvaBatchSent: { title: 'CNVA Sent Print Batches', countKey: 'TOTAL', tone: 'sent', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Sent', kind: 'num' }] },
    awrBatchAvail: { title: 'AWR/AWRSS Available for Print Batches', countKey: 'TOTAL', tone: 'avail', cols: AWR_AVAIL_COLS },
    awrBatchSent: { title: 'AWR Sent Print Batches', countKey: 'TOTAL', tone: 'sent', cols: CLIENT_COLS.map(function (c) { return c.key === 'TOTAL' ? { key: 'TOTAL', label: 'Sent', kind: 'num' } : c; }) },
    cnvdOdAvail: { title: 'CNVD Available for Print on Demand', countKey: 'TOTAL', tone: 'avail', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Available', kind: 'num' }] },
    cnvdOdSent: { title: 'CNVD Sent Print on Demand', countKey: 'TOTAL', tone: 'sent', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Sent', kind: 'num' }] },
    cnvascBatchAvail: { title: 'CNVASC Available for Print Batches', countKey: 'TOTAL', tone: 'avail', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Available', kind: 'num' }] },
    cnvascBatchSent: { title: 'CNVASC Sent Print Batches', countKey: 'TOTAL', tone: 'sent', cols: [{ key: 'PARTITION', label: 'Client' }, { key: 'TOTAL', label: 'Sent', kind: 'num' }] }
  };

  var PANEL_IDS = Object.keys(PANELS);

  var els = {
    root: document.getElementById('printBatchesPanel'),
    skeleton: document.getElementById('printBatchesSkeleton'),
    status: document.getElementById('printChapterStatus'),
    yearPills: document.getElementById('printYearPills'),
    search: document.getElementById('printSearchFilter')
  };

  var state = {
    years: [],
    rows: [],
    filters: { year: '', search: '' },
    ready: false,
    loading: false,
    error: '',
    mappingOk: null,
    pages: {},
    sorts: {},
    didDefaultYear: false
  };

  PANEL_IDS.forEach(function (id) {
    state.pages[id] = 0;
    state.sorts[id] = { key: 'TOTAL', dir: 'desc' };
    if (id === 'cnvaOdAvail') state.sorts[id].key = 'CNV8';
    if (id === 'awrBatchAvail') state.sorts[id].key = 'PARTITION';
  });

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

  var Join = window.OpsJoin || {};
  var printHubScopeSig = '';

  function getHostFilters() {
    if (host && typeof host.getFilters === 'function') return host.getFilters();
    return { years: [], partners: [], search: '', portalPartners: null, scopePartners: [] };
  }

  function hostStatus(msg, kind) {
    if (host && typeof host.setStatus === 'function') host.setStatus(msg, kind);
  }

  function setPanelLoading(active) {
    state.loading = !!active;
    if (els.skeleton) els.skeleton.hidden = !active;
  }

  function setAppLoading(active, label) {
    setPanelLoading(active);
    if (active && label) hostStatus(label, 'loading');
  }

  function setStatus(msg, kind) {
    if (els.status && window.OpsUi && OpsUi.setStatusEl) {
      OpsUi.setStatusEl(els.status, msg, kind);
    } else if (els.status) {
      els.status.textContent = msg || '';
      els.status.classList.toggle('is-error', kind === 'error');
    }
    if (tabActive) hostStatus(msg, kind);
  }

  function errMessage(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if ((err.status === 400 || err.statusCode === 400) && !state.mappingOk) {
      return 'HTTP 400 — dataset alias `printBatches` is not mapped on this card (expected id ' + DATASET.id + ')';
    }
    if (err.status === 400 || err.statusCode === 400) {
      return 'HTTP 400 from PRINT_BATCHES while loading campaign years or rows';
    }
    return err.message || err.statusReason || err.statusText || String(err);
  }

  function rowVal(row, key) {
    if (!row || key == null) return null;
    if (row[key] !== undefined) return row[key];
    var upper = String(key).toUpperCase();
    var lower = String(key).toLowerCase();
    if (row[upper] !== undefined) return row[upper];
    if (row[lower] !== undefined) return row[lower];
    return null;
  }

  function partitionFromRow(row) {
    return trimStr(rowVal(row, 'PARTITION')) ||
      trimStr(rowVal(row, 'CLIENT')) ||
      trimStr(rowVal(row, 'PARTNER'));
  }

  function scoreFromRow(row) {
    var v = rowVal(row, 'CNV_SCORE');
    if (v != null && v !== '') return v;
    return rowVal(row, 'ENGAGEMENT_SCORE');
  }

  function normalizeRawRow(row) {
    return {
      PARTITION: partitionFromRow(row),
      PROGRAM_SOLUTION: rowVal(row, 'PROGRAM_SOLUTION'),
      CAMPAIGN_YEAR: yearFromRow(row),
      SENT_BATCH: sentFlag(rowVal(row, 'SENT_BATCH')),
      SENT_DEMAND: sentFlag(rowVal(row, 'SENT_DEMAND')),
      CNV_SCORE: scoreFromRow(row)
    };
  }

  function polishAggRows(rows) {
    return (rows || []).map(function (r) {
      return {
        PARTITION: partitionFromRow(r) || trimStr(r.PARTITION),
        PROGRAM_SOLUTION: trimStr(r.PROGRAM_SOLUTION),
        CAMPAIGN_YEAR: yearFromRow(r) || trimStr(r.CAMPAIGN_YEAR),
        SENT_BATCH: sentFlag(r.SENT_BATCH),
        SENT_DEMAND: sentFlag(r.SENT_DEMAND),
        TOTAL: toNum(r.TOTAL),
        CNV8: toNum(r.CNV8)
      };
    });
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

  function normalizePayloadRows(payload) {
    if (!payload) return [];
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

  function tryDatasetAliases(fn) {
    var names = [DATASET.alias, DATASET.id];
    function next(i) {
      if (i >= names.length) return Promise.reject(new Error('printBatches dataset not reachable — map alias printBatches to ' + DATASET.id));
      return fn(names[i]).catch(function (err) {
        if (i + 1 >= names.length) return Promise.reject(err);
        return next(i + 1);
      });
    }
    return next(0);
  }

  function fetchViaSql(sql, keys) {
    return tryDatasetAliases(function (pathAlias) {
      var q = sql.replace(/\{alias\}/g, pathAlias);
      return withTimeout(
        domo.post('/sql/v1/' + pathAlias, q, { contentType: 'text/plain' }),
        90000,
        'PRINT_BATCHES SQL'
      ).then(function (raw) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw) &&
            (raw.error || raw.status === 'error') && !raw.columns && !raw.rows) {
          throw new Error(raw.error || raw.message || 'SQL error');
        }
        return keys ? rowsFromSql(raw, keys) : rowsFromSql(raw);
      });
    });
  }

  function fetchViaDataApi(fields, limit, filterStr) {
    return tryDatasetAliases(function (alias) {
      var url = '/data/v1/' + encodeURIComponent(alias) + '?limit=' + (limit || 50000);
      if (fields) url += '&fields=' + encodeURIComponent(fields);
      if (filterStr) url += '&filter=' + encodeURIComponent(filterStr);
      return withTimeout(domo.get(url), 45000, 'printBatches Data API').then(normalizePayloadRows);
    });
  }

  function probeDatasetMapping() {
    return tryDatasetAliases(function (alias) {
      return withTimeout(
        domo.get('/data/v1/' + encodeURIComponent(alias) + '?limit=1&fields=PARTITION,CAMPAIGN_YEAR'),
        30000,
        'printBatches probe'
      );
    }).then(function () {
      return fetchViaSql(
        'SELECT CAMPAIGN_YEAR FROM {alias} WHERE CAMPAIGN_YEAR IS NOT NULL LIMIT 1',
        ['CAMPAIGN_YEAR']
      );
    }).then(function () {
      state.mappingOk = true;
    }).catch(function (err) {
      state.mappingOk = false;
      return Promise.reject(err);
    });
  }

  function yearFromRow(row) {
    return trimStr(rowVal(row, 'CAMPAIGN_YEAR')) ||
      trimStr(rowVal(row, 'CY')) ||
      trimStr(rowVal(row, 'YEAR'));
  }

  function yearsFromRawRows(rows) {
    var seen = {};
    (rows || []).forEach(function (r) {
      var y = yearFromRow(r);
      if (y) seen[y] = true;
    });
    return sortYearsDesc(Object.keys(seen));
  }

  function normalizeYearKey(year) {
    var s = trimStr(year).toUpperCase();
    var m = s.match(/^CY\s*(\d{2,4})$/);
    if (m) {
      var n = Number(m[1]);
      return String(n < 100 ? 2000 + n : n);
    }
    if (/^\d{4}$/.test(s)) return s;
    return trimStr(year);
  }

  function yearVariants(year) {
    var out = [];
    var raw = trimStr(year);
    if (!raw) return out;
    out.push(raw);
    var norm = normalizeYearKey(raw);
    if (norm && out.indexOf(norm) < 0) out.push(norm);
    var m = String(norm || '').match(/^(\d{4})$/);
    if (m) {
      var yy = String(Number(m[1]) % 100);
      if (yy.length === 1) yy = '0' + yy;
      ['CY' + yy, 'CY' + m[1]].forEach(function (cy) {
        if (out.indexOf(cy) < 0) out.push(cy);
      });
    }
    return out;
  }

  function yearsEquivalent(a, b) {
    if (trimStr(a) === trimStr(b)) return true;
    return normalizeYearKey(a) === normalizeYearKey(b);
  }

  function sqlYearPredicate(y) {
    if (/^\d{4}$/.test(String(y))) {
      var n = Number(y);
      return "(CAMPAIGN_YEAR = '" + escapeSql(y) + "' OR CAMPAIGN_YEAR = " + n + ")";
    }
    return "CAMPAIGN_YEAR = '" + escapeSql(y) + "'";
  }

  function sqlYearWhere(year) {
    var variants = yearVariants(year);
    if (!variants.length) return '';
    if (variants.length === 1) {
      return ' WHERE ' + sqlYearPredicate(variants[0]) + ' ';
    }
    return ' WHERE (' + variants.map(sqlYearPredicate).join(' OR ') + ') ';
  }

  function sentFlag(val) {
    var s = trimStr(val).toUpperCase();
    if (!s || s === 'N' || s === 'NO' || s === 'FALSE' || s === '0' || s === 'NULL') return 'N';
    return 'Y';
  }

  function yearMatches(rowYear, filterYear) {
    var row = trimStr(rowYear);
    if (!filterYear) return true;
    return yearVariants(filterYear).some(function (v) {
      return row === v || yearsEquivalent(row, v);
    });
  }

  function aggregateRawRows(rawRows, year) {
    var map = {};
    (rawRows || []).forEach(function (raw) {
      var r = normalizeRawRow(raw);
      if (year && !yearMatches(r.CAMPAIGN_YEAR, year)) return;
      var sb = sentFlag(r.SENT_BATCH);
      var sd = sentFlag(r.SENT_DEMAND);
      var key = trimStr(r.PARTITION) + '|' + trimStr(r.PROGRAM_SOLUTION) + '|' +
        trimStr(r.CAMPAIGN_YEAR) + '|' + sb + '|' + sd;
      if (!map[key]) {
        map[key] = {
          PARTITION: trimStr(r.PARTITION),
          PROGRAM_SOLUTION: trimStr(r.PROGRAM_SOLUTION),
          CAMPAIGN_YEAR: trimStr(r.CAMPAIGN_YEAR),
          SENT_BATCH: sb,
          SENT_DEMAND: sd,
          TOTAL: 0,
          CNV8: 0
        };
      }
      map[key].TOTAL += 1;
      if (toNum(r.CNV_SCORE) >= 8) map[key].CNV8 += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function fetchYearRowsDataApi(year) {
    var variants = yearVariants(year);
    if (!variants.length) return fetchViaDataApi(null, 100000, null);
    return Promise.all(variants.map(function (variant) {
      var filter = "CAMPAIGN_YEAR='" + escapeSql(variant) + "'";
      return fetchViaDataApi(null, 100000, filter).catch(function () { return []; });
    })).then(function (lists) {
      var merged = [];
      lists.forEach(function (rows) {
        if (rows && rows.length) merged = merged.concat(rows);
      });
      if (merged.length) return merged;
      return fetchViaDataApi(null, 100000, null);
    });
  }

  function loadRawRowsForYear(year) {
    var where = sqlYearWhere(year);
    var sql = 'SELECT PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, SENT_BATCH, SENT_DEMAND, CNV_SCORE FROM {alias}' + where;
    return fetchViaSql(sql, null).then(function (rows) {
      if (rows && rows.length) return rows;
      return fetchYearRowsDataApi(year);
    }).catch(function (err) {
      console.warn('[printBatches] row SQL failed, trying Data API:', errMessage(err));
      return fetchYearRowsDataApi(year);
    }).then(function (rows) {
      return aggregateRawRows(rows, year);
    });
  }

  function sortYearsDesc(years) {
    return years.slice().sort(function (a, b) {
      return String(b).localeCompare(String(a), undefined, { numeric: true });
    });
  }

  function mappingErrorHint(err) {
    return 'PRINT_BATCHES not available on this card. In Domo, edit the 3E Operations card → Data → map alias `printBatches` to dataset `PRINT_BATCHES` (' + DATASET.id + '). Detail: ' + errMessage(err);
  }

  function toNum(v) {
    if (v == null || v === '') return 0;
    var n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  function formatNum(n) {
    return Math.round(toNum(n)).toLocaleString('en-US');
  }

  function campaignCode(v) {
    return trimStr(v).toUpperCase();
  }

  function programCode(v) {
    if (Join.canonicalCampaignCode) return Join.canonicalCampaignCode(v);
    return campaignCode(v);
  }

  function isAwr(code) {
    return !!AWR_CODES[code] || code.indexOf('AWR') === 0;
  }

  function sentSql(col) {
    return "(CASE WHEN " + col + " IS NULL OR TRIM(" + col + ") = '' OR UPPER(TRIM(" + col + ")) IN ('N','NO','FALSE','0','NULL') THEN 'N' ELSE 'Y' END)";
  }

  function preferredYearFromHost() {
    var years = (getHostFilters().years || []).filter(Boolean);
    if (years.length !== 1) return '';
    var hubYear = years[0];
    var match = '';
    state.years.forEach(function (y) {
      if (!match && yearsEquivalent(y, hubYear)) match = y;
    });
    return match;
  }

  function resolveSelectedYear() {
    var hostMatch = preferredYearFromHost();
    if (hostMatch) {
      state.filters.year = hostMatch;
      state.didDefaultYear = true;
      return;
    }
    var current = '';
    if (state.filters.year) {
      state.years.forEach(function (y) {
        if (!current && yearsEquivalent(y, state.filters.year)) current = y;
      });
    }
    state.filters.year = current || state.years[0] || '';
    state.didDefaultYear = true;
  }

  function loadYears() {
    var sql = 'SELECT CAMPAIGN_YEAR, COUNT(*) AS N FROM {alias} WHERE CAMPAIGN_YEAR IS NOT NULL GROUP BY CAMPAIGN_YEAR ORDER BY CAMPAIGN_YEAR DESC';
    return fetchViaSql(sql, YEAR_KEYS).catch(function (err) {
      console.warn('[printBatches] years GROUP BY failed, trying DISTINCT:', errMessage(err));
      return fetchViaSql(
        'SELECT DISTINCT CAMPAIGN_YEAR FROM {alias} WHERE CAMPAIGN_YEAR IS NOT NULL',
        ['CAMPAIGN_YEAR']
      );
    }).catch(function (err) {
      console.warn('[printBatches] years SQL failed, trying Data API:', errMessage(err));
      return fetchViaDataApi(null, 50000).then(function (rows) {
        return yearsFromRawRows(rows).map(function (y) { return { CAMPAIGN_YEAR: y }; });
      });
    }).then(function (rows) {
      state.years = sortYearsDesc((rows || []).map(function (r) { return yearFromRow(r); }).filter(Boolean));
      if (!state.years.length) {
        return Promise.reject(new Error('No campaign year values found in PRINT_BATCHES'));
      }
      resolveSelectedYear();
      renderYearPills();
    });
  }

  function renderYearPills() {
    if (!els.yearPills) return;
    if (!state.years.length) {
      els.yearPills.innerHTML = '<span class="kpi-hint">No campaign years found.</span>';
      return;
    }
    els.yearPills.innerHTML = state.years.map(function (y) {
      var on = yearsEquivalent(y, state.filters.year);
      return '<button type="button" class="year-pill' + (on ? ' is-active' : '') + '" data-year="' +
        escapeHtml(y) + '" role="radio" aria-checked="' + (on ? 'true' : 'false') + '">' +
        escapeHtml(y) + '</button>';
    }).join('');
  }

  function loadAggregates() {
    var year = state.filters.year;
    if (!year) return Promise.resolve([]);
    var groupBy = 'GROUP BY PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, ' +
      sentSql('SENT_BATCH') + ', ' + sentSql('SENT_DEMAND');
    var baseSelect = 'SELECT PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, ' +
      sentSql('SENT_BATCH') + ' AS SENT_BATCH, ' +
      sentSql('SENT_DEMAND') + ' AS SENT_DEMAND, ' +
      'COUNT(*) AS TOTAL';
    var where = sqlYearWhere(year);
    var withCnv = baseSelect + ', SUM(CASE WHEN CNV_SCORE >= 8 THEN 1 ELSE 0 END) AS CNV8 FROM {alias}' +
      where + groupBy;
    return fetchViaSql(withCnv, AGG_KEYS).catch(function (err) {
      console.warn('[printBatches] aggregate SQL failed, trying simpler SQL / Data API:', errMessage(err));
      var noCnv = baseSelect + ', 0 AS CNV8 FROM {alias}' + where + groupBy;
      return fetchViaSql(noCnv, AGG_KEYS).catch(function () {
        return loadRawRowsForYear(year);
      });
    }).then(function (rows) {
      return polishAggRows(rows);
    });
  }

  function rowMatchesClient(r) {
    var p = trimStr(r.PARTITION);
    if (Join.isIgnoredPartition && Join.isIgnoredPartition(p)) return false;
    var f = getHostFilters();
    var scope = f.scopePartners || [];
    if (scope.length) {
      if (Join.matchesSelectedPartners) {
        if (!Join.matchesSelectedPartners(p, scope)) return false;
      } else if (scope.indexOf(p) < 0) return false;
    }
    if (f.campaigns && f.campaigns.length) {
      if (Join.matchesSelectedCampaigns) {
        if (!Join.matchesSelectedCampaigns(r.PROGRAM_SOLUTION, f.campaigns)) return false;
      } else if (f.campaigns.indexOf(trimStr(r.PROGRAM_SOLUTION)) < 0) return false;
    }
    /* Chapter year pills already scope SQL; hub year filter only when no chapter year is selected. */
    if (!state.filters.year && f.years && f.years.length) {
      if (Join.matchesSelectedYears) {
        if (!Join.matchesSelectedYears(yearFromRow(r), f.years)) return false;
      } else if (f.years.indexOf(yearFromRow(r)) < 0) return false;
    }
    return true;
  }

  function scopedAggRows() {
    return state.rows.filter(rowMatchesClient);
  }

  function panelRowTotal() {
    var n = 0;
    PANEL_IDS.forEach(function (id) { n += panelRows(id).length; });
    return n;
  }

  function collapseByClient(rows, countKey) {
    var map = {};
    rows.forEach(function (r) {
      var key = trimStr(r.PARTITION) || '(blank)';
      if (!map[key]) map[key] = { PARTITION: trimStr(r.PARTITION), PROGRAM_SOLUTION: trimStr(r.PROGRAM_SOLUTION), TOTAL: 0, CNV8: 0 };
      map[key].TOTAL += toNum(r.TOTAL);
      map[key].CNV8 += toNum(r.CNV8);
      if (trimStr(r.PROGRAM_SOLUTION) && !map[key].PROGRAM_SOLUTION) map[key].PROGRAM_SOLUTION = trimStr(r.PROGRAM_SOLUTION);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (r) {
      return toNum(r[countKey || 'TOTAL']) > 0;
    });
  }

  function collapseAwrAvail(rows) {
    var map = {};
    rows.forEach(function (r) {
      var key = trimStr(r.PARTITION) + '|' + campaignCode(r.PROGRAM_SOLUTION);
      if (!map[key]) {
        map[key] = { PARTITION: trimStr(r.PARTITION), PROGRAM_SOLUTION: trimStr(r.PROGRAM_SOLUTION), TOTAL: 0 };
      }
      map[key].TOTAL += toNum(r.TOTAL);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (r) { return r.TOTAL > 0; });
  }

  function filterSearch(rows) {
    var q = trimStr(state.filters.search).toLowerCase();
    if (!q) return rows;
    return rows.filter(function (r) {
      return (trimStr(r.PARTITION) + ' ' + trimStr(r.PROGRAM_SOLUTION)).toLowerCase().indexOf(q) >= 0;
    });
  }

  function panelRows(id) {
    var scoped = state.rows.filter(rowMatchesClient);
    var out = [];
    if (id === 'cnvaOdAvail') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVA' && r.SENT_DEMAND !== 'Y';
      }), 'CNV8');
    } else if (id === 'cnvaOdSent') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVA' && r.SENT_DEMAND === 'Y';
      }));
    } else if (id === 'cnvaBatchAvail') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVA' && r.SENT_BATCH !== 'Y';
      }));
    } else if (id === 'cnvaBatchSent') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVA' && r.SENT_BATCH === 'Y';
      }));
    } else if (id === 'awrBatchAvail') {
      out = collapseAwrAvail(scoped.filter(function (r) {
        return isAwr(programCode(r.PROGRAM_SOLUTION)) && r.SENT_BATCH !== 'Y';
      }));
    } else if (id === 'awrBatchSent') {
      out = collapseByClient(scoped.filter(function (r) {
        return isAwr(programCode(r.PROGRAM_SOLUTION)) && r.SENT_BATCH === 'Y';
      }));
    } else if (id === 'cnvdOdAvail') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVD' && r.SENT_DEMAND !== 'Y';
      }));
    } else if (id === 'cnvdOdSent') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVD' && r.SENT_DEMAND === 'Y';
      }));
    } else if (id === 'cnvascBatchAvail') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVASC' && r.SENT_BATCH !== 'Y';
      }));
    } else if (id === 'cnvascBatchSent') {
      out = collapseByClient(scoped.filter(function (r) {
        return programCode(r.PROGRAM_SOLUTION) === 'CNVASC' && r.SENT_BATCH === 'Y';
      }));
    }
    return filterSearch(out);
  }

  function sortRows(rows, sort, cols) {
    var key = sort.key;
    var dir = sort.dir === 'asc' ? 1 : -1;
    var col = (cols || []).filter(function (c) { return c.key === key; })[0];
    var numeric = col && col.kind === 'num';
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (numeric) return (toNum(av) - toNum(bv)) * dir;
      av = trimStr(av).toLowerCase();
      bv = trimStr(bv).toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function sumKey(rows, key) {
    var t = 0;
    rows.forEach(function (r) { t += toNum(r[key]); });
    return t;
  }

  function renderPanel(id) {
    var spec = PANELS[id];
    var table = document.getElementById(id + 'Table');
    var empty = document.getElementById(id + 'Empty');
    var pager = document.getElementById(id + 'Pager');
    if (!table) return;
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    var cols = spec.cols;
    var rows = sortRows(panelRows(id), state.sorts[id], cols);
    var page = state.pages[id] || 0;
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > pages - 1) {
      page = Math.max(0, pages - 1);
      state.pages[id] = page;
    }
    var slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    var sort = state.sorts[id];
    thead.innerHTML = '<tr>' + cols.map(function (c) {
      var on = sort.key === c.key;
      return '<th class="' + (c.kind === 'num' ? 'num' : '') + '">' +
        '<button type="button" class="sort-btn" data-sort-table="' + id + '" data-sort-key="' + c.key + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-dir="' + sort.dir + '">' +
        escapeHtml(c.label) + '</button></th>';
    }).join('') + '</tr>';
    var barMax = 0;
    rows.forEach(function (r) {
      var n = toNum(r[spec.countKey]);
      if (n > barMax) barMax = n;
    });
    tbody.innerHTML = slice.map(function (r) {
      return '<tr>' + cols.map(function (c) {
        if (c.kind !== 'num') {
          return '<td>' + escapeHtml(trimStr(r[c.key]) || '—') + '</td>';
        }
        var value = toNum(r[c.key]);
        var pct = barMax > 0 && c.key === spec.countKey ? Math.max(2, Math.round((value / barMax) * 100)) : 0;
        return '<td class="num bar-cell">' +
          (pct ? '<span class="bar-fill bar-fill--' + spec.tone + '" style="width:' + pct + '%"></span>' : '') +
          '<span class="bar-value">' + escapeHtml(formatNum(value)) + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    if (empty) {
      empty.hidden = rows.length > 0;
      if (!rows.length && state.rows.length && scopedAggRows().length === 0) {
        empty.textContent = 'No rows — Overview scope Partner/Campaign filters may be too narrow. Widen scope on the Overview scope filter bar or clear filters.';
      } else if (!rows.length && state.rows.length) {
        empty.textContent = 'No rows for this card with the current search.';
      } else {
        empty.textContent = 'No rows for the current filters.';
      }
    }
    var panelEl = document.getElementById(id + 'Panel');
    if (panelEl) {
      panelEl.classList.toggle('print-card--empty', rows.length === 0);
      var countEl = panelEl.querySelector('.print-panel-count');
      if (!countEl) {
        var hdr = panelEl.querySelector('.chart-card-header > div:first-child');
        if (hdr) {
          countEl = document.createElement('p');
          countEl.className = 'print-panel-count';
          hdr.appendChild(countEl);
        }
      }
      if (countEl) {
        countEl.textContent = rows.length
          ? rows.length.toLocaleString('en-US') + ' row' + (rows.length === 1 ? '' : 's')
          : 'No matching clients';
      }
    }
    if (pager) {
      pager.hidden = rows.length <= PAGE_SIZE;
      var meta = pager.querySelector('.pager-meta');
      if (meta) {
        var from = rows.length ? (page * PAGE_SIZE + 1) : 0;
        var to = Math.min(rows.length, (page + 1) * PAGE_SIZE);
        meta.textContent = from + '–' + to + ' of ' + rows.length.toLocaleString('en-US');
      }
    }
  }

  function refreshUi() {
    if (!tabActive) return;
    PANEL_IDS.forEach(renderPanel);
    if (state.loading || (!state.ready && !state.error)) {
      setStatus('Loading print batches…', 'loading');
      return;
    }
    if (!state.filters.year) {
      if (state.years.length) setStatus('Select a campaign year.');
      else setStatus('No campaign years found in PRINT_BATCHES.', 'error');
    } else if (state.error) {
      setStatus(state.mappingOk ? state.error : mappingErrorHint({ message: state.error }), 'error');
    } else if (!state.rows.length && state.ready) {
      var yearHint = state.years.length ? ' Available years: ' + state.years.join(', ') + '.' : '';
      setStatus('No print-batch rows for ' + state.filters.year + '.' + yearHint, 'error');
    } else if (state.rows.length && panelRowTotal() === 0) {
      setStatus(
        state.rows.length.toLocaleString('en-US') + ' aggregated rows for ' + state.filters.year +
        ', but none match the current Overview scope or search. Widen Partner/Campaign on the Overview scope filter bar or clear search.',
        'error'
      );
    } else {
      setStatus(
        panelRowTotal().toLocaleString('en-US') + ' client rows across cards · ' +
        state.rows.length.toLocaleString('en-US') + ' aggregated groups for ' + state.filters.year + '.'
      );
    }
    if (host && typeof host.onPrintRefresh === 'function') host.onPrintRefresh();
  }

  function reloadYear(gen) {
    if (gen == null) gen = ++loadGen;
    else if (gen !== loadGen) return Promise.resolve();
    PANEL_IDS.forEach(function (id) { state.pages[id] = 0; });
    setAppLoading(true, 'Loading ' + (state.filters.year || 'print status') + '…');
    state.error = '';
    return loadAggregates().then(function (rows) {
      if (gen !== loadGen) return;
      state.rows = rows || [];
      state.ready = true;
      state.error = '';
      setAppLoading(false);
      refreshUi();
    }).catch(function (err) {
      if (gen !== loadGen) return;
      state.error = errMessage(err);
      state.ready = false;
      setAppLoading(false);
      setStatus(state.mappingOk ? state.error : mappingErrorHint(err), 'error');
      if (host && typeof host.onPrintRefresh === 'function') host.onPrintRefresh();
    });
  }

  function handleClick(ev) {
    if (!tabActive) return false;
    var t = ev.target;
    if (t && t.nodeType === 3) t = t.parentElement;
    if (!t || typeof t.closest !== 'function') return false;
    if (!els.root || !els.root.contains(t)) return false;
    var pageBtn = t.closest('[data-page-table]');
    if (pageBtn) {
      var table = pageBtn.getAttribute('data-page-table');
      var dir = pageBtn.getAttribute('data-page-dir');
      if (dir === 'prev') state.pages[table] = Math.max(0, (state.pages[table] || 0) - 1);
      else state.pages[table] = (state.pages[table] || 0) + 1;
      renderPanel(table);
      return true;
    }
    var sortBtn = t.closest('[data-sort-table]');
    if (!sortBtn) return false;
    var sortTable = sortBtn.getAttribute('data-sort-table');
    var key = sortBtn.getAttribute('data-sort-key');
    var cur = state.sorts[sortTable] || { key: key, dir: 'asc' };
    if (cur.key === key) cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
    else { cur.key = key; cur.dir = key === 'PARTITION' || key === 'PROGRAM_SOLUTION' ? 'asc' : 'desc'; }
    state.sorts[sortTable] = cur;
    state.pages[sortTable] = 0;
    renderPanel(sortTable);
    return true;
  }

  var controlsBound = false;
  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    if (els.yearPills) {
      els.yearPills.addEventListener('click', function (ev) {
        if (!tabActive) return;
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-year]') : null;
        if (!btn) return;
        var year = btn.getAttribute('data-year');
        if (!year || yearsEquivalent(year, state.filters.year)) return;
        state.filters.year = year;
        renderYearPills();
        reloadYear();
      });
    }
    if (els.search) {
      var searchTimer = null;
      els.search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.filters.search = els.search.value;
          PANEL_IDS.forEach(function (id) { state.pages[id] = 0; });
          refreshUi();
        }, 250);
      });
    }
  }

  global.PartnerPrintBatchesTab = {
    init: function (h) {
      host = h;
      bindControls();
      if (typeof domo !== 'undefined' && typeof domo.onDataUpdate === 'function' && !global._printBatchesDataUpdateBound) {
        global._printBatchesDataUpdateBound = true;
        domo.onDataUpdate(function (alias) {
          if (alias !== DATASET.alias && alias !== DATASET.id) return;
          if (!tabActive) return;
          var prevYear = state.filters.year;
          state.years = [];
          state.didDefaultYear = false;
          state.ready = false;
          loadYears().then(function () {
            if (prevYear && state.years.some(function (y) { return yearsEquivalent(y, prevYear); })) {
              state.filters.year = prevYear;
            } else if (state.years.length) {
              state.filters.year = state.years[0];
            }
            renderYearPills();
            if (state.filters.year) return reloadYear();
            refreshUi();
          }).catch(function (err) {
            setStatus(mappingErrorHint(err), 'error');
          });
        });
      }
    },
    activate: function () {
      tabActive = true;
      var gen = ++loadGen;
      state.error = '';
      if (typeof domo === 'undefined') {
        setStatus('Domo SDK not available — open this app from a Domo card.', 'error');
        return;
      }
      return probeDatasetMapping().then(function () {
        if (gen !== loadGen) return;
        setPanelLoading(true);
        var yearsPromise = state.years.length ? Promise.resolve() : loadYears();
        return yearsPromise.then(function () {
          if (gen !== loadGen) return;
          resolveSelectedYear();
          renderYearPills();
          if (!state.filters.year) {
            setPanelLoading(false);
            refreshUi();
            return;
          }
          if (state.ready && state.rows.length) {
            setPanelLoading(false);
            refreshUi();
            return;
          }
          return reloadYear(gen);
        });
      }).catch(function (err) {
        if (gen !== loadGen) return;
        setPanelLoading(false);
        state.error = errMessage(err);
        setStatus(state.mappingOk ? state.error : mappingErrorHint(err), 'error');
      });
    },
    deactivate: function () {
      tabActive = false;
      loadGen += 1;
    },
    refresh: refreshUi,
    onFiltersChanged: function () {
      PANEL_IDS.forEach(function (id) { state.pages[id] = 0; });
      var f = getHostFilters();
      var sig = host && host.getScopeSignature ? host.getScopeSignature(f) : '';
      if (sig) printHubScopeSig = sig;
      if (!tabActive) return;
      var prev = state.filters.year;
      resolveSelectedYear();
      renderYearPills();
      if (state.filters.year && !yearsEquivalent(prev, state.filters.year)) {
        reloadYear();
        return;
      }
      refreshUi();
    },
    handleClick: handleClick,
    isLoading: function () { return state.loading; },
    getRowCount: function () { return state.rows.length; },
    prefetchForCommandCenter: function () {
      if (typeof domo === 'undefined') return Promise.resolve();
      if (tabActive || state.loading) return Promise.resolve();
      if (state.ready && state.rows.length) return Promise.resolve();
      var snapshot = loadGen;
      return probeDatasetMapping().then(function () {
        if (tabActive || loadGen !== snapshot) return;
        var yearsPromise = state.years.length ? Promise.resolve() : loadYears();
        return yearsPromise.then(function () {
          if (tabActive || loadGen !== snapshot) return;
          resolveSelectedYear();
          if (!state.filters.year) return;
          if (state.ready && state.rows.length) return;
          return loadAggregates().then(function (rows) {
            if (tabActive || loadGen !== snapshot) return;
            state.rows = rows || [];
            state.ready = true;
          });
        });
      }).catch(function () { /* hub prefetch optional */ }).finally(function () {
        if (host && typeof host.onCommandCenterRefresh === 'function') host.onCommandCenterRefresh();
      });
    },
    getCommandCenterIssues: function () {
      if (!state.ready || !state.rows.length) return [];
      var issues = [];
      var panels = [
        { id: 'cnvaOdAvail', label: 'CNVA on-demand available' },
        { id: 'cnvaBatchAvail', label: 'CNVA batch available' },
        { id: 'cnvdOdAvail', label: 'CNVD on-demand available' },
        { id: 'awrBatchAvail', label: 'AWR batch available' },
        { id: 'cnvascBatchAvail', label: 'CNVASC batch available' }
      ];
      panels.forEach(function (spec) {
        panelRows(spec.id).forEach(function (r) {
          var n = spec.id === 'cnvaOdAvail' ? toNum(r.CNV8) : toNum(r.TOTAL);
          if (n <= 0) return;
          issues.push({
            severity: 'low',
            partner: trimStr(r.PARTITION),
            campaign: trimStr(r.PROGRAM_SOLUTION),
            year: trimStr(state.filters.year),
            issue: 'Print: ' + spec.label + ' (' + n.toLocaleString('en-US') + ')',
            chapter: 'printBatches'
          });
        });
      });
      return issues.slice(0, 40);
    },
    getHubStat: function () {
      if (!state.ready || !state.rows.length) return { value: null, label: 'still available' };
      var avail = sumKey(panelRows('cnvaOdAvail'), 'CNV8') +
        sumKey(panelRows('cnvdOdAvail'), 'TOTAL') +
        sumKey(panelRows('cnvaBatchAvail'), 'TOTAL') +
        sumKey(panelRows('awrBatchAvail'), 'TOTAL') +
        sumKey(panelRows('cnvascBatchAvail'), 'TOTAL');
      var sent = sumKey(panelRows('cnvaOdSent'), 'TOTAL') +
        sumKey(panelRows('cnvdOdSent'), 'TOTAL') +
        sumKey(panelRows('cnvaBatchSent'), 'TOTAL') +
        sumKey(panelRows('awrBatchSent'), 'TOTAL') +
        sumKey(panelRows('cnvascBatchSent'), 'TOTAL');
      return { value: Math.max(0, avail - sent), label: 'still available' };
    },
    getError: function () { return state.error; },
    exportChapterReport: function () {
      var OER = global.OpsExportReport;
      if (!OER || typeof ExcelJS === 'undefined') {
        setStatus('Excel export requires ExcelJS.', 'error');
        return;
      }
      if (!state.ready || state.loading) {
        setStatus('Data is still loading.', 'loading');
        return;
      }
      var blocks = [];
      var subtitleParts = [];
      if (state.filters.year) subtitleParts.push('Year ' + state.filters.year);
      if (trimStr(state.filters.search)) subtitleParts.push('Search: ' + state.filters.search);
      var subtitle = subtitleParts.length ? subtitleParts.join('  ·  ') : 'All print batch panels';
      PANEL_IDS.forEach(function (id) {
        var meta = PANELS[id];
        var rows = sortRows(panelRows(id), state.sorts[id], meta.cols);
        if (!rows.length) return;
        var headers = meta.cols.map(function (c) { return c.label; });
        var body = rows.map(function (r) {
          return meta.cols.map(function (c) { return rowVal(r, c.key); });
        });
        var colAlign = meta.cols.map(function (c) { return c.kind === 'num' ? 'right' : 'left'; });
        blocks.push({ title: meta.title, headers: headers, rows: body, colAlign: colAlign });
      });
      if (!blocks.length) {
        setStatus('No rows to export for the current filters.', 'error');
        return;
      }
      var wb = OER.createWorkbook();
      OER.addConsolidatedSheet(wb, {
        name: 'All Together',
        docTitle: 'Print Batches',
        subtitle: subtitle,
        blocks: blocks
      });
      blocks.forEach(function (block) {
        OER.addDataSheet(wb, {
          name: block.title.slice(0, 31),
          docTitle: 'Print Batches',
          sectionTitle: block.title,
          subtitle: subtitle,
          headers: block.headers,
          rows: block.rows,
          colAlign: block.colAlign
        });
      });
      OER.downloadWorkbook(wb, 'print-batches-report-' + OER.fileStamp() + '.xlsx')
        .then(function () { setStatus('Exported Print Batches report.'); })
        .catch(function (err) {
          console.warn('[Print Batches] Export failed:', err);
          setStatus('Export failed.', 'error');
        });
    }
  };
})(window);
