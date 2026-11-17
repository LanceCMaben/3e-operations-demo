(function () {
  'use strict';
  window.__PAGES_DEMO__ = true;

  function sqlRows(url, sql) {
    return window.DemoSqlEngine ? DemoSqlEngine.runForUrl(url, sql) : [];
  }

  window.domo = {
    post: function (url, sql) {
      return Promise.resolve(sqlRows(url, sql));
    },
  get: function (url) {
      var m = String(url).match(/\/data\/v1\/([^?]+)/i);
      var alias = m ? decodeURIComponent(m[1]).toLowerCase() : '';
      var limitM = url.match(/limit=(\d+)/i);
      var limit = limitM ? limitM[1] : '500';
      var rows = sqlRows('/sql/v1/' + alias, 'SELECT * FROM ' + alias + ' LIMIT ' + limit);
      return Promise.resolve(rows);
    },
    onFiltersUpdate: function () {}
  };

  (function patchXhr() {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__demoUrl = url;
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var url = this.__demoUrl || '';
      if (/\/sql\/v1\//i.test(url) && typeof body === 'string') {
        var rows = sqlRows(url, body);
        var self = this;
        setTimeout(function () {
          Object.defineProperty(self, 'status', { value: 200 });
          Object.defineProperty(self, 'responseText', { value: JSON.stringify(rows) });
          Object.defineProperty(self, 'readyState', { value: 4 });
          if (typeof self.onload === 'function') self.onload();
        }, 5);
        return;
      }
      return send.apply(this, arguments);
    };
  })();
})();