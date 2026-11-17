/**
 * Shared multi-select filter popout chrome (pinned search + clear, scrollable options list).
 */
(function (global) {
  'use strict';

  /**
   * @param {HTMLElement} menuEl
   * @param {{ placeholder?: string, searchValue?: string, searchAriaLabel?: string,
   *           selectedCount?: number, clearLabel?: string, onSearchInput?: function, onClear?: function }} cfg
   * @returns {{ head: HTMLElement, optionsEl: HTMLElement, searchInput: HTMLInputElement,
   *             clearBtn: HTMLButtonElement, setSelectedCount: function(number): void }}
   */
  var SEARCH_UI_MIN = 9;

  function mountPinnedHead(menuEl, cfg) {
    cfg = cfg || {};
    if (!menuEl) {
      return {
        head: null,
        optionsEl: null,
        searchInput: null,
        clearBtn: null,
        setSelectedCount: function () {}
      };
    }
    menuEl.innerHTML = '';
    var optionCount = cfg.optionCount != null ? cfg.optionCount : 0;
    var compact = cfg.compact != null ? !!cfg.compact : optionCount > 0 && optionCount < SEARCH_UI_MIN;
    if (compact) menuEl.classList.add('multi-select-menu--compact');
    else menuEl.classList.remove('multi-select-menu--compact');

    var clearBtn = null;
    var searchInput = null;
    var head = null;

    function wireClearButton(btn) {
      var selectedCount = cfg.selectedCount || 0;
      btn.disabled = !selectedCount;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof cfg.onClear === 'function') cfg.onClear();
      });
      return btn;
    }

    if (!compact) {
      head = document.createElement('div');
      head.className = 'multi-select-menu-head';

      var searchWrap = document.createElement('div');
      searchWrap.className = 'multi-select-search';

      searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'multi-select-search-input';
      searchInput.placeholder = cfg.placeholder || 'Search…';
      searchInput.value = cfg.searchValue || '';
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('aria-label', cfg.searchAriaLabel || 'Search options');
      searchInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
      searchInput.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') ev.preventDefault();
      });
      if (typeof cfg.onSearchInput === 'function') {
        searchInput.addEventListener('input', cfg.onSearchInput);
      }
      searchWrap.appendChild(searchInput);

      var actions = document.createElement('div');
      actions.className = 'multi-select-actions';
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'multi-select-clear-section';
      clearBtn.textContent = cfg.clearLabel || 'Clear section';
      wireClearButton(clearBtn);
      actions.appendChild(clearBtn);
      searchWrap.appendChild(actions);
      head.appendChild(searchWrap);
      menuEl.appendChild(head);
    } else {
      var compactHead = document.createElement('div');
      compactHead.className = 'multi-select-menu-head multi-select-menu-head--compact';
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'multi-select-clear-section';
      clearBtn.textContent = cfg.clearLabel || 'Clear section';
      wireClearButton(clearBtn);
      compactHead.appendChild(clearBtn);
      menuEl.appendChild(compactHead);
      head = compactHead;
    }

    var optionsEl = document.createElement('div');
    optionsEl.className = 'multi-select-options';
    menuEl.appendChild(optionsEl);

    return {
      head: head,
      optionsEl: optionsEl,
      searchInput: searchInput,
      clearBtn: clearBtn,
      setSelectedCount: function (n) {
        if (clearBtn) clearBtn.disabled = !n;
      }
    };
  }

  global.OpsFilterMenu = {
    mountPinnedHead: mountPinnedHead
  };
})(typeof window !== 'undefined' ? window : global);
