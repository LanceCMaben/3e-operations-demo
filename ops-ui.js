/**
 * Shared loading / status chrome for 3E Operations chapters.
 */
(function (global) {
  'use strict';

  var DOTS =
    '<span class="loading-dots loading-dots--inline" aria-hidden="true">' +
    '<span></span><span></span><span></span></span>';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setStatusEl(el, msg, kind) {
    if (!el) return;
    var loading = kind === 'loading';
    el.classList.toggle('is-error', !loading && kind === 'error');
    el.classList.toggle('is-loading', loading);
    if (loading) {
      var label = msg || 'Loading';
      el.innerHTML = '<span class="visually-hidden">' + escapeHtml(label) + '</span>' + DOTS;
      return;
    }
    el.classList.remove('is-loading');
    el.textContent = msg || '';
  }

  function setPanelEmpty(el, msg, kind) {
    if (!el) return;
    if (kind === 'loading') {
      el.hidden = false;
      el.classList.remove('is-error');
      el.classList.add('is-loading');
      el.innerHTML =
        '<span class="visually-hidden">' + escapeHtml(msg || 'Loading') + '</span>' + DOTS;
      return;
    }
    el.classList.remove('is-loading');
    el.classList.toggle('is-error', kind === 'error');
    el.textContent = msg || '';
  }

  function gridLoadingHtml(label) {
    return (
      '<div class="ftf-grid-empty ftf-grid-loading">' +
      '<span class="visually-hidden">' + escapeHtml(label || 'Loading') + '</span>' +
      DOTS +
      '</div>'
    );
  }

  function domoErrorStatus(err) {
    if (!err || typeof err !== 'object') return 0;
    var status = err.status || err.statusCode || 0;
    return Number(status) || 0;
  }

  function domoErrorText(err) {
    if (!err) return '';
    if (typeof err === 'string') return err;
    var parts = [err.message, err.statusReason, err.statusText, err.responseText, err.body, err.error, err.response];
    return parts.filter(function (part) {
      return part != null && (typeof part === 'string' || typeof part === 'number');
    }).map(function (part) { return String(part); }).join(' ').replace(/\s+/g, ' ').trim();
  }

  /** Alias is not on this card. Safe to try the mapped dataset id once. */
  function isMissingAliasError(err) {
    var text = domoErrorText(err).toLowerCase();
    if (!text) return false;
    return /not mapped|unknown alias|invalid alias|no such alias|cannot find dataset|could not find dataset|dataset[^.]{0,48}not found|alias[^.]{0,48}not found/.test(text);
  }

  /**
   * Domo returns this when a card switch races the dataset grant, and also when
   * code queries a dataset UUID the viewer cannot open directly.
   */
  function isDatasetAccessError(err) {
    if (isMissingAliasError(err)) return false;
    var status = domoErrorStatus(err);
    if (status === 401 || status === 403) return true;
    var text = domoErrorText(err).toLowerCase();
    return /do not have access|does not have access|don't have access|cannot access|can't access|cannot see|can't see|not authorized|not authorised|permission denied|unable to (view|see|access)|no access to/.test(text);
  }

  /** Fast failures worth repeating on the same alias. Timeouts stay out so a 25s cap is not tripled. */
  function isTransientDomoError(err) {
    if (!err || isMissingAliasError(err)) return false;
    var text = domoErrorText(err).toLowerCase();
    if (/timed out|timeout/.test(text)) return false;
    if (isDatasetAccessError(err)) return true;
    var status = domoErrorStatus(err);
    if (status === 408 || status === 429 || status >= 500) return true;
    if (/temporarily unavailable|try again|too many requests|bad gateway|gateway timeout|failed to fetch|network error|econnreset/.test(text)) return true;
    if (status === 400 && !/syntax|unknown column|invalid column|parse error/.test(text)) return true;
    return false;
  }

  function isRetryableDatasetError(err) {
    return isTransientDomoError(err) || isDatasetAccessError(err);
  }

  function isQueryError(err) {
    return /syntax|unknown column|invalid column|parse error/.test(domoErrorText(err).toLowerCase());
  }

  function shouldFallbackToDatasetId(err) {
    if (!err || isDatasetAccessError(err) || isQueryError(err)) return false;
    if (/timed out|timeout/i.test(domoErrorText(err))) return false;
    if (isMissingAliasError(err)) return true;
    return domoErrorStatus(err) === 400;
  }

  /** A dataset-id retry that the viewer cannot open should not replace the alias error. */
  function errorAfterDatasetIdFallback(aliasErr, idErr) {
    if (isDatasetAccessError(idErr)) return aliasErr || idErr;
    return idErr || aliasErr;
  }

  function retryDomoCall(fn, attempts) {
    var max = attempts || 3;
    function run(i) {
      return Promise.resolve().then(fn).catch(function (err) {
        if (i + 1 >= max || !isTransientDomoError(err)) return Promise.reject(err);
        var delay = 400 * Math.pow(2, i);
        return new Promise(function (resolve) { setTimeout(resolve, delay); }).then(function () {
          return run(i + 1);
        });
      });
    }
    return run(0);
  }

  /**
   * Card switches fire several dataset calls at once. Domo then answers the
   * alias with a short-lived access error. Retry that alias. Do not follow it
   * with the raw dataset id — that id checks the viewer, not the card, and is
   * what surfaces "you cannot see this dataset".
   */
  function installDomoDataRetry() {
    var sdk = typeof domo !== 'undefined' ? domo : null;
    if (!sdk || typeof sdk.get !== 'function' || sdk.__opsRetryInstalled) return;
    var origGet = sdk.get.bind(sdk);
    var origPost = sdk.post.bind(sdk);
    function guarded(orig, args) {
      var url = args[0];
      if (typeof url !== 'string' || (url.indexOf('/data/') !== 0 && url.indexOf('/sql/') !== 0)) {
        return orig.apply(null, args);
      }
      return retryDomoCall(function () { return orig.apply(null, args); });
    }
    sdk.get = function () { return guarded(origGet, arguments); };
    sdk.post = function () { return guarded(origPost, arguments); };
    sdk.__opsRetryInstalled = true;
  }

  installDomoDataRetry();

  global.OpsUi = {
    loadingDotsHtml: function () { return DOTS; },
    setStatusEl: setStatusEl,
    setPanelEmpty: setPanelEmpty,
    gridLoadingHtml: gridLoadingHtml,
    domoErrorStatus: domoErrorStatus,
    domoErrorText: domoErrorText,
    isMissingAliasError: isMissingAliasError,
    isDatasetAccessError: isDatasetAccessError,
    isTransientDomoError: isTransientDomoError,
    isRetryableDatasetError: isRetryableDatasetError,
    shouldFallbackToDatasetId: shouldFallbackToDatasetId,
    errorAfterDatasetIdFallback: errorAfterDatasetIdFallback,
    retryDomoCall: retryDomoCall,
    installDomoDataRetry: installDomoDataRetry
  };
})(typeof window !== 'undefined' ? window : this);
