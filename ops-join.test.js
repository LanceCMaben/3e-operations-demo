'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { window: {}, console: console };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, 'ops-join.js'), 'utf8'),
  sandbox
);
var Join = sandbox.window.OpsJoin;
var failed = 0;

function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error('FAIL: ' + message);
  }
}

assert(Join.partitionKeysOverlap('Humboldt', 'Cal Poly Humboldt'), 'Humboldt alias group matches');
assert(Join.partitionKeysOverlap('humboldt', 'calpolyhumboldt'), 'alias match ignores case and spaces');
assert(!Join.partitionKeysOverlap('boston', 'bostoncollege'), 'prefix alone is not a partner match');
assert(Join.partitionKeysOverlap('Marist', 'marist'), 'exact compact keys still match');

var oct2 = new Date(2026, 9, 2);
var march15 = new Date(2027, 2, 15);
assert(Join.pointInTimeIncludes(new Date(2026, 8, 1), 'CY26', oct2), 'September is inside an October point in time');
assert(!Join.pointInTimeIncludes(new Date(2026, 10, 1), 'CY26', oct2), 'November is outside an October point in time');
assert(Join.pointInTimeIncludes(new Date(2026, 10, 1), 'CY26', march15), 'November stays inside a March point in time');
assert(Join.pointInTimeIncludes(new Date(2026, 0, 15), 'CY26', oct2), 'January membership is already in an October point in time');
assert(Join.pointInTimeIncludes(new Date(2025, 2, 1), 'CY26', oct2), 'prior-year membership stays in the point in time');

var cycleStart = new Date(2026, 7, 1);
var placed = Join.placeMembershipOnCycle([
  { date: new Date(2025, 0, 15), count: 1302927 },
  { date: new Date(2026, 8, 1), count: 205745 }
], cycleStart, 364);
assert(placed.total === 1508672, 'chart total keeps the partnership balance');
assert(placed.data[0] === 1302927, 'balance sits on the first cycle day');
assert(placed.data[placed.data.length - 1] === 1508672, 'line ends on the load-table total');
var cutoff = Join.pointInTimeCutoffDate('CY25', oct2);
assert(cutoff.getFullYear() === 2025 && cutoff.getMonth() === 9 && cutoff.getDate() === 2, 'CY25 cutoff is 2 Oct 2025');

var june1 = new Date(2026, 5, 1);
var avail = Join.dashboardAvailabilityDate(june1);
assert(avail && avail.getFullYear() === 2026 && avail.getMonth() === 5 && avail.getDate() === 15, 'availability is 14 days after first activity');
assert(Join.dashboardEnabledOn(avail, new Date(2026, 5, 15)), 'enabled on the availability day');
assert(!Join.dashboardEnabledOn(avail, new Date(2026, 5, 14)), 'not enabled the day before availability');
assert(!Join.dashboardEnabledOn(null, new Date(2026, 5, 15)), 'missing first activity is not enabled');

var aliases = Join.campaignQueryValues(['CNVA']);
assert(aliases.indexOf('CNVA') >= 0 && aliases.indexOf('Conversion Apply') >= 0, 'CNVA query values include Conversion Apply');

var june = new Date(2026, 5, 1);
var july = new Date(2026, 6, 1);
var map = {};
Join.mergeDownloadDate(map, Join.downloadJoinKey('Marist', 'CNVA', 'CY26'), june);
Join.mergeDownloadDate(map, 'marist|CNVA|__ANY__', july);
var yearHit = Join.lookupLastDownload({ partition: 'Marist', solution: 'Conversion Apply', year: '2026' }, map);
var anyHit = Join.lookupLastDownload({ partition: 'Marist', solution: 'CNVA', year: '' }, map);
assert(yearHit && yearHit.getTime() === june.getTime(), 'a known year does not use a later download from another year');
assert(anyHit && anyHit.getTime() === july.getTime(), 'a missing year uses the newest download');

assert(Join.entryYearFromCampaignYear('CY26') === 2027, 'CY26 is entry year 2027');
assert(Join.entryYearFromCampaignYear('CY25') === 2026, 'CY25 is entry year 2026');
assert(Join.campaignYearStartCalendar('CY26') === 2026, 'CY26 cycle starts Aug 1 2026');
assert(Join.entryYearFromCampaignYear('cy 24') === 2025, 'CY24 is entry year 2025');

var yearValues = Join.yearMatchValues(['CY26']);
assert(yearValues.indexOf('CY26') >= 0 && yearValues.indexOf('2026') >= 0 && yearValues.indexOf('CY2026') >= 0, 'CY26 matches 2026 and CY2026');

var kept = Join.floorStartedNotSubmitted(12);
var floored = Join.floorStartedNotSubmitted(-1039);
var blank = Join.floorStartedNotSubmitted('');
assert(kept.value === 12 && !kept.floored, 'a positive started-not-submitted count stays');
assert(floored.value === 0 && floored.floored && floored.source === -1039, 'a negative started-not-submitted count floors at zero');
assert(blank.value === '' && !blank.floored, 'a blank started-not-submitted count stays blank');

if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('ops-join checks ok');
