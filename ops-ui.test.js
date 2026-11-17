'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { window: {}, console: console, Promise: Promise, setTimeout: setTimeout };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, 'ops-ui.js'), 'utf8'),
  sandbox
);
var Ui = sandbox.window.OpsUi;
var failed = 0;

function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error('FAIL: ' + message);
  }
}

var access = { status: 403, message: 'Forbidden', responseText: 'You do not have access to this dataset' };
var missing = { status: 400, message: 'Bad Request', responseText: 'dataset alias is not mapped' };
var badRequest = { status: 400, message: 'Bad Request' };
var timeout = new Error('pageViews Data API timed out after 90000ms');
var syntax = { status: 400, message: 'Unknown column PROGRAM_SOLUTION' };

assert(Ui.isDatasetAccessError(access), '403 with access text is an access error');
assert(!Ui.isDatasetAccessError(missing), 'unmapped alias is not an access error');
assert(!Ui.shouldFallbackToDatasetId(access), 'access errors stay on the alias');
assert(!Ui.shouldFallbackToDatasetId(timeout), 'timeouts stay on the alias');
assert(Ui.shouldFallbackToDatasetId(missing), 'unmapped alias may try the dataset id');
assert(Ui.shouldFallbackToDatasetId(badRequest), 'plain 400 may try the dataset id');
assert(!Ui.shouldFallbackToDatasetId(syntax), 'query errors stay on the alias');
assert(Ui.isTransientDomoError(access), 'access errors are retried');
assert(Ui.isTransientDomoError(badRequest), 'plain 400 is retried');
assert(!Ui.isTransientDomoError(timeout), 'timeouts are not retried inside the same request');
assert(!Ui.isTransientDomoError(syntax), 'unknown-column errors are not retried');

var surfaced = Ui.errorAfterDatasetIdFallback(badRequest, access);
assert(surfaced === badRequest, 'dataset-id access error does not replace the alias error');
assert(Ui.errorAfterDatasetIdFallback(missing, syntax) === syntax, 'a real dataset-id failure is kept');

var calls = 0;
Ui.retryDomoCall(function () {
  calls += 1;
  if (calls < 3) return Promise.reject(access);
  return Promise.resolve('rows');
}, 3).then(function (value) {
  assert(value === 'rows', 'retry returns the later success');
  assert(calls === 3, 'access error is tried three times');
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('ops-ui dataset retry checks passed');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
