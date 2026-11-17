/**
 * 3E Operations — hub command center, partner heatmap, and Launch Readiness work queue.
 */
(function (global) {
  'use strict';

  var Join = global.OpsJoin || {};
  var host = null;
  var STALE_WARM = 14;
  var STALE_HOT = 30;
  var CLIENT_VIEW_LOOKBACK_DAYS = 30;
  var EXCEPTIONS_ALIAS = 'dashboardExceptions';
  var PAGE_VIEWS_ALIAS = 'pageViews';
  var PAGE_VIEWS_ID = 'dea70a64-b434-4783-80d3-84df858a785c';

  var ccState = {
    loading: false,
    prefetchGen: 0,
    exceptions: [],
    exceptionsError: '',
    exceptionsReady: false,
    clientViewsByPartition: {},
    clientViewsLoaded: false,
    queueFilter: 'all',
    signature: ''
  };

  function trimStr(v) {
    if (Join.trimStr) return Join.trimStr(v);
    if (v == null) return '';
    return String(v).replace(/\u00a0/g, ' ').trim();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toNumber(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function daysSince(date) {
    if (!date || isNaN(date.getTime())) return null;
    var ms = Date.now() - date.getTime();
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  }

  function programLifecycle(row) {
    if (host && host.programLifecycle) return host.programLifecycle(row);
    var s = trimStr(row && row.PROGRAM_STATUS).toUpperCase();
    if (s.indexOf('INACTIVE') >= 0) return 'inactive';
    if (s.indexOf('DEVELOPMENT') >= 0 || s.indexOf('DEVELOP') >= 0) return 'development';
    return 'active';
  }

  function filterPrograms(programs, filters) {
    if (host && host.filterProgramsForScope) {
      return host.filterProgramsForScope(programs, filters);
    }
    return programs || [];
  }

  function mod(id) {
    var map = {
      campaignUploadQa: global.PartnerCampaignUploadQaTab,
      printBatches: global.PartnerPrintBatchesTab,
      programMeta: global.PartnerProgramMetaTab,
      insightsActivity: global.PartnerInsightsUsageTab
    };
    return map[id] || null;
  }

  function prefetchEmbedded() {
    var gen = ++ccState.prefetchGen;
    ccState.loading = true;
    renderIfActive();
    var jobs = [];
    var qa = mod('campaignUploadQa');
    var pm = mod('programMeta');
    var pb = mod('printBatches');
    var ipu = mod('insightsActivity');
    [qa, pm, pb, ipu].forEach(function (mod) {
      if (mod && typeof mod.prefetchForCommandCenter === 'function') {
        jobs.push(function () {
          return Promise.resolve(mod.prefetchForCommandCenter()).catch(function () {});
        });
      }
    });
    return jobs.reduce(function (chain, job) {
      return chain.then(function () {
        if (gen !== ccState.prefetchGen) return;
        return job();
      });
    }, Promise.resolve()).then(function () {
      if (gen !== ccState.prefetchGen) return;
      ccState.loading = false;
      renderIfActive();
    });
  }

  function loadExceptions() {
    ccState.exceptionsError = '';
    if (typeof domo === 'undefined') {
      ccState.exceptions = [];
      return Promise.resolve([]);
    }
    if (host && typeof host.isDatasetMapped === 'function' && !host.isDatasetMapped(EXCEPTIONS_ALIAS)) {
      ccState.exceptions = [];
      return Promise.resolve([]);
    }
    return domo.get('/data/v1/' + EXCEPTIONS_ALIAS, { limit: 2000 }).then(function (rows) {
      var list = (rows || []).map(function (r) {
        return Join.normalizeExceptionRow ? Join.normalizeExceptionRow(r) : null;
      }).filter(Boolean);
      ccState.exceptions = list;
      return list;
    }).catch(function (err) {
      ccState.exceptions = [];
      ccState.exceptionsError = err && err.message ? err.message : String(err || '');
      return [];
    });
  }

  function loadClientViewCounts() {
    ccState.clientViewsLoaded = false;
    var ipu = mod('insightsActivity');
    if (ipu && typeof ipu.getClientViewsByPartition === 'function') {
      var map = ipu.getClientViewsByPartition(CLIENT_VIEW_LOOKBACK_DAYS);
      if (map) {
        ccState.clientViewsByPartition = map;
        ccState.clientViewsLoaded = true;
        return Promise.resolve(map);
      }
    }
    if (typeof domo === 'undefined') return Promise.resolve({});
    var since = new Date();
    since.setDate(since.getDate() - CLIENT_VIEW_LOOKBACK_DAYS);
    var sinceIso = since.toISOString().slice(0, 10);
    var q = 'SELECT workspace_name, COUNT(*) AS views FROM ' + PAGE_VIEWS_ALIAS +
      " WHERE act_date >= '" + sinceIso + "' GROUP BY workspace_name LIMIT 5000";
    return domo.post('/sql/v1/' + PAGE_VIEWS_ALIAS, q, { contentType: 'text/plain' }).then(function (rows) {
      var out = {};
      (rows || []).forEach(function (r) {
        var p = trimStr(r.workspace_name || r.WORKSPACE_NAME || r.PARTITION);
        if (!p || (Join.isIgnoredPartition && Join.isIgnoredPartition(p))) return;
        var key = p.toLowerCase();
        out[key] = (out[key] || 0) + toNumber(r.views || r.VIEWS);
      });
      ccState.clientViewsByPartition = out;
      ccState.clientViewsLoaded = true;
      return out;
    }).catch(function () {
      ccState.clientViewsByPartition = {};
      ccState.clientViewsLoaded = false;
      return {};
    });
  }

  function clientViewsForPartition(partition) {
    var p = trimStr(partition).toLowerCase();
    if (!p) return 0;
    return toNumber(ccState.clientViewsByPartition[p]);
  }

  function collectUploadIssues() {
    var qa = mod('campaignUploadQa');
    if (qa && typeof qa.getCommandCenterIssues === 'function') {
      return qa.getCommandCenterIssues();
    }
    return [];
  }

  function collectMetaIssues() {
    var pm = mod('programMeta');
    if (pm && typeof pm.getCommandCenterIssues === 'function') {
      return pm.getCommandCenterIssues();
    }
    return [];
  }

  function collectPrintIssues() {
    var pb = mod('printBatches');
    if (pb && typeof pb.getCommandCenterIssues === 'function') {
      return pb.getCommandCenterIssues();
    }
    return [];
  }

  function buildProgramIssues(programs, allPrograms) {
    var items = [];
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    programs.forEach(function (row) {
      var partner = trimStr(row.PARTITION);
      var campaign = Join.rowCampaignCode ? Join.rowCampaignCode(row) : trimStr(row.PROGRAM_SOLUTION);
      var year = trimStr(row.CAMPAIGN_YEAR);
      var days = toNumber(row.DAYS_SINCE_LAST_TOUCHED);
      if (days >= STALE_HOT) {
        items.push({
          severity: 'high',
          partner: partner,
          campaign: campaign,
          year: year,
          issue: 'Program stale (' + days + ' days since activity)',
          chapter: 'partnerDataHealth',
          programRow: row
        });
      } else if (days >= STALE_WARM) {
        items.push({
          severity: 'medium',
          partner: partner,
          campaign: campaign,
          year: year,
          issue: 'Activity aging (' + days + ' days)',
          chapter: 'partnerDataHealth',
          programRow: row
        });
      }
      var avail = Join.effectiveCampaignAvailabilityDate
        ? Join.effectiveCampaignAvailabilityDate(row, allPrograms, ccState.exceptions)
        : (Join.dashboardAvailabilityDate ? Join.dashboardAvailabilityDate(row.FIRST_ACTIVITY) : null);
      if (avail && avail.getTime() <= today.getTime()) {
        var views = clientViewsForPartition(partner);
        if (ccState.clientViewsLoaded && views === 0) {
          items.push({
            severity: 'medium',
            partner: partner,
            campaign: campaign,
            year: year,
            issue: 'Dashboard live since ' + Join.formatAvailabilityDate(avail) + ' — no client portal views (' + CLIENT_VIEW_LOOKBACK_DAYS + 'd)',
            chapter: 'insightsActivity',
            programRow: row
          });
        }
      }
    });
    return items;
  }

  function buildWorkQueue(programs, allPrograms) {
    var items = buildProgramIssues(programs, allPrograms)
      .concat(collectUploadIssues())
      .concat(collectMetaIssues())
      .concat(collectPrintIssues());
    var rank = { high: 0, medium: 1, low: 2 };
    items.sort(function (a, b) {
      var dr = (rank[a.severity] || 9) - (rank[b.severity] || 9);
      if (dr !== 0) return dr;
      return (a.partner || '').localeCompare(b.partner || '', undefined, { sensitivity: 'base' });
    });
    return items;
  }

  function computeFunnel(programs, allPrograms) {
    var live = 0;
    var withViews = 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    programs.forEach(function (row) {
      var avail = Join.effectiveCampaignAvailabilityDate
        ? Join.effectiveCampaignAvailabilityDate(row, allPrograms, ccState.exceptions)
        : null;
      if (avail && avail.getTime() <= today.getTime()) {
        live += 1;
        if (clientViewsForPartition(row.PARTITION) > 0) withViews += 1;
      }
    });
    var uploadIssues = collectUploadIssues();
    var freshUpload = Math.max(0, programs.length - uploadIssues.filter(function (i) {
      return i.severity === 'high' || i.severity === 'medium';
    }).length);
    return {
      programs: programs.length,
      freshUpload: freshUpload,
      dashboardsLive: live,
      clientViews: withViews
    };
  }

  function heatTone(level) {
    if (level === 'ok') return 'ops-heat--ok';
    if (level === 'warn') return 'ops-heat--warn';
    if (level === 'bad') return 'ops-heat--bad';
    return 'ops-heat--na';
  }

  function buildHeatmapRows(programs, allPrograms) {
    var byPartner = {};
    programs.forEach(function (row) {
      var p = trimStr(row.PARTITION);
      if (!p) return;
      if (!byPartner[p]) {
        byPartner[p] = { partner: p, programs: 0, staleMax: 0, live: 0, noViews: 0 };
      }
      var bucket = byPartner[p];
      bucket.programs += 1;
      bucket.staleMax = Math.max(bucket.staleMax, toNumber(row.DAYS_SINCE_LAST_TOUCHED));
      var avail = Join.effectiveCampaignAvailabilityDate
        ? Join.effectiveCampaignAvailabilityDate(row, allPrograms, ccState.exceptions)
        : null;
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (avail && avail.getTime() <= today.getTime()) {
        bucket.live += 1;
        if (ccState.clientViewsLoaded && clientViewsForPartition(p) === 0) bucket.noViews += 1;
      }
    });
    var uploadByPartner = {};
    collectUploadIssues().forEach(function (item) {
      var key = trimStr(item.partner);
      if (!key) return;
      uploadByPartner[key] = (uploadByPartner[key] || 0) + 1;
    });
    var metaByPartner = {};
    collectMetaIssues().forEach(function (item) {
      var key = trimStr(item.partner);
      if (!key) return;
      metaByPartner[key] = (metaByPartner[key] || 0) + 1;
    });
    var printByPartner = {};
    collectPrintIssues().forEach(function (item) {
      var key = trimStr(item.partner);
      if (!key) return;
      printByPartner[key] = (printByPartner[key] || 0) + 1;
    });

    return Object.keys(byPartner).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).map(function (partner) {
      var b = byPartner[partner];
      var act = b.staleMax >= STALE_HOT ? 'bad' : (b.staleMax >= STALE_WARM ? 'warn' : 'ok');
      var up = uploadByPartner[partner] ? (uploadByPartner[partner] >= 2 ? 'bad' : 'warn') : 'ok';
      var meta = metaByPartner[partner] ? 'warn' : 'ok';
      var print = printByPartner[partner] ? 'warn' : 'ok';
      var views = !ccState.clientViewsLoaded ? 'na' : (b.live && b.noViews ? 'warn' : (b.live ? 'ok' : 'na'));
      return {
        partner: partner,
        activity: act,
        upload: up,
        meta: meta,
        print: print,
        views: views
      };
    });
  }

  function renderKpis(programs, allPrograms, queue) {
    var el = document.getElementById('hubKpiStrip');
    if (!el) return;
    var stale14 = 0;
    var stale30 = 0;
    programs.forEach(function (r) {
      var d = toNumber(r.DAYS_SINCE_LAST_TOUCHED);
      if (d >= STALE_WARM) stale14 += 1;
      if (d >= STALE_HOT) stale30 += 1;
    });
    var high = queue.filter(function (q) { return q.severity === 'high'; }).length;
    var funnel = computeFunnel(programs, allPrograms);
    var cards = [
      { label: 'Programs in scope', value: programs.length, note: 'Active filter from Overview scope filter bar', tone: '' },
      { label: 'Stale 14+ days', value: stale14, note: 'Partner Data Health rule', tone: stale14 ? 'warn' : '' },
      { label: 'Stale 30+ days', value: stale30, note: 'Needs outreach', tone: stale30 ? 'bad' : '' },
      { label: 'Work queue', value: queue.length, note: high ? high + ' high priority' : 'Launch Readiness', tone: high ? 'bad' : (queue.length ? 'warn' : '') },
      { label: 'Dashboards live', value: funnel.dashboardsLive, note: 'First activity + 14d (or override)', tone: '' },
      { label: 'With client views', value: funnel.clientViews, note: ccState.clientViewsLoaded ? 'Last ' + CLIENT_VIEW_LOOKBACK_DAYS + ' days' : 'Loading views…', tone: '' }
    ];
    el.innerHTML = cards.map(function (c) {
      var cls = 'ops-kpi-card' + (c.tone === 'warn' ? ' ops-kpi-card--warn' : (c.tone === 'bad' ? ' ops-kpi-card--bad' : ''));
      return '<div class="' + cls + '"><p class="ops-kpi-label">' + escapeHtml(c.label) + '</p>' +
        '<p class="ops-kpi-value">' + escapeHtml(String(c.value)) + '</p>' +
        '<p class="ops-kpi-note">' + escapeHtml(c.note) + '</p></div>';
    }).join('');
  }

  function renderFunnel(programs, allPrograms) {
    var el = document.getElementById('hubFunnel');
    if (!el) return;
    var f = computeFunnel(programs, allPrograms);
    var steps = [
      { n: f.programs, label: 'Programs' },
      { n: f.freshUpload, label: 'Upload OK' },
      { n: f.dashboardsLive, label: 'Dashboard live' },
      { n: f.clientViews, label: 'Client views' }
    ];
    el.innerHTML = steps.map(function (s, i) {
      var arrow = i < steps.length - 1 ? '<span class="ops-funnel-arrow" aria-hidden="true">→</span>' : '';
      return (i ? arrow : '') +
        '<div class="ops-funnel-step"><strong>' + escapeHtml(String(s.n)) + '</strong><span>' + escapeHtml(s.label) + '</span></div>';
    }).join('');
  }

  function renderHeatmap(programs, allPrograms) {
    var el = document.getElementById('hubHeatmap');
    if (!el) return;
    var rows = buildHeatmapRows(programs, allPrograms);
    if (!rows.length) {
      el.innerHTML = '<p class="ops-heatmap-empty">No partners in the current scope.</p>';
      return;
    }
    var maxRows = 25;
    var truncated = rows.length > maxRows;
    if (truncated) rows = rows.slice(0, maxRows);
    function cell(level, label) {
      return '<span class="ops-heat ' + heatTone(level) + '">' + escapeHtml(label) + '</span>';
    }
    var body = rows.map(function (r) {
      return '<tr data-partner="' + escapeHtml(r.partner) + '"><td>' + escapeHtml(r.partner) + '</td>' +
        '<td>' + cell(r.activity, r.activity === 'ok' ? 'OK' : (r.activity === 'warn' ? '14+' : '30+')) + '</td>' +
        '<td>' + cell(r.upload, r.upload === 'ok' ? 'OK' : 'Late') + '</td>' +
        '<td>' + cell(r.meta, r.meta === 'ok' ? 'OK' : 'Gap') + '</td>' +
        '<td>' + cell(r.print, r.print === 'ok' ? 'OK' : 'Gap') + '</td>' +
        '<td>' + cell(r.views, r.views === 'na' ? '—' : (r.views === 'ok' ? 'Views' : 'None')) + '</td></tr>';
    }).join('');
    el.innerHTML = '<table class="ops-heatmap-table"><thead><tr><th>Partner</th><th>Activity</th><th>Upload</th><th>Meta</th><th>Print</th><th>Views</th></tr></thead><tbody>' +
      body + '</tbody></table>' +
      (truncated ? '<p class="ops-heatmap-empty">Showing first ' + maxRows + ' partners — narrow scope to see more.</p>' : '');
  }

  function updateHubCardStats(queue) {
    var late = queue.filter(function (q) { return q.issue && q.issue.indexOf('upload') >= 0; }).length;
    var map = {
      partnerDataHealth: queue.filter(function (q) { return q.chapter === 'partnerDataHealth'; }).length,
      campaignUploadQa: collectUploadIssues().length,
      programMeta: collectMetaIssues().length,
      printBatches: collectPrintIssues().length,
      workQueue: queue.length
    };
    Object.keys(map).forEach(function (key) {
      if (host.isChapterTabled && host.isChapterTabled(key)) return;
      var badge = document.getElementById('hubStat-' + key);
      if (!badge) return;
      var n = map[key];
      if (!n) {
        badge.hidden = true;
        badge.textContent = '';
        return;
      }
      badge.hidden = false;
      badge.textContent = String(n);
    });
  }

  function renderWorkQueue(queue) {
    var tbody = document.getElementById('opsQueueBody');
    var meta = document.getElementById('opsQueueMeta');
    if (!tbody) return;
    var filter = ccState.queueFilter;
    var visible = queue.filter(function (item) {
      if (filter === 'all') return true;
      return item.severity === filter;
    });
    if (meta) {
      var bits = [visible.length.toLocaleString('en-US') + ' item' + (visible.length === 1 ? '' : 's')];
      if (filter !== 'all') bits.push(filter + ' priority only');
      if (ccState.loading) bits.push('refreshing data…');
      meta.textContent = bits.join(' · ');
    }
    if (!visible.length) {
      tbody.innerHTML = '<tr class="lr-queue-empty"><td colspan="5">Nothing flagged for this scope — widen filters or check back after data loads.</td></tr>';
      return;
    }
    tbody.innerHTML = visible.slice(0, 200).map(function (item, idx) {
      var sev = item.severity || 'low';
      return '<tr><td class="lr-col-priority"><span class="ops-queue-sev ops-queue-sev--' + escapeHtml(sev) + '">' + escapeHtml(sev) + '</span></td>' +
        '<td>' + escapeHtml(item.partner || '—') + '</td>' +
        '<td>' + escapeHtml([item.campaign, item.year].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td class="lr-col-issue">' + escapeHtml(item.issue || '') + '</td>' +
        '<td class="lr-col-action"><button type="button" class="ops-queue-action" data-queue-idx="' + idx + '" data-queue-chapter="' + escapeHtml(item.chapter || '') + '">Open</button></td></tr>';
    }).join('');
    tbody._queueItems = visible.slice(0, 200);
  }

  function renderExceptionsPanel() {
    var el = document.getElementById('opsExceptionsPanel');
    if (!el) return;
    var list = ccState.exceptions;
    var err = ccState.exceptionsError;
    var items = list.length
      ? list.map(function (ex) {
        return '<li><strong>' + escapeHtml(ex.partition) + '</strong>' +
          (ex.campaign ? ' · ' + escapeHtml(ex.campaign) : ' · cross-campaign') +
          (ex.year ? ' · ' + escapeHtml(ex.year) : '') +
          ' → ' + escapeHtml(Join.formatAvailabilityDate(ex.date)) +
          (ex.note ? ' — ' + escapeHtml(ex.note) : '') + '</li>';
      }).join('')
      : '';
    var summaryLabel = list.length
      ? ('Go-live overrides (' + list.length + ')')
      : 'Go-live overrides';
    var body = '';
    if (err && !list.length) {
      body = '<p class="ops-exceptions-note">Overrides not loaded' +
        (err.indexOf('404') >= 0 || err.indexOf('not found') >= 0 ? ' — map alias <code>dashboardExceptions</code> on this card.' : ': ' + escapeHtml(err)) +
        '</p>';
    } else if (list.length) {
      body = '<ul class="ops-exceptions-list">' + items + '</ul>';
    } else {
      body = '<p class="ops-exceptions-note">No overrides — using first activity + 14 days (and CNVA for cross-campaign).</p>';
    }
    el.innerHTML = '<details class="ops-exceptions-details"><summary>' + escapeHtml(summaryLabel) + '</summary>' + body + '</details>';
  }

  function renderHubScopeHint() {
    /* Home chapter stays free of applied filter / scope messaging. */
  }

  function renderHub() {
    if (!host) return;
    if (host.isChapterTabled && host.isChapterTabled('workQueue')) {
      var idleGrid = document.getElementById('hubGrid');
      if (idleGrid) idleGrid.classList.remove('hub-grid--loading');
      return;
    }
    var programs = host.isReady && host.isReady()
      ? filterPrograms(host.getPrograms ? host.getPrograms() : [], host.getFilters ? host.getFilters() : {})
      : [];
    var allPrograms = host.getPrograms ? host.getPrograms() : [];
    var queue = programs.length ? buildWorkQueue(programs, allPrograms) : [];
    updateHubCardStats(queue);
    renderHubScopeHint();
    if (!host.isChapterTabled || !host.isChapterTabled('workQueue')) {
      var badge = document.getElementById('chapterBadge-workQueue');
      if (badge) {
        if (queue.length) {
          badge.hidden = false;
          badge.textContent = queue.length > 999 ? '999+' : String(queue.length);
        } else {
          badge.hidden = true;
          badge.textContent = '';
        }
      }
    }
    var grid = document.getElementById('hubGrid');
    if (grid) grid.classList.toggle('hub-grid--loading', !!ccState.loading);
    if (host.getActiveChapter && host.getActiveChapter() === 'hub' && typeof host.setStatus === 'function') {
      host.setStatus('Pick a chapter below to get started.');
    }
  }

  function renderWorkQueueChapter() {
    if (!host) return;
    var programs = filterPrograms(host.getPrograms ? host.getPrograms() : [], host.getFilters ? host.getFilters() : {});
    var allPrograms = host.getPrograms ? host.getPrograms() : [];
    var queue = buildWorkQueue(programs, allPrograms);
    renderWorkQueue(queue);
    renderExceptionsPanel();
  }

  function syncQueueSeverityUi() {
    var sel = document.getElementById('queueSeveritySelect');
    if (!sel) return;
    if (sel.value !== ccState.queueFilter) sel.value = ccState.queueFilter;
  }

  function setQueueFilter(value) {
    var v = value || 'all';
    if (['all', 'high', 'medium', 'low'].indexOf(v) < 0) v = 'all';
    ccState.queueFilter = v;
    syncQueueSeverityUi();
    renderWorkQueueChapter();
  }

  function renderIfActive() {
    if (!host || !host.getActiveChapter) return;
    var ch = host.getActiveChapter();
    if (ch === 'hub') renderHub();
    if (ch === 'workQueue') renderWorkQueueChapter();
  }

  function hubOrQueueActive() {
    if (!host || !host.getActiveChapter) return false;
    var ch = host.getActiveChapter();
    return ch === 'hub' || ch === 'workQueue';
  }

  function workQueueTabled() {
    return !!(host && host.isChapterTabled && host.isChapterTabled('workQueue'));
  }

  function ensureFreshData(force) {
    if (!host) return Promise.resolve();
    if (!hubOrQueueActive()) {
      return Promise.resolve();
    }
    if (workQueueTabled() && ccState.exceptionsReady) {
      ccState.loading = false;
      renderIfActive();
      return Promise.resolve();
    }
    var sig = host.getScopeSignature ? host.getScopeSignature(host.getFilters()) : '';
    if (!force && sig === ccState.signature && !ccState.loading) {
      renderIfActive();
      return Promise.resolve();
    }
    if (ccState.refreshing) {
      if (force) ccState.refreshAgain = true;
      return Promise.resolve();
    }
    ccState.refreshing = true;
    ccState.signature = sig;
    function finishRefresh() {
      ccState.refreshing = false;
      if (ccState.refreshAgain) {
        ccState.refreshAgain = false;
        return ensureFreshData(true);
      }
      renderIfActive();
      return Promise.resolve();
    }
    return loadExceptions().then(function () {
      ccState.exceptionsReady = true;
      if (workQueueTabled()) return;
      return prefetchEmbedded().then(function () {
        return loadClientViewCounts();
      });
    }).then(finishRefresh, function (err) {
      return finishRefresh().then(function () { return Promise.reject(err); });
    });
  }

  function bindControls() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      var qBtn = t.closest('[data-queue-chapter]');
      if (qBtn && qBtn.classList.contains('ops-queue-action')) {
        var tbody = document.getElementById('opsQueueBody');
        var idx = toNumber(qBtn.getAttribute('data-queue-idx'));
        var chapter = qBtn.getAttribute('data-queue-chapter') || 'partnerDataHealth';
        var item = tbody && tbody._queueItems ? tbody._queueItems[idx] : null;
        if (host && host.navigateChapter) host.navigateChapter(chapter, { programRow: item && item.programRow });
        ev.preventDefault();
        return;
      }
    });
    var sevSel = document.getElementById('queueSeveritySelect');
    if (sevSel && !sevSel._opsQueueBound) {
      sevSel._opsQueueBound = true;
      sevSel.addEventListener('change', function () {
        setQueueFilter(sevSel.value);
      });
    }
  }

  global.OpsCommandCenter = {
    init: function (h) {
      host = h;
      bindControls();
    },
    syncQueueSeverityUi: syncQueueSeverityUi,
    setQueueFilter: setQueueFilter,
    getExceptions: function () {
      return ccState.exceptions.slice();
    },
    refresh: function (opts) {
      opts = opts || {};
      return ensureFreshData(!!opts.force);
    },
    render: renderIfActive,
    isLoading: function () {
      return !!ccState.loading;
    },
    getWorkQueueExportBlocks: function () {
      if (!host) return [];
      var programs = filterPrograms(host.getPrograms ? host.getPrograms() : [], host.getFilters ? host.getFilters() : {});
      var queue = buildWorkQueue(programs, host.getPrograms ? host.getPrograms() : []);
      if (!queue.length) return [];
      var headers = ['Severity', 'Partner', 'Campaign', 'Year', 'Issue', 'Chapter'];
      var rows = queue.map(function (item) {
        return [
          item.severity,
          item.partner,
          item.campaign,
          item.year,
          item.issue,
          item.chapter
        ];
      });
      return [{
        title: 'Launch Readiness',
        headers: headers,
        rows: rows,
        colAlign: ['left', 'left', 'left', 'left', 'left', 'left']
      }];
    },
    exportWorkQueueCsv: function () {
      if (!host) return;
      var block = this.getWorkQueueExportBlocks()[0];
      if (!block || !block.rows.length) return;
      var lines = [block.headers.join(',')];
      block.rows.forEach(function (cells) {
        lines.push(cells.map(function (v) {
          var s = String(v == null ? '' : v);
          if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0) return '"' + s.replace(/"/g, '""') + '"';
          return s;
        }).join(','));
      });
      var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'launch-readiness-queue-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
})(window);
