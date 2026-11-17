/**
 * Shared partner / campaign / year join helpers for 3E Operations chapters.
 * Loaded before tab scripts so Partner Data Health, Campaign Upload QA,
 * and Program Meta use the same codes (CNVA vs Conversion Apply, CY26 vs 2026).
 */
(function (global) {
  'use strict';

  var CAMPAIGN_CODE_ORDER = ['CNVAAFF', 'CNVASC', 'CNVAU', 'CNVAA', 'CNVD', 'CNVA', 'AWRSS', 'AWRRS', 'AWR'];
  /** Client campaign dashboards: two weeks after first program activity (Analyzer rule). */
  var DASHBOARD_AVAILABILITY_OFFSET_DAYS = 14;
  /** Cross-campaign client dashboards align with CNVA for year switch / launch timing. */
  var CROSS_CAMPAIGN_ANCHOR_CODE = 'CNVA';
  /** Test / sandbox partners — excluded from Operations UI and aggregates. */
  var IGNORED_PARTITION_PREFIX = 'z_';

  function trimStr(v) {
    if (v == null) return '';
    return String(v).replace(/\u00a0/g, ' ').trim();
  }

  function sameText(a, b) {
    return trimStr(a).toLowerCase() === trimStr(b).toLowerCase();
  }

  function compactJoinKey(v) {
    return trimStr(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function compactToken(v) {
    return trimStr(v).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  }

  /** Same partner under different labels. Add a group when a short name must join a longer one. */
  var PARTNER_ALIAS_GROUPS = [
    ['Humboldt', 'Cal Poly Humboldt']
  ];

  var partnerAliasIndex = null;

  function partnerAliasId(name) {
    var key = compactJoinKey(name);
    if (!key) return '';
    if (!partnerAliasIndex) {
      partnerAliasIndex = {};
      PARTNER_ALIAS_GROUPS.forEach(function (group, i) {
        group.forEach(function (label) {
          var k = compactJoinKey(label);
          if (k) partnerAliasIndex[k] = 'g' + i;
        });
      });
    }
    return partnerAliasIndex[key] || '';
  }

  function partitionKeysOverlap(a, b) {
    var na = compactJoinKey(a);
    var nb = compactJoinKey(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    var ia = partnerAliasId(a);
    var ib = partnerAliasId(b);
    return !!(ia && ib && ia === ib);
  }

  var CAMPAIGN_QUERY_ALIASES = {
    CNVAAFF: ['CNVAAFF', 'Affluent', 'Conversion Affluent'],
    CNVASC: ['CNVASC', 'Association', 'School Counselor', 'School Counselors'],
    CNVAU: ['CNVAU', 'Undecided'],
    CNVAA: ['CNVAA', 'Academic'],
    CNVD: ['CNVD', 'Deposit', 'Conversion Deposit'],
    CNVA: ['CNVA', 'Conversion Apply', 'Conversion'],
    AWRSS: ['AWRSS'],
    AWRRS: ['AWRRS'],
    AWR: ['AWR', 'Awareness']
  };

  function campaignQueryValues(selected) {
    var out = [];
    var seen = {};
    function add(v) {
      var s = trimStr(v);
      if (!s) return;
      var key = s.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(s);
    }
    (selected || []).forEach(function (raw) {
      add(raw);
      var code = canonicalCampaignCode(raw);
      var aliases = CAMPAIGN_QUERY_ALIASES[code];
      if (aliases) aliases.forEach(add);
      else add(code);
    });
    return out;
  }

  function calendarDaysBetween(start, end) {
    var a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /** Campaign cycles run Aug 1 through Jul 31. August–December belong to that calendar year. */
  function campaignCycleAnchorYear(date) {
    if (!date || isNaN(date.getTime())) return null;
    return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  }

  /**
   * CY26 is entry year 2027, CY25 is entry year 2026.
   * The Aug 1 cycle start is the calendar year before that entry year.
   */
  function entryYearFromCampaignYear(yearValue) {
    var token = campaignYearToken(yearValue);
    var m = token && token.match(/^CY(\d{2})$/);
    if (!m) return null;
    return 2001 + parseInt(m[1], 10);
  }

  function campaignYearStartCalendar(yearValue) {
    var entry = entryYearFromCampaignYear(yearValue);
    return entry == null ? null : entry - 1;
  }

  function cycleDayIndex(date, anchorYear) {
    if (!date || anchorYear == null || isNaN(date.getTime())) return null;
    return calendarDaysBetween(new Date(anchorYear, 7, 1), date);
  }

  function todayCycleDayIndex(today) {
    var day = today || new Date();
    var anchor = campaignCycleAnchorYear(day);
    if (anchor == null) return null;
    return cycleDayIndex(day, anchor);
  }

  /**
   * Same point in each Aug–Jul cycle. A March "today" still includes the prior August–December.
   * Membership dated before Aug 1 is the partnership balance and is already in the total.
   */
  function pointInTimeIncludes(date, campaignYear, today) {
    if (!date || isNaN(date.getTime())) return false;
    var anchor = campaignYearStartCalendar(campaignYear);
    if (anchor == null) return true;
    var off = cycleDayIndex(date, anchor);
    var todayOff = todayCycleDayIndex(today || new Date());
    if (off == null || todayOff == null) return true;
    if (off < 0) return true;
    return off <= todayOff;
  }

  /**
   * Put every membership count on an Aug–Jul cycle. Dates before Aug 1 or after Jul 31
   * sit on day 0 so the line and the legend equal the load-table total.
   */
  function placeMembershipOnCycle(rows, cycleStart, maxDay) {
    var byOffset = {};
    var grand = 0;
    var span = maxDay == null || maxDay < 0 ? 0 : maxDay;
    (rows || []).forEach(function (row) {
      var count = Number(row && row.count) || 0;
      var date = row && row.date;
      if (!count || !date || isNaN(date.getTime())) return;
      grand += count;
      var off = calendarDaysBetween(cycleStart, date);
      if (off == null || !isFinite(off) || off < 0 || off > span) off = 0;
      byOffset[off] = (byOffset[off] || 0) + count;
    });
    var data = [];
    var running = 0;
    var last = -1;
    var i;
    for (i = 0; i <= span; i++) {
      running += byOffset[i] || 0;
      if (byOffset[i]) last = i;
      data.push(running);
    }
    if (grand && running !== grand) {
      byOffset[0] = (byOffset[0] || 0) + (grand - running);
      data = [];
      running = 0;
      last = -1;
      for (i = 0; i <= span; i++) {
        running += byOffset[i] || 0;
        if (byOffset[i]) last = i;
        data.push(running);
      }
    }
    return { data: data, total: grand, lastDay: last };
  }

  function pointInTimeCutoffDate(campaignYear, today) {
    var day = today || new Date();
    var anchor = campaignYearStartCalendar(campaignYear);
    if (anchor == null) return new Date(day.getFullYear(), day.getMonth(), day.getDate());
    var todayOff = todayCycleDayIndex(day);
    if (todayOff == null || todayOff < 0) todayOff = 0;
    var cut = new Date(anchor, 7, 1);
    cut.setDate(cut.getDate() + todayOff);
    return cut;
  }

  function canonicalCampaignCode(v) {
    var original = trimStr(v);
    if (!original) return '';
    var n = compactToken(original);
    var i;
    for (i = 0; i < CAMPAIGN_CODE_ORDER.length; i++) {
      if (n === CAMPAIGN_CODE_ORDER[i]) return CAMPAIGN_CODE_ORDER[i];
    }
    /* Prefix only — substring match would map QSCNVA (and similar) onto CNVA. */
    for (i = 0; i < CAMPAIGN_CODE_ORDER.length; i++) {
      var code = CAMPAIGN_CODE_ORDER[i];
      if (n.indexOf(code) === 0) return code;
    }
    if (n.indexOf('AFFLUENT') >= 0) return 'CNVAAFF';
    if (n.indexOf('ASSOCIATION') >= 0 || n.indexOf('SCHOOLCOUNSELOR') >= 0) return 'CNVASC';
    if (n.indexOf('UNDECIDED') >= 0) return 'CNVAU';
    if (n.indexOf('ACADEMIC') >= 0) return 'CNVAA';
    if (n.indexOf('DEPOSIT') >= 0) return 'CNVD';
    if (n.indexOf('CONVERSIONAPPLY') >= 0 || n.indexOf('CONVERSION') >= 0) return 'CNVA';
    if (n.indexOf('AWARENESS') >= 0) return 'AWR';
    return original.toUpperCase();
  }

  function yearMatchValues(years) {
    var seen = {};
    var out = [];
    function add(v) {
      var s = trimStr(v);
      if (!s) return;
      var key = s.toUpperCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(s);
    }
    (years || []).forEach(function (y) {
      add(y);
      var token = campaignYearToken(y);
      add(token);
      var m = String(token || '').match(/^CY(\d{2})$/);
      if (!m) return;
      var yyyy = String(2000 + parseInt(m[1], 10));
      add(yyyy);
      add('CY' + yyyy);
    });
    return out;
  }

  /* APP_STXSUB is started minus submitted. A negative source means submits exceeded starts. */
  function floorStartedNotSubmitted(raw) {
    if (raw == null || String(raw).trim() === '') {
      return { value: raw, floored: false, source: null };
    }
    var n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
    if (!isFinite(n)) return { value: raw, floored: false, source: null };
    if (n >= 0) return { value: raw, floored: false, source: n };
    return { value: 0, floored: true, source: n };
  }

  function campaignYearToken(value) {
    var s = trimStr(value).toUpperCase().replace(/\s+/g, '');
    var m = s.match(/^CY(\d{2})$/);
    if (m) return 'CY' + m[1];
    m = s.match(/^CY(\d{4})$/);
    if (m) {
      var yy4 = String(Number(m[1]) % 100);
      if (yy4.length === 1) yy4 = '0' + yy4;
      return 'CY' + yy4;
    }
    m = s.match(/^(20\d{2})$/);
    if (m) return 'CY' + m[1].slice(2);
    m = s.match(/^(\d{2})$/);
    if (m) return 'CY' + m[1];
    return '';
  }

  function yearsEquivalent(a, b) {
    var ta = campaignYearToken(a);
    var tb = campaignYearToken(b);
    if (ta && tb) return ta === tb;
    return sameText(a, b);
  }

  function yearTokenFromFileName(name) {
    var m = String(name || '').match(/(?:^|[^A-Z0-9])CY(\d{2})(?:[^0-9]|$)/i);
    return m ? 'CY' + m[1] : '';
  }

  function matchesSelectedYears(value, selected) {
    if (!selected || !selected.length) return true;
    var v = trimStr(value);
    if (!v) return false;
    var i;
    for (i = 0; i < selected.length; i++) {
      if (yearsEquivalent(v, selected[i])) return true;
    }
    return false;
  }

  function matchesSelectedCampaigns(value, selected) {
    if (!selected || !selected.length) return true;
    var have = canonicalCampaignCode(value);
    if (!have) return false;
    var i;
    for (i = 0; i < selected.length; i++) {
      var want = canonicalCampaignCode(selected[i]);
      if (want && have === want) return true;
      if (sameText(value, selected[i])) return true;
    }
    return false;
  }

  function matchesSelectedPartners(name, selected) {
    if (!selected || !selected.length) return true;
    var have = trimStr(name);
    if (!have) return false;
    var i;
    for (i = 0; i < selected.length; i++) {
      if (sameText(have, selected[i])) return true;
      if (partitionKeysOverlap(have, selected[i])) return true;
    }
    return false;
  }

  function rowsMatchingSinglePartner(rows, partner, scope, getters, omitAxis) {
    scope = scope || {};
    getters = getters || {};
    var getP = getters.partition || function (r) { return rowPartition(r); };
    var getC = getters.campaign || function (r) {
      return trimStr(r && (r.PROGRAM_SOLUTION != null ? r.PROGRAM_SOLUTION : r.CAMPAIGN));
    };
    var getY = getters.year || function (r) { return trimStr(r && r.CAMPAIGN_YEAR); };
    var campaigns = scope.campaigns || [];
    var years = scope.years || [];

    return (rows || []).filter(function (r) {
      if (!matchesSelectedPartners(getP(r), [partner])) return false;
      if (omitAxis !== 'campaigns' && campaigns.length && !matchesSelectedCampaigns(getC(r), campaigns)) return false;
      if (omitAxis !== 'years' && years.length && !matchesSelectedYears(getY(r), years)) return false;
      return true;
    });
  }

  function intersectLabelMaps(maps) {
    if (!maps || !maps.length) return {};
    var keys = Object.keys(maps[0]);
    var i;
    for (i = 1; i < maps.length; i++) {
      var next = maps[i];
      keys = keys.filter(function (k) { return next[k] != null; });
    }
    var out = {};
    keys.forEach(function (k) { out[k] = maps[0][k]; });
    return out;
  }

  function campaignLabelMapFromRows(rows, getC) {
    var map = {};
    (rows || []).forEach(function (r) {
      var raw = trimStr(getC(r));
      if (!raw) return;
      var key = canonicalCampaignCode(raw) || raw.toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = raw;
    });
    return map;
  }

  function yearLabelMapFromRows(rows, getY) {
    var map = {};
    (rows || []).forEach(function (r) {
      var raw = trimStr(getY(r));
      if (!raw) return;
      var key = campaignYearToken(raw) || raw.toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = raw;
    });
    return map;
  }

  /**
   * When two or more partners are selected, only values present for every partner.
   */
  function sharedScopeOptionsAcrossPartners(rows, scope, getters) {
    var partners = (scope && scope.partners) || [];
    if (partners.length < 2) return null;
    getters = getters || {};
    var getC = getters.campaign || function (r) {
      return trimStr(r && (r.PROGRAM_SOLUTION != null ? r.PROGRAM_SOLUTION : r.CAMPAIGN));
    };
    var getY = getters.year || function (r) { return trimStr(r && r.CAMPAIGN_YEAR); };

    var campaignMaps = partners.map(function (p) {
      return campaignLabelMapFromRows(
        rowsMatchingSinglePartner(rows, p, scope, getters, 'campaigns'),
        getC
      );
    });
    var yearMaps = partners.map(function (p) {
      return yearLabelMapFromRows(
        rowsMatchingSinglePartner(rows, p, scope, getters, 'years'),
        getY
      );
    });

    var cIntersect = intersectLabelMaps(campaignMaps);
    var yIntersect = intersectLabelMaps(yearMaps);

    return {
      campaigns: Object.keys(cIntersect).map(function (k) { return cIntersect[k]; }),
      years: Object.keys(yIntersect).map(function (k) { return yIntersect[k]; })
    };
  }

  /**
   * Bidirectional partner / campaign / year cascade for filter menus.
   * Each axis lists only values that appear with the other selected axes.
   * With 2+ partners, campaign/year menus use intersection across partners.
   */
  function cascadeFilterOptions(rows, scope, getters) {
    scope = scope || {};
    getters = getters || {};
    var getP = getters.partition || function (r) { return rowPartition(r); };
    var getC = getters.campaign || function (r) {
      return trimStr(r && (r.PROGRAM_SOLUTION != null ? r.PROGRAM_SOLUTION : r.CAMPAIGN));
    };
    var getY = getters.year || function (r) { return trimStr(r && r.CAMPAIGN_YEAR); };

    var partners = scope.partners || [];
    var campaigns = scope.campaigns || [];
    var years = scope.years || [];

    function partnerRows() {
      return (rows || []).filter(function (r) {
        if (campaigns.length && !matchesSelectedCampaigns(getC(r), campaigns)) return false;
        if (years.length && !matchesSelectedYears(getY(r), years)) return false;
        return true;
      });
    }
    function campaignRows() {
      return (rows || []).filter(function (r) {
        if (partners.length && !matchesSelectedPartners(getP(r), partners)) return false;
        if (years.length && !matchesSelectedYears(getY(r), years)) return false;
        return true;
      });
    }
    function yearRows() {
      return (rows || []).filter(function (r) {
        if (partners.length && !matchesSelectedPartners(getP(r), partners)) return false;
        if (campaigns.length && !matchesSelectedCampaigns(getC(r), campaigns)) return false;
        return true;
      });
    }

    var shared = sharedScopeOptionsAcrossPartners(rows, scope, getters);

    return {
      partnerRows: partnerRows(),
      campaignRows: campaignRows(),
      yearRows: yearRows(),
      multiPartnerScope: partners.length >= 2,
      sharedCampaignOptions: shared ? shared.campaigns : null,
      sharedYearOptions: shared ? shared.years : null
    };
  }

  function parseActivityDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = trimStr(v);
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function addCalendarDays(date, days) {
    if (!date || isNaN(date.getTime())) return null;
    var out = new Date(date.getTime());
    out.setDate(out.getDate() + days);
    return out;
  }

  function dashboardAvailabilityDate(firstActivity) {
    var start = parseActivityDate(firstActivity);
    if (!start) return null;
    return addCalendarDays(start, DASHBOARD_AVAILABILITY_OFFSET_DAYS);
  }

  function calendarDayTime(date) {
    var d = parseActivityDate(date);
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dashboardEnabledOn(availabilityDate, today) {
    var avail = calendarDayTime(availabilityDate);
    if (avail == null) return false;
    var now = calendarDayTime(today == null ? new Date() : today);
    if (now == null) return false;
    return avail <= now;
  }

  function rowPartition(row) {
    return trimStr(row && (row.PARTITION != null ? row.PARTITION : row.CLIENT));
  }

  function isIgnoredPartition(name) {
    var s = trimStr(name);
    if (!s) return false;
    return s.toLowerCase().indexOf(IGNORED_PARTITION_PREFIX.toLowerCase()) === 0;
  }

  function omitIgnoredPartitionRows(rows) {
    if (!rows || !rows.length) return rows || [];
    return rows.filter(function (r) { return !isIgnoredPartition(rowPartition(r)); });
  }

  function programRowIsActive(row) {
    var v = row && row.ACTIVE_FLAG;
    if (v == null || v === '') {
      var status = trimStr(row && row.PROGRAM_STATUS).toUpperCase();
      if (status.indexOf('DEVELOPMENT') >= 0 || status.indexOf('DEVELOP') >= 0) return false;
      if (status) return status.indexOf('ACTIVE') >= 0 && status.indexOf('INACTIVE') < 0;
      return false;
    }
    var s = String(v).trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'ACTIVE';
  }

  var PROGRAM_STATUS_FILTER_VALUES = ['active', 'inactive', 'development'];

  function defaultProgramStatusSelection() {
    return PROGRAM_STATUS_FILTER_VALUES.slice();
  }

  function isAllProgramStatusesSelected(statuses) {
    var sel = statuses || [];
    if (!sel.length) return false;
    return PROGRAM_STATUS_FILTER_VALUES.every(function (v) { return sel.indexOf(v) >= 0; });
  }

  /** Subset to apply in SQL/UI, or null when every lifecycle is included (incl. legacy empty). */
  function effectiveProgramStatusFilter(statuses) {
    var sel = statuses || [];
    if (!sel.length || isAllProgramStatusesSelected(sel)) return null;
    return sel.slice();
  }

  /** Active / inactive / development — matches Partner Data Health programLifecycle. */
  function programRowLifecycle(row) {
    var status = trimStr(row && row.PROGRAM_STATUS).toUpperCase();
    if (status.indexOf('DEVELOPMENT') >= 0 || status.indexOf('DEVELOP') >= 0) return 'development';
    if (status.indexOf('INACTIVE') >= 0) return 'inactive';
    if (programRowIsActive(row)) return 'active';
    if (status.indexOf('ACTIVE') >= 0) return 'inactive';
    return 'inactive';
  }

  function yearSortKeyForFilter(year) {
    var s = trimStr(year).toUpperCase();
    if (s === 'CY-ALL' || s === '—') return -1;
    var m = s.match(/^CY(\d{2})$/);
    if (m) return parseInt(m[1], 10);
    var n = parseInt(s, 10);
    return isFinite(n) ? n : 0;
  }

  function uniqueSortedFilterValues(values, sortFn) {
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

  /**
   * Partner / campaign / year filter menus from TOP_PROGRAMS_ACTIVITY_STATUS rows.
   * Respects program status (e.g. Active-only) and the same cascade as Partner Data Health.
   */
  function scopeFilterOptionsFromPrograms(programRows, scope, lifecycleFn) {
    lifecycleFn = lifecycleFn || programRowLifecycle;
    scope = scope || {};
    var base = omitIgnoredPartitionRows(programRows);
    var statusFilter = effectiveProgramStatusFilter(scope.statuses);
    if (statusFilter) {
      base = base.filter(function (r) { return statusFilter.indexOf(lifecycleFn(r)) >= 0; });
    }
    var getters = {
      partition: function (r) { return rowPartition(r); },
      campaign: function (r) {
        return trimStr(r && (r.PROGRAM_SOLUTION != null ? r.PROGRAM_SOLUTION : r.CAMPAIGN));
      },
      year: function (r) { return trimStr(r && r.CAMPAIGN_YEAR); }
    };
    var cascade = cascadeFilterOptions(base, {
      partners: scope.partners || [],
      campaigns: scope.campaigns || [],
      years: scope.years || []
    }, getters);

    var yearDesc = function (a, b) { return yearSortKeyForFilter(b) - yearSortKeyForFilter(a); };
    var partners = uniqueSortedFilterValues(cascade.partnerRows.map(getters.partition));
    var campaigns = cascade.sharedCampaignOptions
      ? uniqueSortedFilterValues(cascade.sharedCampaignOptions)
      : uniqueSortedFilterValues(cascade.campaignRows.map(getters.campaign));
    var years = cascade.sharedYearOptions
      ? uniqueSortedFilterValues(cascade.sharedYearOptions, yearDesc)
      : uniqueSortedFilterValues(cascade.yearRows.map(getters.year), yearDesc);

    return {
      partners: partners,
      campaigns: campaigns,
      years: years,
      multiPartnerScope: cascade.multiPartnerScope,
      sharedCampaignOptions: cascade.sharedCampaignOptions,
      sharedYearOptions: cascade.sharedYearOptions
    };
  }

  function partnerFilterOptionsFromPrograms(programRows, scope, lifecycleFn) {
    return scopeFilterOptionsFromPrograms(programRows, scope, lifecycleFn).partners;
  }

  function rowCampaignYear(row) {
    return trimStr(row && row.CAMPAIGN_YEAR);
  }

  function rowCampaignCode(row) {
    return canonicalCampaignCode(row && (row.PROGRAM_SOLUTION != null ? row.PROGRAM_SOLUTION : row.CAMPAIGN));
  }

  function findCrossCampaignAnchorFirstActivity(programRows, partition, year) {
    if (!programRows || !programRows.length || !trimStr(partition)) return null;
    var bestRaw = null;
    var bestTime = Infinity;
    programRows.forEach(function (r) {
      if (!matchesSelectedPartners(rowPartition(r), [partition])) return;
      if (year && !matchesSelectedYears(rowCampaignYear(r), [year])) return;
      if (rowCampaignCode(r) !== CROSS_CAMPAIGN_ANCHOR_CODE) return;
      var d = parseActivityDate(r.FIRST_ACTIVITY);
      if (!d) return;
      var t = d.getTime();
      if (t < bestTime) {
        bestTime = t;
        bestRaw = r.FIRST_ACTIVITY;
      }
    });
    return bestRaw;
  }

  function crossCampaignAvailabilityDate(programRows, partition, year) {
    var anchor = findCrossCampaignAnchorFirstActivity(programRows, partition, year);
    if (!anchor) return null;
    return dashboardAvailabilityDate(anchor);
  }

  function normalizeExceptionRow(row) {
    if (!row) return null;
    var partition = trimStr(row.PARTITION != null ? row.PARTITION : row.partition);
    var campaign = trimStr(row.PROGRAM_SOLUTION != null ? row.PROGRAM_SOLUTION : row.program_solution);
    var year = trimStr(row.CAMPAIGN_YEAR != null ? row.CAMPAIGN_YEAR : row.campaign_year);
    var dateRaw = row.AVAILABILITY_DATE != null ? row.AVAILABILITY_DATE : row.availability_date;
    var note = trimStr(row.NOTE != null ? row.NOTE : row.note);
    var date = parseActivityDate(dateRaw);
    if (!partition || !date) return null;
    var code = campaign ? canonicalCampaignCode(campaign) : '';
    return {
      partition: partition,
      campaign: code,
      year: year,
      date: date,
      note: note
    };
  }

  function findAvailabilityOverride(exceptions, partition, campaign, year) {
    if (!exceptions || !exceptions.length || !trimStr(partition)) return null;
    var wantYear = year ? campaignYearToken(year) || trimStr(year) : '';
    var wantCamp = campaign ? canonicalCampaignCode(campaign) : '';
    var best = null;
    var i;
    for (i = 0; i < exceptions.length; i++) {
      var ex = exceptions[i];
      if (!ex || !ex.date) continue;
      if (!matchesSelectedPartners(partition, [ex.partition])) continue;
      if (wantYear && ex.year && !matchesSelectedYears(year, [ex.year])) continue;
      if (wantCamp) {
        if (ex.campaign && ex.campaign !== wantCamp) continue;
      } else if (ex.campaign) {
        continue;
      }
      if (!best || ex.date.getTime() < best.date.getTime()) best = ex;
    }
    return best;
  }

  function effectiveCampaignAvailabilityDate(programRow, programRows, exceptions) {
    var partition = rowPartition(programRow);
    var campaign = rowCampaignCode(programRow);
    var year = rowCampaignYear(programRow);
    var override = findAvailabilityOverride(exceptions, partition, campaign, year);
    if (override && override.date) return override.date;
    return dashboardAvailabilityDate(programRow && programRow.FIRST_ACTIVITY);
  }

  function effectiveCrossCampaignAvailabilityDate(programRows, partition, year, exceptions) {
    var override = findAvailabilityOverride(exceptions, partition, '', year);
    if (override && override.date) return override.date;
    return crossCampaignAvailabilityDate(programRows, partition, year);
  }

  function formatAvailabilityDate(date) {
    if (!date || isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  var DOWNLOAD_DATE_FIELDS = ['EVENT_DATE', 'DOWNLOAD_DATE', 'DOWNLOAD_DT', 'DOWNLOADED_AT', 'LAST_DOWNLOAD'];
  var DOWNLOAD_PARTNER_FIELDS = ['CLIENT', 'PARTITION', 'PARTNER'];
  var DOWNLOAD_CAMPAIGN_FIELDS = ['CAMPAIGN', 'PROGRAM_SOLUTION', 'PROGRAM'];
  var DOWNLOAD_YEAR_FIELDS = ['CY', 'CAMPAIGN_YEAR', 'YEAR'];
  var DOWNLOAD_YEAR_ANY = '__ANY__';

  function rowField(row, key) {
    if (!row) return '';
    if (row[key] !== undefined && row[key] != null) return row[key];
    var upper = String(key).toUpperCase();
    for (var k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k) && String(k).toUpperCase() === upper) return row[k];
    }
    return '';
  }

  function firstRowField(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = trimStr(rowField(row, keys[i]));
      if (v) return v;
    }
    return '';
  }

  function downloadEventDateRaw(row) {
    return firstRowField(row, DOWNLOAD_DATE_FIELDS);
  }

  /** Canonical VW_PARTNER_DOWNLOADS_KMK shape for PDH + Program Meta joins. */
  function normalizeDownloadRow(row) {
    if (!row || typeof row !== 'object') return row;
    var dateRaw = downloadEventDateRaw(row);
    if (dateRaw && !trimStr(rowField(row, 'EVENT_DATE'))) row.EVENT_DATE = dateRaw;
    var client = firstRowField(row, DOWNLOAD_PARTNER_FIELDS);
    if (client && !trimStr(rowField(row, 'CLIENT'))) row.CLIENT = client;
    if (!trimStr(rowField(row, 'PARTITION')) && client) row.PARTITION = client;
    var camp = firstRowField(row, DOWNLOAD_CAMPAIGN_FIELDS);
    if (camp && !trimStr(rowField(row, 'CAMPAIGN'))) row.CAMPAIGN = camp;
    if (camp && !trimStr(rowField(row, 'PROGRAM_SOLUTION'))) row.PROGRAM_SOLUTION = camp;
    var yearTok = campaignYearToken(firstRowField(row, DOWNLOAD_YEAR_FIELDS)) ||
      yearTokenFromFileName(firstRowField(row, ['FILE_NAME', 'SOURCE_FILE_NAME', 'FILE_PATH']));
    if (yearTok) {
      if (!campaignYearToken(rowField(row, 'CY'))) row.CY = yearTok;
      if (!trimStr(rowField(row, 'CAMPAIGN_YEAR'))) row.CAMPAIGN_YEAR = yearTok;
    }
    row._download = true;
    return row;
  }

  function isDownloadEventRow(row) {
    if (!row) return false;
    if (row._download) return true;
    if (!parseActivityDate(downloadEventDateRaw(row))) return false;
    return !!(
      firstRowField(row, DOWNLOAD_CAMPAIGN_FIELDS) ||
      firstRowField(row, ['FILE_NAME', 'FILE_PATH']) ||
      firstRowField(row, DOWNLOAD_PARTNER_FIELDS)
    );
  }

  function partnerLabelsFromDownloadRow(row) {
    var seen = {};
    var out = [];
    DOWNLOAD_PARTNER_FIELDS.forEach(function (f) {
      var v = trimStr(rowField(row, f));
      if (!v) return;
      var c = compactJoinKey(v);
      if (!c || seen[c]) return;
      seen[c] = true;
      out.push(v);
    });
    return out;
  }

  function downloadJoinKey(partner, campaign, year) {
    return [
      compactJoinKey(partner) || trimStr(partner).toUpperCase(),
      canonicalCampaignCode(campaign) || trimStr(campaign).toUpperCase(),
      campaignYearToken(year) || trimStr(year).toUpperCase()
    ].join('|');
  }

  function mergeDownloadDate(map, key, date) {
    if (!key || !date) return;
    var prev = map[key];
    if (!prev || date > prev) map[key] = date;
  }

  function mergeDownloadDateMaps() {
    var out = {};
    for (var a = 0; a < arguments.length; a++) {
      var map = arguments[a];
      if (!map) continue;
      Object.keys(map).forEach(function (key) {
        mergeDownloadDate(out, key, map[key]);
      });
    }
    return out;
  }

  function summarizeDownloadEvents(rows, parseDateFn) {
    var parse = parseDateFn || parseActivityDate;
    var dateMap = {};
    (rows || []).forEach(function (row) {
      normalizeDownloadRow(row);
      var date = parse(downloadEventDateRaw(row) || rowField(row, 'LAST_DOWNLOAD'));
      if (!date) return;
      var campaign = firstRowField(row, DOWNLOAD_CAMPAIGN_FIELDS);
      if (!campaign) return;
      var camp = canonicalCampaignCode(campaign) || trimStr(campaign).toUpperCase();
      var year = campaignYearToken(firstRowField(row, DOWNLOAD_YEAR_FIELDS)) ||
        yearTokenFromFileName(firstRowField(row, ['FILE_NAME', 'SOURCE_FILE_NAME']));
      var partners = partnerLabelsFromDownloadRow(row);
      if (!partners.length) return;
      partners.forEach(function (partner) {
        var pCompact = compactJoinKey(partner) || trimStr(partner).toUpperCase();
        if (year) {
          mergeDownloadDate(dateMap, downloadJoinKey(partner, campaign, year), date);
          mergeDownloadDate(dateMap, pCompact + '|' + camp + '|' + year, date);
        }
        mergeDownloadDate(dateMap, pCompact + '|' + camp + '|' + DOWNLOAD_YEAR_ANY, date);
      });
    });
    return dateMap;
  }

  function lookupLastDownload(entry, dateMap) {
    if (!dateMap || !entry) return null;
    var partition = entry.partition != null ? entry.partition : entry.PARTITION;
    var solution = entry.solution != null ? entry.solution : entry.PROGRAM_SOLUTION;
    var year = entry.year != null ? entry.year : entry.CAMPAIGN_YEAR;
    var camp = canonicalCampaignCode(solution) || trimStr(solution).toUpperCase();
    var yearTok = campaignYearToken(year);
    var pCompact = compactJoinKey(partition);
    var best = null;
    function consider(key) {
      var d = dateMap[key];
      if (d && (!best || d > best)) best = d;
    }
    if (yearTok) {
      consider(downloadJoinKey(partition, solution, year));
      consider(pCompact + '|' + camp + '|' + yearTok);
    } else {
      consider(pCompact + '|' + camp + '|' + DOWNLOAD_YEAR_ANY);
    }
    Object.keys(dateMap).forEach(function (key) {
      var parts = key.split('|');
      if (parts.length !== 3 || parts[1] !== camp) return;
      var yPart = parts[2];
      if (yearTok) {
        if (yPart === DOWNLOAD_YEAR_ANY) return;
        if (yPart !== yearTok && !yearsEquivalent(yPart, year)) return;
      }
      if (parts[0] === pCompact || partitionKeysOverlap(partition, parts[0])) {
        consider(key);
      }
    });
    return best;
  }

  /** Map hub partner tokens onto labels present in a chapter filter menu. */
  function pickKnownPartners(selected, available) {
    if (!selected || !selected.length) return [];
    var out = [];
    var seen = {};
    selected.forEach(function (p) {
      var pick = '';
      var i;
      for (i = 0; i < (available || []).length; i++) {
        var a = available[i];
        if (sameText(a, p) || partitionKeysOverlap(a, p)) {
          pick = a;
          break;
        }
      }
      var use = pick || trimStr(p);
      if (!use) return;
      var key = use.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(use);
    });
    return out;
  }

  global.OpsJoin = {
    CAMPAIGN_CODE_ORDER: CAMPAIGN_CODE_ORDER,
    DASHBOARD_AVAILABILITY_OFFSET_DAYS: DASHBOARD_AVAILABILITY_OFFSET_DAYS,
    CROSS_CAMPAIGN_ANCHOR_CODE: CROSS_CAMPAIGN_ANCHOR_CODE,
    IGNORED_PARTITION_PREFIX: IGNORED_PARTITION_PREFIX,
    isIgnoredPartition: isIgnoredPartition,
    omitIgnoredPartitionRows: omitIgnoredPartitionRows,
    parseActivityDate: parseActivityDate,
    dashboardAvailabilityDate: dashboardAvailabilityDate,
    dashboardEnabledOn: dashboardEnabledOn,
    findCrossCampaignAnchorFirstActivity: findCrossCampaignAnchorFirstActivity,
    crossCampaignAvailabilityDate: crossCampaignAvailabilityDate,
    normalizeExceptionRow: normalizeExceptionRow,
    findAvailabilityOverride: findAvailabilityOverride,
    effectiveCampaignAvailabilityDate: effectiveCampaignAvailabilityDate,
    effectiveCrossCampaignAvailabilityDate: effectiveCrossCampaignAvailabilityDate,
    formatAvailabilityDate: formatAvailabilityDate,
    trimStr: trimStr,
    sameText: sameText,
    compactJoinKey: compactJoinKey,
    compactToken: compactToken,
    partitionKeysOverlap: partitionKeysOverlap,
    partnerAliasId: partnerAliasId,
    PARTNER_ALIAS_GROUPS: PARTNER_ALIAS_GROUPS,
    canonicalCampaignCode: canonicalCampaignCode,
    campaignQueryValues: campaignQueryValues,
    campaignCycleAnchorYear: campaignCycleAnchorYear,
    entryYearFromCampaignYear: entryYearFromCampaignYear,
    campaignYearStartCalendar: campaignYearStartCalendar,
    cycleDayIndex: cycleDayIndex,
    pointInTimeIncludes: pointInTimeIncludes,
    pointInTimeCutoffDate: pointInTimeCutoffDate,
    placeMembershipOnCycle: placeMembershipOnCycle,
    campaignYearToken: campaignYearToken,
    yearMatchValues: yearMatchValues,
    floorStartedNotSubmitted: floorStartedNotSubmitted,
    yearsEquivalent: yearsEquivalent,
    yearTokenFromFileName: yearTokenFromFileName,
    matchesSelectedYears: matchesSelectedYears,
    matchesSelectedCampaigns: matchesSelectedCampaigns,
    matchesSelectedPartners: matchesSelectedPartners,
    cascadeFilterOptions: cascadeFilterOptions,
    sharedScopeOptionsAcrossPartners: sharedScopeOptionsAcrossPartners,
    pickKnownPartners: pickKnownPartners,
    programRowIsActive: programRowIsActive,
    programRowLifecycle: programRowLifecycle,
    PROGRAM_STATUS_FILTER_VALUES: PROGRAM_STATUS_FILTER_VALUES,
    defaultProgramStatusSelection: defaultProgramStatusSelection,
    isAllProgramStatusesSelected: isAllProgramStatusesSelected,
    effectiveProgramStatusFilter: effectiveProgramStatusFilter,
    scopeFilterOptionsFromPrograms: scopeFilterOptionsFromPrograms,
    partnerFilterOptionsFromPrograms: partnerFilterOptionsFromPrograms,
    rowPartition: rowPartition,
    rowCampaignCode: rowCampaignCode,
    rowCampaignYear: rowCampaignYear,
    NO_SHARED_CAMPAIGNS_LABEL: 'No shared campaigns',
    NO_SHARED_YEARS_LABEL: 'No shared campaign years',
    DOWNLOAD_DATE_FIELDS: DOWNLOAD_DATE_FIELDS,
    DOWNLOAD_PARTNER_FIELDS: DOWNLOAD_PARTNER_FIELDS,
    DOWNLOAD_CAMPAIGN_FIELDS: DOWNLOAD_CAMPAIGN_FIELDS,
    DOWNLOAD_YEAR_FIELDS: DOWNLOAD_YEAR_FIELDS,
    rowField: rowField,
    firstRowField: firstRowField,
    downloadEventDateRaw: downloadEventDateRaw,
    normalizeDownloadRow: normalizeDownloadRow,
    isDownloadEventRow: isDownloadEventRow,
    partnerLabelsFromDownloadRow: partnerLabelsFromDownloadRow,
    downloadJoinKey: downloadJoinKey,
    mergeDownloadDate: mergeDownloadDate,
    mergeDownloadDateMaps: mergeDownloadDateMaps,
    summarizeDownloadEvents: summarizeDownloadEvents,
    lookupLastDownload: lookupLastDownload
  };
})(window);
