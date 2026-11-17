/**
 * How we build 3E dashboards — 3E Insights Documentation for the team.
 * Keep in sync with Wiki/how-we-build.js for shared tabs.
 * Dashboard Process Overview tab is shared with Wiki/how-we-build.js — keep both in sync.
 */
(function (global) {
  'use strict';

  var TOOLS = [
    {
      id: 'cursor',
      name: 'Cursor',
      blurb: 'The workshop. Describe the outcome; it edits the dashboard files with you.',
      body: 'Cursor is an editor with a teammate built in. You open the GitHub repo, point it at a dashboard folder, and describe the outcome. It can rewrite help text, add a tab that already has a pattern in the app, trace why a panel looks empty, and keep the practice and live name tags from getting mixed up.',
      can: [
        'Change labels, footers, filters, and tabs from a written request.',
        'Walk the 3E process so Dev and live cards stay separate.',
        'Explain what a file is doing while you have it open.'
      ],
      not: [
        'It does not replace Domo. The live card still lives in Domo after we send it.',
        'Opening the page as a file on disk is not a real test.',
        'It cannot see a portal page unless you describe what you see.'
      ]
    },
    {
      id: 'github',
      name: 'GitHub',
      blurb: 'The team filing cabinet and the history of every change.',
      body: 'Two houses hold all of the dashboard folders: one for partner-facing cards, one for internal cards. GitHub is how we share work, see who changed what, and avoid “it only works on my laptop.”',
      can: [
        'Keep the official copy of each dashboard folder.',
        'Show a short history when a number suddenly looks different.',
        'Let a teammate review a change before it goes live.'
      ],
      not: [
        'Partners do not open GitHub. They open the Insights Portal.',
        'An old leftover clone on a laptop can still overwrite a live card if someone sends from it — we only send from these two repos.'
      ]
    },
    {
      id: 'domo',
      name: 'Domo',
      blurb: 'The engine room: app code, data tables, and the two designs (practice and live).',
      body: 'Domo holds the dashboard after we send it, plus the datasets the card reads. Each dashboard has two designs on purpose: a practice design and a live design. Sending to one does not update the other unless we send both.',
      can: [
        'Run the interactive card people click through.',
        'Attach data tables by a short nickname (an alias). A missing nickname looks like an empty panel.',
        'Update every portal card that uses that design when we send a new version.'
      ],
      not: [
        'Domo is not the portal login screen. People sign into the Insights Portal; ClearSquare places the card on a page.',
        'We do not build these apps by dragging Analyzer cards anymore — the folder in GitHub is the source.'
      ]
    },
    {
      id: 'ryuu',
      name: 'The send step (Ryuu)',
      blurb: 'The “mail this folder to Domo” command. One folder at a time.',
      body: 'Ryuu is the small tool that uploads a dashboard folder into Domo. The important habit is location: we stand inside that dashboard’s folder, bump the version on the name tag, then send. Sending from the whole repo can upload the wrong files.',
      can: [
        'Update the practice card or the live card, depending on which name tag we send.',
        'Create a brand-new practice design the first time a new dashboard is sent without an id.'
      ],
      not: [
        'The send step is the same each time; standing in the right folder is what matters.',
        'Never strip the live id off the live name tag. That would create a second live design by accident.'
      ]
    },
    {
      id: 'portal',
      name: '3E Insights Portal',
      blurb: 'Sign-in, page access, ClearSquare placement, and PARTITION filters.',
      body: 'The portal is what people open — not Domo directly. Internal pages are for 3E; client pages are for partners. Portal admin assigns users and groups to pages. ClearSquare embeds a Domo design on each page. A page filter (almost always PARTITION) scopes data. Empty cards here are often wrong filter column, missing group access, or a practice design on the wrong page — not always a code bug.',
      can: [
        'Show the card after publish and a hard refresh (Chrome or Edge).',
        'Scope viewers with PARTITION on the page.',
        'Separate Development practice pages from live partner pages.',
        'Wire groups to the pages each role should see at launch.'
      ],
      not: [
        'Publishing Domo code does not add pages or permissions by itself.',
        'Domo login ≠ Insights Portal access.',
        'Safari, Firefox, and Brave often break the iframe — use Chrome or Edge.'
      ]
    }
  ];

  var SEARCH_BLOB = [
    'cursor github  domo ryuu portal clearsquare how we build dashboards publish',
    'practice card live card  dev prod partition chrome hard refresh',
    'portal admin users groups permissions launch availability dashboard fourteen days cnva partition who gets what'
  ].join(' ').toLowerCase();

  var SEARCH_INDEX = [];

  function pushSearch(item) {
    item.blob = String(item.blob || '').toLowerCase();
    SEARCH_INDEX.push(item);
  }

  var LAYOUT_STEPS = [
    {
      id: 'idea',
      n: '1',
      tool: 'cursor',
      kicker: 'The ask',
      title: 'Start with a prompt',
      short: 'Describe the outcome in Cursor.',
      tip: 'You describe what people should see — which card, which filter, what “done” looks like — then open the right repo folder in Cursor. No Domo drag-and-drop at this stage.',
      body: 'Every dashboard begins as a question: fix a blank panel, add a filter, rebuild an Analyzer page, or ship something new. You do not start in Domo drag-and-drop — you describe what people should see and open the right GitHub folder in Cursor.',
      beats: [
        'Name the portal page or legacy card if one exists.',
        'Say what “done” looks like in one checkable sentence.',
        'Pick client vs internal repo before editing.'
      ],
      visual: 'prompt'
    },
    {
      id: 'folder',
      n: '2',
      tool: 'cursor',
      kicker: 'One mini-app',
      title: 'One dashboard folder',
      short: 'HTML, JS, CSS, two manifests.',
      tip: 'One folder = one portal card. Dev and Prod manifests are separate design ids — publish from inside this folder only.',
      body: 'Each pro-code dashboard is a folder: layout, styling, behavior, and two name tags (Dev + Prod) that tell Domo which design to update. Stay in that folder so Outreach Expert never accidentally absorbs Program Meta changes.',
      beats: [
        '<code>manifest.dev.json</code> → practice card · <code>manifest.json</code> → live card.',
        'First Dev send with no id creates the practice design; never strip the Prod id.',
        'New product → new folder, not a mash-up of old exports.'
      ],
      visual: 'folder'
    },
    {
      id: 'domo-setup',
      n: '3',
      tool: 'domo',
      kicker: 'Engine room',
      title: 'Pro-code app in Domo + dataset maps',
      short: 'Design exists; aliases wire data in.',
      tip: 'Domo stores datasets and hosts the pro-code design. Each alias on the card must match what the app queries — or panels stay empty.',
      body: 'Domo hosts the running app after Ryuu publish. Before panels work, each dataset is mapped on the card with a short alias (<code>programs</code>, <code>leads</code>, …). Missing alias → empty table or 400 in the network tab. Data lives in Domo first; the app only reads it.',
      beats: [
        'Create or link a Custom App (pro-code) design in Domo Asset Library.',
        'Map every alias listed in the folder README / manifest.',
        'Portal page filters use <code>PARTITION</code>, not <code>CLIENT</code>.'
      ],
      visual: 'domo'
    },
    {
      id: 'build',
      n: '4',
      tool: 'cursor',
      kicker: 'Iteration',
      title: 'Prompt → edit → commit in Cursor',
      short: 'Repeat until the practice card matches.',
      tip: 'Cursor applies your prompts to the folder; you review diffs, commit with a why-not-what message, publish Dev, and check the portal until it matches.',
      body: 'You steer with prompts: labels, tabs, charts, filters, help text. Cursor edits the folder; you review the diff. Small commits with a why-not-what message keep GitHub readable and make live sends reversible.',
      beats: [
        'Bump <code>version</code> in the manifest you are about to publish.',
        'Match existing patterns in that folder (same filter bar, same chapter style).',
        'Ask Cursor to explain empty panels — often a missing alias or wrong column.'
      ],
      visual: 'build'
    },
    {
      id: 'dev',
      n: '5',
      tool: 'ryuu',
      kicker: 'Practice',
      title: 'Publish Dev · test in the portal',
      short: 'Ryuu from the dashboard folder only.',
      tip: 'Ryuu uploads the folder to the practice Domo design. Test on a Development portal page — not by opening files on your laptop.',
      body: 'From inside the folder: <code>npx ryuu -m manifest.dev.json publish</code>. Open the card on a Development page (internal or client), hard-refresh, and click through filters. Laptop file preview ≠ real Domo runtime.',
      beats: [
        'Development → internal for Operations, Wiki, Client Enrollment Report, …',
        'Development → client for Conversion Apply, Deposit, Awareness, …',
        'Chrome or Edge — other browsers often block the iframe.'
      ],
      visual: 'dev'
    },
    {
      id: 'github',
      n: '6',
      tool: 'github',
      kicker: 'Team copy',
      title: 'Push to GitHub',
      short: 'Official history before live.',
      tip: 'GitHub is the team’s source of truth. Branch, review, merge to main — Prod publish should match what’s on main.',
      body: 'Commit and push so the change is not trapped on one machine. Teammates review; you can diff last week if a metric moves. Prod publish should match what is on <code>main</code>.',
      beats: [
        'Branch names can include the dashboard short name.',
        'Merge to main before Prod publish.',
        'Never send live from a random Downloads export or repo root.'
      ],
      visual: 'github'
    },
    {
      id: 'prod',
      n: '7',
      tool: 'ryuu',
      kicker: 'Live',
      title: 'Publish Prod from main',
      short: 'Updates every page on that design.',
      tip: 'Prod Ryuu from main updates every portal page on that live design id. Fix on Dev first — partners see Prod.',
      body: 'After Dev looks good: <code>npx ryuu -m manifest.json publish</code> from the same folder on main. Every ClearSquare page using that design updates. Fix mistakes on Dev first — do not experiment on partner pages.',
      beats: [
        'Commit manifest version bumps with Prod sends.',
        'Hard-refresh live portal pages after publish.',
        'One design id per live card — do not swap Dev and Prod ids.'
      ],
      visual: 'prod'
    },
    {
      id: 'portal',
      n: '8',
      tool: 'portal',
      kicker: 'Front door',
      title: 'Portal page · filters · users',
      short: 'Where people actually open it.',
      tip: 'Portal admin + ClearSquare + PARTITION on the page decide who opens which card and whose data they see.',
      body: 'ClearSquare places the Prod (or Dev) design on a page. Portal admin assigns groups. Page filters scope institutions. A fleshed-out dashboard is code + data + page setup — not publish alone.',
      beats: [
        'Client pages: partner groups + PARTITION on the page.',
        'Internal pages: 3E staff; still respect PARTITION when scoping.',
        'Launch checklist: availability dates, permissions, and which design is on which page.'
      ],
      visual: 'portal'
    },
    {
      id: 'anatomy',
      n: '★',
      tool: 'domo',
      kicker: 'Inside any live card',
      title: 'How a running dashboard is shaped',
      short: 'Data down, viewers up.',
      tip: 'At runtime: mapped Domo tables → pro-code app (SQL/Data API) → rendered UI in the portal iframe. Read-only — no writes back to Domo.',
      body: 'Domo datasets feed the app through SQL / Data API. Simple cards are one script; hub-style apps add a shell (nav, shared filters) and optional chapter files that call <code>init(host)</code>. Nothing writes back to Domo — it reads mapped tables.',
      beats: [
        'Single-page dashboards: one <code>app.js</code> queries aliases directly.',
        'Hub dashboards: shell + embedded chapters sharing scope (example: 3E Operations).',
        'Reconciliation / QA panels still only read — they compare sources, not push.'
      ],
      visual: 'anatomy'
    }
  ];

  (function indexStepsTools() {
    var i;
    for (i = 0; i < LAYOUT_STEPS.length; i++) {
      var ls = LAYOUT_STEPS[i];
      pushSearch({
        kind: 'layout',
        kicker: 'Process step',
        title: (ls.n === '★' ? '★ ' : ls.n + '. ') + ls.title,
        summary: ls.short,
        target: 'hwb-ops-arch',
        layout: i,
        blob: [ls.title, ls.short, ls.kicker, ls.body, ls.beats.join(' '), ls.tip || ''].join(' ')
      });
    }
    for (i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      pushSearch({
        kind: 'tool',
        kicker: 'Tool',
        title: t.name,
        summary: t.blurb,
        target: 'hwb-tools',
        tool: t.id,
        blob: [t.name, t.blurb, t.body, t.can.join(' '), t.not.join(' ')].join(' ')
      });
    }
  })();

  var DEFAULT_TAB = 'portal';

  var TABS = [
    { id: 'portal', label: 'Portal & Launch', sections: ['hwb-portal-launch'] },
    { id: 'opsHub', label: 'Dashboard Process Overview', sections: ['hwb-ops-arch'] },
    { id: 'tools', label: 'The Tools', sections: ['hwb-tools'] },
    { id: 'copies', label: 'Practice vs Live', sections: ['hwb-copies'] },
    { id: 'rules', label: 'The Few Rules', sections: ['hwb-rules'] }
  ];

  var state = {
    layoutModal: null,
    tool: 'cursor',
    tab: DEFAULT_TAB,
    searchQ: '',
    searchOpen: false,
    searchActive: 0,
    sectionIndexReady: false
  };

  function tabForSection(sectionId) {
    var id = String(sectionId || '').replace(/^#/, '');
    var i;
    for (i = 0; i < TABS.length; i++) {
      if (TABS[i].id === id) return TABS[i].id;
    }
    for (i = 0; i < TABS.length; i++) {
      if (TABS[i].sections.indexOf(id) >= 0) return TABS[i].id;
    }
    return '';
  }

  function applyTabChrome(root) {
    if (!root) return;
    var host = root.classList && root.classList.contains('hwb') ? root : root.querySelector('.hwb');
    if (!host) return;
    var i;
    var s;
    for (i = 0; i < TABS.length; i++) {
      var tab = TABS[i];
      var on = tab.id === state.tab;
      var btn = host.querySelector('[data-hwb-tab="' + tab.id + '"]');
      if (btn) {
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      for (s = 0; s < tab.sections.length; s++) {
        var panel = host.querySelector('#' + tab.sections[s]);
        if (panel) {
          panel.hidden = !on;
          panel.setAttribute('aria-hidden', on ? 'false' : 'true');
        }
      }
    }
  }

  function showTab(root, tabId) {
    var next = tabForSection(tabId) || DEFAULT_TAB;
    state.tab = next;
    applyTabChrome(root);
  }

  function renderTabNav() {
    var html = '<nav class="hwb-jump" role="tablist" aria-label="Documentation sections">';
    for (var i = 0; i < TABS.length; i++) {
      var tab = TABS[i];
      var on = state.tab === tab.id;
      html +=
        '<button type="button" class="hwb-jump-btn' + (on ? ' is-active' : '') +
          '" role="tab" aria-selected="' + (on ? 'true' : 'false') +
          '" data-hwb-tab="' + esc(tab.id) + '">' + esc(tab.label) + '</button>';
    }
    return html + '</nav>';
  }

  function sectionHiddenAttr(id) {
    return tabForSection(id) === state.tab ? '' : ' hidden';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var LAYOUT_FLOW_LABELS = [
    'Prompt', 'Folder', 'Domo', 'Cursor', 'Dev', 'GitHub', 'Prod', 'Portal', 'Runtime'
  ];

  function layoutModalIndex() {
    if (state.layoutModal == null || state.layoutModal === '') return -1;
    var i = Number(state.layoutModal);
    if (i < 0) i = 0;
    if (i >= LAYOUT_STEPS.length) i = LAYOUT_STEPS.length - 1;
    return i;
  }

  function renderLayoutMegaConnector(kind) {
    var back = kind === 'back';
    var vertical = kind === 'v';
    var cls = 'hwb-layout-mega-conn hwb-layout-mega-conn--' + (vertical ? 'v' : 'h') + (back ? ' hwb-layout-mega-conn--back' : '');
    var head = vertical ? 'v' : 'h';
    return (
      '<span class="' + cls + '" aria-hidden="true">' +
        '<span class="hwb-layout-mega-conn-shaft"></span>' +
        '<span class="hwb-layout-mega-conn-head hwb-layout-mega-conn-head--' + head + '"></span>' +
        (vertical ? '<span class="hwb-layout-mega-conn-label">then</span>' : '') +
      '</span>'
    );
  }

  function renderFlowCell(slot, inner) {
    return '<div class="hwb-layout-mega-cell hwb-flow-' + slot + '">' + inner + '</div>';
  }

  function renderLayoutContextRail(activeIdx) {
    var html = '<div class="hwb-layout-context-rail" aria-hidden="true">';
    var i;
    for (i = 0; i < LAYOUT_STEPS.length; i++) {
      if (i > 0) html += '<span class="hwb-layout-context-rail-line"></span>';
      html += '<span class="hwb-layout-context-dot' + (i === activeIdx ? ' is-active' : '') + '">' + esc(LAYOUT_STEPS[i].n) + '</span>';
    }
    return html + '</div>';
  }

  function renderLayoutMegaNode(i) {
    var st = LAYOUT_STEPS[i];
    var label = LAYOUT_FLOW_LABELS[i] || st.title;
    var open = i === layoutModalIndex();
    var tipText = st.tip || st.short;
    return (
      '<button type="button" class="hwb-layout-mega-node hwb-layout-mega-node--' + esc(st.tool || 'cursor') +
        ' hwb-layout-mega-node--' + esc(st.visual || 'step') +
        (open ? ' is-open' : '') + '"' +
        ' data-hwb-layout-open="' + i + '"' +
        ' style="--hwb-step:' + i + '"' +
        ' aria-describedby="hwb-layout-tip-' + i + '">' +
        '<span class="hwb-layout-mega-num">' + esc(st.n) + '</span>' +
        '<span class="hwb-layout-mega-label">' + esc(label) + '</span>' +
        '<span class="hwb-layout-mega-sub">' + esc(st.kicker) + '</span>' +
        '<span class="hwb-layout-mega-tip" id="hwb-layout-tip-' + i + '" role="tooltip">' +
          '<strong>' + esc(st.short) + '</strong><span>' + esc(tipText) + '</span>' +
        '</span>' +
        '<span class="hwb-layout-mega-cta">Open deep dive</span>' +
      '</button>'
    );
  }

  function renderVpathNode(i) {
    var st = LAYOUT_STEPS[i];
    var open = i === layoutModalIndex();
    var tipText = st.tip || st.short;
    return (
      '<button type="button" class="hwb-vpath-node hwb-vpath-node--' + esc(st.tool || 'cursor') +
        (open ? ' is-open' : '') + '" data-hwb-layout-open="' + i + '">' +
        '<span class="hwb-vpath-num">' + esc(st.n) + '</span>' +
        '<span class="hwb-vpath-copy">' +
          '<span class="hwb-vpath-kicker">' + esc(st.kicker) + '</span>' +
          '<span class="hwb-vpath-label">' + esc(st.title) + '</span>' +
          '<span class="hwb-vpath-short">' + esc(st.short) + '</span>' +
          '<span class="hwb-vpath-tip">' + esc(tipText) + '</span>' +
        '</span>' +
      '</button>'
    );
  }

  function renderLayoutMegaChart() {
    var html =
      '<div class="hwb-vpath-wrap" role="group" aria-label="Full path from prompt to portal">' +
        '<ol class="hwb-vpath">';
    var i;
    for (i = 0; i < LAYOUT_STEPS.length; i++) {
      html += '<li class="hwb-vpath-item">' + renderVpathNode(i) + '</li>';
    }
    html += '</ol></div>';
    return html;
  }

  function renderLayoutModal() {
    var idx = layoutModalIndex();
    if (idx < 0) return '';
    var st = LAYOUT_STEPS[idx];
    var beats = '';
    var b;
    for (b = 0; b < st.beats.length; b++) {
      beats += '<li>' + st.beats[b] + '</li>';
    }
    var toolBtn = '';
    if (st.tool) {
      toolBtn =
        '<button type="button" class="hwb-nav-btn hwb-layout-modal-tool" data-hwb-layout-tool="' + esc(st.tool) + '">' +
          'Open in The Tools tab</button>';
    }
    return (
      '<div class="hwb-layout-modal" role="dialog" aria-modal="true" aria-labelledby="hwb-layout-modal-title">' +
        '<button type="button" class="hwb-layout-modal-backdrop" data-hwb-layout-close="1" aria-label="Close dialog"></button>' +
        '<div class="hwb-layout-modal-panel hwb-layout-modal-panel--rich hwb-layout-modal-panel--' + esc(st.tool || 'cursor') + '">' +
          '<button type="button" class="hwb-layout-modal-x" data-hwb-layout-close="1" aria-label="Close">×</button>' +
          '<header class="hwb-layout-modal-head">' +
            '<span class="hwb-layout-modal-step" aria-hidden="true">' + esc(st.n) + '</span>' +
            '<div>' +
              '<p class="hwb-layout-modal-kicker">Step ' + esc(st.n) + ' · ' + esc(st.kicker) + '</p>' +
              '<h4 id="hwb-layout-modal-title">' + esc(st.title) + '</h4>' +
            '</div>' +
          '</header>' +
          renderLayoutContextRail(idx) +
          '<div class="hwb-layout-modal-split">' +
            '<div class="hwb-layout-modal-copy">' +
              '<p class="hwb-layout-modal-lead">' + esc(st.short) + '</p>' +
              '<p class="hwb-layout-modal-body">' + st.body + '</p>' +
              '<ul class="hwb-layout-modal-beats">' + beats + '</ul>' +
            '</div>' +
            '<div class="hwb-layout-modal-viz">' +
              '<p class="hwb-layout-modal-chart-label">Inside this step</p>' +
              '<div class="hwb-layout-modal-chart-inner hwb-layout-modal-chart-inner--rich">' +
                renderLayoutVisual(st.visual, true) +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="hwb-layout-modal-actions">' + toolBtn + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderLayoutVisual(kind, rich) {
    var richClass = rich ? ' hwb-layout-diagram--rich' : '';
    if (kind === 'prompt') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--prompt' + richClass + '">' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--idea"><span class="hwb-layout-dnode-tag">Teammate ask</span>Blank panel · new tab · clearer copy</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>articulate</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--cursor"><span class="hwb-layout-dnode-tag">Cursor chat</span>Repo + dashboard folder + acceptance criteria</div>' +
          (rich ? '<div class="hwb-layout-drow hwb-layout-drow--mini">' +
            '<span class="hwb-layout-dchip">internal vs client repo</span>' +
            '<span class="hwb-layout-dchip">portal page name</span></div>' : '') +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>build</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--goal"><span class="hwb-layout-dnode-tag">Done when</span>Dev card matches the ask in the portal</div>' +
        '</div>'
      );
    }
    if (kind === 'folder') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--folder' + richClass + '">' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--cursor wide"><span class="hwb-layout-dnode-tag">Repo</span>eee_internal_insights · eee_client_insights</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>one folder</span></div>' +
          '<div class="hwb-layout-dstack">' +
            '<div class="hwb-layout-dfile"><code>index.html</code><span>shell</span></div>' +
            '<div class="hwb-layout-dfile"><code>app.js</code><span>data + UI</span></div>' +
            (rich ? '<div class="hwb-layout-dfile"><code>styles.css</code><span>brand</span></div>' : '') +
            '<div class="hwb-layout-dfile"><code>manifest.dev.json</code><span>practice design id</span></div>' +
            '<div class="hwb-layout-dfile hwb-layout-dfile--live"><code>manifest.json</code><span>live design id</span></div>' +
          '</div>' +
          '<div class="hwb-layout-daside">Publish only from inside this folder — never from repo root</div>' +
        '</div>'
      );
    }
    if (kind === 'domo') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--domo' + richClass + '">' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--domo wide"><span class="hwb-layout-dnode-tag">Domo datasets</span>Tables refreshed on Domo schedule · source of truth</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>map aliases</span></div>' +
          '<div class="hwb-layout-drow">' +
            '<div class="hwb-layout-dcol">' +
              '<div class="hwb-layout-dpill">programs</div><div class="hwb-layout-dpill">leads</div>' +
              '<div class="hwb-layout-dpill">partnerFiles</div>' +
              (rich ? '<div class="hwb-layout-dpill">…</div>' : '') +
            '</div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--domo">' +
              '<span class="hwb-layout-dnode-tag">Asset Library</span>Custom App design · Dev + Prod ids' +
            '</div>' +
          '</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>runtime</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--app wide"><span class="hwb-layout-dnode-tag">In the app</span><code>domo.get(alias)</code> · SQL · empty if alias missing</div>' +
        '</div>'
      );
    }
    if (kind === 'build') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--loop' + richClass + '">' +
          '<div class="hwb-layout-dloop hwb-layout-dloop--rich">' +
            '<div class="hwb-layout-dloop-seg hwb-layout-dloop-seg--1">Prompt</div>' +
            '<div class="hwb-layout-dloop-seg hwb-layout-dloop-seg--2">Review diff</div>' +
            '<div class="hwb-layout-dloop-seg hwb-layout-dloop-seg--3">Commit</div>' +
            '<div class="hwb-layout-dloop-seg hwb-layout-dloop-seg--4">Bump version</div>' +
            '<div class="hwb-layout-dloop-seg hwb-layout-dloop-seg--5">Ryuu Dev</div>' +
            '<div class="hwb-layout-dloop-seg hwb-layout-dloop-seg--6">Portal QA</div>' +
            '<span class="hwb-layout-dloop-back" aria-hidden="true">↻ until practice matches</span>' +
          '</div>' +
          (rich ? '<p class="hwb-layout-dloop-caption">Small loops beat one giant change before anyone sees Dev.</p>' : '') +
        '</div>'
      );
    }
    if (kind === 'dev') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--publish hwb-layout-diagram--dev' + richClass + '">' +
          '<div class="hwb-layout-drow">' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--ryuu"><span class="hwb-layout-dnode-tag">Terminal</span><code>npx ryuu -m manifest.dev.json publish</code></div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--domo"><span class="hwb-layout-dnode-tag">Domo</span>Practice Custom App design</div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--portal"><span class="hwb-layout-dnode-tag">Portal</span>Development page · hard refresh</div>' +
          '</div>' +
          (rich ? '<div class="hwb-layout-drow hwb-layout-drow--mini">' +
            '<span class="hwb-layout-dchip">Chrome / Edge</span>' +
            '<span class="hwb-layout-dchip">Ctrl+Shift+R</span></div>' : '') +
        '</div>'
      );
    }
    if (kind === 'prod') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--publish hwb-layout-diagram--prod' + richClass + '">' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--github wide"><span class="hwb-layout-dnode-tag">Git</span>Checkout <code>main</code> — Prod tracks merged code</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>live send</span></div>' +
          '<div class="hwb-layout-drow">' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--ryuu"><span class="hwb-layout-dnode-tag">Terminal</span><code>npx ryuu -m manifest.json publish</code></div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--domo"><span class="hwb-layout-dnode-tag">Domo</span>Live design id</div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--portal"><span class="hwb-layout-dnode-tag">Impact</span>All ClearSquare pages on that design</div>' +
          '</div>' +
        '</div>'
      );
    }
    if (kind === 'github') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--github' + richClass + '">' +
          '<div class="hwb-layout-drow">' +
            '<div class="hwb-layout-dnode"><span class="hwb-layout-dnode-tag">Branch</span>Feature edits in dashboard folder</div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--github"><span class="hwb-layout-dnode-tag">PR</span>Review · CI · merge</div>' +
            '<div class="hwb-layout-darrow hwb-layout-darrow--right"></div>' +
            '<div class="hwb-layout-dnode hwb-layout-dnode--goal"><span class="hwb-layout-dnode-tag">main</span>Source of truth for Prod</div>' +
          '</div>' +
          '<div class="hwb-layout-drepos">' +
            '<span>eee_internal_insights</span><span>eee_client_insights</span>' +
          '</div>' +
          (rich ? '<p class="hwb-layout-dloop-caption">Commit manifest bumps with Prod sends so history matches live.</p>' : '') +
        '</div>'
      );
    }
    if (kind === 'portal') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--portal' + richClass + '">' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--portal wide"><span class="hwb-layout-dnode-tag">Portal admin</span>Groups · availability · who can open which page</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>layout</span></div>' +
          '<div class="hwb-layout-dnode wide"><span class="hwb-layout-dnode-tag">ClearSquare</span>Embed Dev or Prod design on the page</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>scope</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--filter wide">Page filter · <code>PARTITION</code> (not CLIENT)</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>open</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--people wide">Viewer sees card in iframe · data scoped to partition</div>' +
        '</div>'
      );
    }
    if (kind === 'anatomy') {
      return (
        '<div class="hwb-layout-diagram hwb-layout-diagram--anatomy' + richClass + '">' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--domo wide">Domo datasets · mapped aliases · scheduled refresh</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>SQL / Data API</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--app wide">Pro-code runtime · filters · charts · optional chapter shell</div>' +
          '<div class="hwb-layout-darrow hwb-layout-darrow--down"><span>DOM</span></div>' +
          '<div class="hwb-layout-dnode hwb-layout-dnode--portal wide">Insights Portal iframe · read-only · no writes to Domo</div>' +
          (rich ? '<div class="hwb-layout-drow hwb-layout-drow--mini">' +
            '<span class="hwb-layout-dchip">single-page app</span>' +
            '<span class="hwb-layout-dchip">hub + chapters</span></div>' : '') +
        '</div>'
      );
    }
    return '';
  }

  function renderDashboardLayout() {
    return (
      '<div class="hwb-layout hwb-layout--mega" aria-label="Dashboard process overview — idea to portal">' +
        '<p class="hwb-layout-lead">Nine steps, top to bottom. Hover a step for the short version. Click it for the checklist.</p>' +
        renderLayoutMegaChart() +
        renderLayoutModal() +
        '<p class="hwb-arch-legend">' +
          '<span class="hwb-arch-legend-item">★ Runtime = how any live card reads Domo data</span>' +
        '</p>' +
        renderOpsChapters() +
      '</div>'
    );
  }

  function renderTools() {
    var html = '<div class="hwb-tools">';
    for (var i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      html +=
        '<button type="button" class="hwb-tool' + (state.tool === t.id ? ' is-active' : '') +
          '" data-hwb-tool="' + esc(t.id) + '" aria-pressed="' + (state.tool === t.id ? 'true' : 'false') + '">' +
          '<span class="hwb-tool-head">' +
            '<strong>' + esc(t.name) + '</strong>' +
            '<span class="hwb-tool-go">Open</span>' +
          '</span>' +
          '<span class="hwb-tool-blurb">' + esc(t.blurb) + '</span>' +
        '</button>';
    }
    return html + '</div>' + renderToolDetail();
  }

  function renderToolDetail() {
    var t = TOOLS[0];
    for (var i = 0; i < TOOLS.length; i++) {
      if (TOOLS[i].id === state.tool) t = TOOLS[i];
    }
    var can = '';
    var not = '';
    for (var c = 0; c < t.can.length; c++) can += '<li>' + esc(t.can[c]) + '</li>';
    for (var n = 0; n < t.not.length; n++) not += '<li>' + esc(t.not[n]) + '</li>';
    return (
      '<div class="hwb-tool-detail" id="hwb-tool-detail">' +
        '<h4>' + esc(t.name) + '</h4>' +
        '<p>' + esc(t.body) + '</p>' +
        '<div class="hwb-split">' +
          '<div class="hwb-can"><h5>What It Is Good For</h5><ul>' + can + '</ul></div>' +
          '<div class="hwb-can"><h5>What It Is Not</h5><ul>' + not + '</ul></div>' +
        '</div>' +
      '</div>'
    );
  }

  function searchTokens(q) {
    return String(q || '').toLowerCase().replace(/^\s+|\s+$/g, '').split(/\s+/).filter(Boolean);
  }

  function haystack(item) {
    return (item.title + ' ' + item.summary + ' ' + item.kicker + ' ' + item.blob).toLowerCase();
  }

  function queryIndex(q) {
    var tokens = searchTokens(q);
    if (!tokens.length) return [];
    var needle = tokens.join(' ');
    var hits = [];
    for (var i = 0; i < SEARCH_INDEX.length; i++) {
      var item = SEARCH_INDEX[i];
      var text = haystack(item);
      var ok = true;
      var t;
      for (t = 0; t < tokens.length; t++) {
        if (text.indexOf(tokens[t]) === -1) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      var title = item.title.toLowerCase();
      var score = 0;
      if (title === needle) score += 200;
      if (title.indexOf(needle) === 0) score += 80;
      if (title.indexOf(needle) !== -1) score += 40;
      for (t = 0; t < tokens.length; t++) {
        if (title.indexOf(tokens[t]) !== -1) score += 14;
        else score += 2;
      }
      hits.push({ item: item, score: score });
    }
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.length - b.item.title.length;
    });
    var out = [];
    for (var h = 0; h < hits.length && out.length < 8; h++) out.push(hits[h].item);
    return out;
  }

  function renderSearchPanel(root) {
    if (!root) return;
    var panel = root.querySelector('#hwb-search-results');
    var input = root.querySelector('#hwb-page-search');
    var clear = root.querySelector('[data-hwb-search-clear]');
    var q = state.searchQ;
    var trimmed = String(q || '').replace(/^\s+|\s+$/g, '');
    if (clear) clear.hidden = !trimmed;
    if (!panel) return;
    var hits = state.searchOpen ? queryIndex(q) : [];
    if (!state.searchOpen || !searchTokens(q).length) {
      panel.hidden = true;
      panel.innerHTML = '';
      if (input) input.setAttribute('aria-expanded', 'false');
      return;
    }
    if (state.searchActive < 0) state.searchActive = 0;
    if (hits.length && state.searchActive >= hits.length) state.searchActive = hits.length - 1;
    var html = '';
    if (!hits.length) {
      html = '<p class="hwb-search-empty">Nothing on this page matches “' + esc(trimmed) + '”.</p>';
    } else {
      for (var i = 0; i < hits.length; i++) {
        var item = hits[i];
        html +=
          '<button type="button" class="hwb-search-hit' + (i === state.searchActive ? ' is-active' : '') +
            '" id="hwb-search-opt-' + i + '" role="option" aria-selected="' + (i === state.searchActive ? 'true' : 'false') + '"' +
            ' data-hwb-go-kind="' + esc(item.kind) + '"' +
            ' data-hwb-go-target="' + esc(item.target) + '"' +
            (item.kind === 'layout' ? ' data-hwb-go-id="' + item.layout + '"' : '') +
            (item.kind === 'tool' ? ' data-hwb-go-id="' + esc(item.tool) + '"' : '') +
            '>' +
            '<span class="hwb-search-kicker">' + esc(item.kicker) + '</span>' +
            '<span class="hwb-search-title">' + esc(item.title) + '</span>' +
            '<span class="hwb-search-summary">' + esc(item.summary) + '</span>' +
          '</button>';
      }
    }
    panel.innerHTML = html;
    panel.hidden = false;
    if (input) {
      input.setAttribute('aria-expanded', 'true');
      var activeId = hits.length ? 'hwb-search-opt-' + state.searchActive : '';
      if (activeId) input.setAttribute('aria-activedescendant', activeId);
      else input.removeAttribute('aria-activedescendant');
    }
  }

  function flashNode(node) {
    if (!node) return;
    if (node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('hwb-flash');
    setTimeout(function () {
      node.classList.remove('hwb-flash');
    }, 1600);
  }

  function goToHit(root, hit) {
    if (!root || !hit) return;
    state.searchOpen = false;
    renderSearchPanel(root);
    if (hit.target) showTab(root, hit.target);
    if (hit.kind === 'layout') {
      state.layoutModal = Number(hit.layout);
      if (state.layoutModal < 0) state.layoutModal = 0;
      if (state.layoutModal >= LAYOUT_STEPS.length) state.layoutModal = LAYOUT_STEPS.length - 1;
      showTab(root, 'opsHub');
      refresh(root, 'layout');
    } else if (hit.kind === 'tool') {
      state.tool = hit.tool || 'cursor';
      showTab(root, 'tools');
      refresh(root, 'tools');
    }
    window.setTimeout(function () {
      var node = null;
      if (hit.kind === 'tool') node = root.querySelector('#hwb-tool-detail');
      else if (hit.kind === 'layout') node = root.querySelector('.hwb-layout-modal-panel');
      else if (hit.target) node = root.querySelector('#' + hit.target) || document.getElementById(hit.target);
      flashNode(node || (hit.target ? document.getElementById(hit.target) : null));
    }, 30);
  }

  function hitFromEl(el) {
    if (!el) return null;
    var kind = el.getAttribute('data-hwb-go-kind') || 'section';
    var target = el.getAttribute('data-hwb-go-target') || '';
    var id = el.getAttribute('data-hwb-go-id');
    if (kind === 'layout') return { kind: kind, target: target, layout: Number(id) || 0 };
    if (kind === 'tool') return { kind: kind, target: target, tool: id };
    return { kind: 'section', target: target };
  }

  function renderOpsChapters() {
    var items = [
      {
        title: 'Overview scope',
        body: 'Set Partner, Campaign, Year, and Program Status on Overview, Partner Data Health, or Campaign Upload QA, then Apply. Print Batches, Campaign Timelines, and Campaign Load History inherit that scope, including Program Status. Program Meta inherits partner, campaign, and year only. Its Status filter is the activity PROGRAM_STATUS matched on program ID. Insights Activity ignores Overview scope. Reset clears partner, campaign, and year and sets Program Status to All statuses.'
      },
      {
        title: 'Partner Data Health',
        body: 'Program activity, partner source files, downloads, daily membership load, and campaign totals. Uses Overview scope.'
      },
      {
        title: 'Print Batches',
        body: 'On-demand and batch print jobs, available versus sent by client. Inherits Overview scope.'
      },
      {
        title: 'Campaign Upload QA',
        body: 'Upload freshness by partner, with a campaign roster and client detail. Shares the Overview scope filter bar.'
      },
      {
        title: 'Campaign Timelines',
        body: 'First and last activity by partner and campaign year. Gold markers are dashboard availability, 14 calendar days after first activity. Inherits Overview scope.'
      },
      {
        title: 'Campaign Load History',
        body: 'Membership load over time and a point-in-time comparison across campaign years. Inherits Overview scope.'
      },
      {
        title: 'Program Meta',
        body: 'Status is PROGRAM_STATUS from program activity, matched on program ID. Cards also show returns, MAP, dashboards (first activity + 14 days), market revision, print ready, email skew, last download, and CY26 data quality (red Pending when blank; notes when present). Inherits Overview partner, campaign, and year. Status, Returns, MAP, Dashboards, and Last download filters stay on this chapter.'
      },
      {
        title: 'Insights Activity',
        body: 'Portal page views, viewers, and estimated time on the page. Overview scope does not filter this log. Use this chapter’s audience, date range, partition, and dashboard filters.'
      },
      {
        title: 'Documentation',
        body: 'This guide. It does not query datasets. The boxes on this tab explain the Operations chapters. The other tabs explain how 3E builds and publishes dashboards.'
      }
    ];
    var out = '<div class="hwb-chapter-board">' +
      '<h4 class="hwb-chapter-board-title">Chapters on this card</h4>' +
      '<p class="hwb-note">Hover a box for what that chapter covers and whether it uses Overview scope.</p>' +
      '<div class="hwb-chapter-grid">';
    for (var i = 0; i < items.length; i++) {
      out += '<div class="hwb-chapter-box" tabindex="0">' +
        '<strong>' + esc(items[i].title) + '</strong>' +
        '<span class="hwb-chapter-box-tip" role="tooltip">' + esc(items[i].body) + '</span>' +
      '</div>';
    }
    return out + '</div></div>';
  }

  function plainText(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function tabLabelForTarget(target) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].sections.indexOf(target) >= 0) return TABS[i].label;
    }
    return 'Guide';
  }

  function indexFromDom(root) {
    if (state.sectionIndexReady || !root) return;
    state.sectionIndexReady = true;
    var sections = root.querySelectorAll('section.hwb-section');
    var s;
    var n;
    for (s = 0; s < sections.length; s++) {
      var section = sections[s];
      var nodes = section.querySelectorAll('h3, h4, strong, .hwb-layer-name');
      for (n = 0; n < nodes.length; n++) {
        var el = nodes[n];
        var title = plainText(el.textContent);
        if (title.length < 3) continue;
        var scope = el.parentElement;
        if (!scope || scope === section) scope = el.nextElementSibling || el;
        var summary = plainText(scope === el ? '' : scope.textContent).slice(0, 180);
        var chunk = plainText(title + ' ' + (scope === el ? '' : scope.textContent));
        if (!summary) summary = chunk.slice(0, 180);
        pushSearch({
          kind: 'section',
          kicker: tabLabelForTarget(section.id),
          title: title,
          summary: summary,
          target: section.id,
          blob: chunk
        });
      }
    }
    SEARCH_BLOB = SEARCH_INDEX.map(function (item) {
      return item.title + ' ' + item.summary + ' ' + item.blob;
    }).join(' ').toLowerCase();
  }

  function html() {
    return (
      '<article class="hwb">' +
        '<header class="hwb-hero">' +
          '<div class="hwb-hero-row">' +
            '<h2>3E Insights Documentation</h2>' +
            '<div class="hwb-search">' +
              '<div class="hwb-search-field">' +
                '<svg class="hwb-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
                  '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>' +
                  '<path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
                '</svg>' +
                '<input type="search" id="hwb-page-search" placeholder="Search this page…" autocomplete="off" aria-label="Search this page" aria-controls="hwb-search-results" aria-expanded="false" aria-autocomplete="list" role="combobox" />' +
                '<button type="button" class="hwb-search-clear" data-hwb-search-clear="1" hidden>Clear</button>' +
              '</div>' +
              '<div class="hwb-search-results" id="hwb-search-results" role="listbox" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="hwb-hero-pills">' +
            '<span class="hwb-pill">Cursor = Workshop</span>' +
            '<span class="hwb-pill hwb-pill--teal">Domo = Engine room</span>' +
            '<span class="hwb-pill hwb-pill--ink">Portal = Front door</span>' +
          '</div>' +
        '</header>' +

        renderTabNav() +

        '<section class="hwb-section" id="hwb-ops-arch"' + sectionHiddenAttr('hwb-ops-arch') + '>' +
          '<h3>Dashboard Process Overview</h3>' +
          '<p class="hwb-note">The build path runs down the page. Hover a step for the one-line story, or click it for the checklist. Chapter notes sit under the path.</p>' +
          '<div id="hwb-layout-mount">' + renderDashboardLayout() + '</div>' +
        '</section>' +

        '<section class="hwb-section" id="hwb-tools"' + sectionHiddenAttr('hwb-tools') + '>' +
          '<h3>The Tools</h3>' +
          '<p class="hwb-note">Pick a tile — detail below updates. Portal covers ClearSquare placement and portal admin; see <strong>The Few Rules</strong> for PARTITION and browser habits.</p>' +
          '<div id="hwb-tools-mount">' + renderTools() + '</div>' +
          '<p class="hwb-prompt"><strong>Cursor prompts</strong> Name the dashboard folder, what “done” looks like, and whether it is internal or client-facing.</p>' +
        '</section>' +

        '<section class="hwb-section" id="hwb-portal-launch"' + sectionHiddenAttr('hwb-portal-launch') + '>' +
          '<h3>Portal, Launch & Who Gets Which Dashboard</h3>' +
          '<p class="hwb-note">Publish updates the card; launch is who can open which page and when. Internal vs client pages stay separate — partners never get internal-only designs.</p>' +
          '<h4 class="hwb-subhead">When a client launches — what we decide</h4>' +
          '<ol class="hwb-layers hwb-launch">' +
            '<li class="hwb-layer"><span class="hwb-launch-n" aria-hidden="true">1</span><div><div class="hwb-layer-name">Program is live in data</div><p>Partner Data Health and related tables show first program activity (uploads, loads, status). That date drives operational “go live” conversations.</p></div></li>' +
            '<li class="hwb-layer"><span class="hwb-launch-n" aria-hidden="true">2</span><div><div class="hwb-layer-name">Dashboard availability dates</div><p><strong>Campaign dashboards</strong> (single program): available <strong>14 calendar days</strong> after that program’s first activity — same rule as legacy Analyzer and Campaign Timelines launch markers.</p><p><strong>Cross-campaign dashboards</strong> (year-switch family): aligned to <strong>CNVA</strong> first activity for that partner + campaign year, then +14 days. Shown in Partner Data Health program detail and timelines.</p></div></li>' +
            '<li class="hwb-layer"><span class="hwb-launch-n" aria-hidden="true">3</span><div><div class="hwb-layer-name">Portal page + card</div><p>ClearSquare places the right Prod design on the client page (Conversion Apply, Deposit, Awareness, etc.). Page filter set to the partner’s PARTITION.</p></div></li>' +
            '<li class="hwb-layer"><span class="hwb-launch-n" aria-hidden="true">4</span><div><div class="hwb-layer-name">Users &amp; groups</div><p>Portal admin invites client users and maps them to the pages they should see. Different roles may get different pages; everyone on a page still only sees data for the filtered PARTITION unless the page is built for multi-partner internal use.</p></div></li>' +
          '</ol>' +
          '<h4 class="hwb-subhead">Quick checks</h4>' +
          '<div class="hwb-checks">' +
            '<div class="hwb-check"><strong>Empty or wrong data</strong><span>PARTITION on the page, plus group access.</span></div>' +
            '<div class="hwb-check"><strong>Availability</strong><span>First activity + 14 days. Cross-campaign uses CNVA.</span></div>' +
            '<div class="hwb-check"><strong>Practice</strong><span>Development page and the Dev design.</span></div>' +
            '<div class="hwb-check"><strong>Permissions</strong><span>Portal owners — see PROCESS.md.</span></div>' +
          '</div>' +
        '</section>' +

        '<section class="hwb-section" id="hwb-copies"' + sectionHiddenAttr('hwb-copies') + '>' +
          '<h3>Practice vs Live</h3>' +
          '<p class="hwb-note">Two Domo designs on purpose — same flow as the Process Overview chart, focused on Dev and Prod only.</p>' +
          '<div class="hwb-copies">' +
            '<div class="hwb-copy"><h4>Practice (Dev)</h4><p>Development → internal (this repo) or Development → client (partner cards). Ryuu with <code>manifest.dev.json</code> from the dashboard folder.</p></div>' +
            '<div class="hwb-copy-arrow" aria-hidden="true">→</div>' +
            '<div class="hwb-copy hwb-copy--live"><h4>Live (Prod)</h4><p>From <code>main</code> after practice looks right. Ryuu with <code>manifest.json</code>. Updates every portal page on that live design id.</p></div>' +
          '</div>' +
          '<div class="hwb-houses" style="margin-top:0.85rem">' +
            '<div class="hwb-house"><h4>Internal repo</h4><p><code>eee_internal_insights</code> — Operations, Wiki, enrollment tools, team-only cards.</p></div>' +
            '<div class="hwb-house"><h4>Client repo</h4><p><code>eee_client_insights</code> — partner-facing Conversion, Deposit, Awareness, and related dashboards.</p></div>' +
          '</div>' +
          '<h4 class="hwb-subhead" id="hwb-new">Brand-new dashboard</h4>' +
          '<div class="hwb-new">' +
            '<div class="hwb-new-step"><span class="hwb-new-n">1</span><strong>Pick repo</strong><span>Internal vs client house</span></div>' +
            '<div class="hwb-new-step"><span class="hwb-new-n">2</span><strong>New folder</strong><span>One product — not a mixed export</span></div>' +
            '<div class="hwb-new-step"><span class="hwb-new-n">3</span><strong>Dev first</strong><span>Create practice design · Development page</span></div>' +
            '<div class="hwb-new-step"><span class="hwb-new-n">4</span><strong>GitHub + Prod</strong><span>Merge to main · live send when ready</span></div>' +
          '</div>' +
        '</section>' +

        '<section class="hwb-section" id="hwb-rules"' + sectionHiddenAttr('hwb-rules') + '>' +
          '<h3>The Few Rules That Protect Live Cards</h3>' +
          '<p class="hwb-note">Non-negotiable habits — details for each tool live under <strong>The Tools</strong> and in PROCESS.md.</p>' +
          '<div class="hwb-rules">' +
            '<div class="hwb-rule"><strong>One Folder at a Time</strong><span>Stand in that dashboard’s folder before sending. Never send from the repo root or a Downloads export.</span></div>' +
            '<div class="hwb-rule"><strong>Practice, Then Live</strong><span>Dev card first. Live only from the main copy after it looks good.</span></div>' +
            '<div class="hwb-rule"><strong>Keep the Live Name Tag</strong><span>Do not take the id off the live file. That id is how Domo knows which card to update.</span></div>' +
            '<div class="hwb-rule"><strong>PARTITION, not CLIENT</strong><span>Portal page filters use PARTITION or the card can error or come back empty.</span></div>' +
            '<div class="hwb-rule"><strong>Chrome or Edge</strong><span>Other browsers often block the portal iframe, so the card looks broken.</span></div>' +
            '<div class="hwb-rule"><strong>Hard Refresh</strong><span>Ctrl+Shift+R / Cmd+Shift+R after a send. Cache is the usual “it didn’t change” mystery.</span></div>' +
          '</div>' +
          '<p class="hwb-footnote">Publish commands: PROCESS.md in this repo.</p>' +
        '</section>' +
      '</article>'
    );
  }

  function refresh(root, which) {
    if (!root) return;
    if (!which || which === 'tools') {
      var tools = root.querySelector('#hwb-tools-mount');
      if (tools) tools.innerHTML = renderTools();
    }
    if (!which || which === 'layout') {
      var lay = root.querySelector('#hwb-layout-mount');
      if (lay) lay.innerHTML = renderDashboardLayout();
    }
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var root = ev.currentTarget;
    var go = t.closest('[data-hwb-go-kind]');
    if (go) {
      ev.preventDefault();
      goToHit(root, hitFromEl(go));
      return;
    }
    var clear = t.closest('[data-hwb-search-clear]');
    if (clear) {
      ev.preventDefault();
      state.searchQ = '';
      state.searchOpen = false;
      state.searchActive = 0;
      var input = root.querySelector('#hwb-page-search');
      if (input) input.value = '';
      renderSearchPanel(root);
      if (input) input.focus();
      return;
    }
    if (!t.closest('.hwb-search') && state.searchOpen) {
      state.searchOpen = false;
      renderSearchPanel(root);
    }
    var tabBtn = t.closest('[data-hwb-tab]');
    if (tabBtn) {
      showTab(root, tabBtn.getAttribute('data-hwb-tab'));
      return;
    }
    var jump = t.closest('[data-hwb-jump]');
    if (jump) {
      showTab(root, jump.getAttribute('data-hwb-jump'));
      return;
    }
    var tool = t.closest('[data-hwb-tool]');
    if (tool) {
      state.tool = tool.getAttribute('data-hwb-tool') || 'cursor';
      refresh(root, 'tools');
      return;
    }
    var layoutOpen = t.closest('[data-hwb-layout-open]');
    if (layoutOpen) {
      state.layoutModal = Number(layoutOpen.getAttribute('data-hwb-layout-open')) || 0;
      refresh(root, 'layout');
      return;
    }
    var layoutClose = t.closest('[data-hwb-layout-close]');
    if (layoutClose) {
      state.layoutModal = null;
      refresh(root, 'layout');
      return;
    }
    var layoutModalTool = t.closest('.hwb-layout-modal-tool');
    if (layoutModalTool) {
      state.tool = layoutModalTool.getAttribute('data-hwb-layout-tool') || 'cursor';
      state.layoutModal = null;
      showTab(root, 'tools');
      refresh(root, 'layout');
      refresh(root, 'tools');
      return;
    }
  }

  function bind(root) {
    if (!root) return;
    var el = root.classList && root.classList.contains('hwb') ? root : root.querySelector('.hwb');
    if (!el || el.getAttribute('data-hwb-bound') === '1') return;
    el.setAttribute('data-hwb-bound', '1');
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && layoutModalIndex() >= 0) {
        state.layoutModal = null;
        refresh(el, 'layout');
        ev.preventDefault();
      }
    });
    applyTabChrome(el);
    var input = el.querySelector('#hwb-page-search');
    if (input) {
      input.addEventListener('input', function () {
        state.searchQ = input.value;
        state.searchActive = 0;
        state.searchOpen = searchTokens(state.searchQ).length > 0;
        renderSearchPanel(el);
      });
      input.addEventListener('focus', function () {
        if (searchTokens(state.searchQ).length) {
          state.searchOpen = true;
          renderSearchPanel(el);
        }
      });
      input.addEventListener('keydown', function (ev) {
        var hits = queryIndex(state.searchQ);
        if (ev.key === 'Escape') {
          if (state.searchOpen) {
            state.searchOpen = false;
            renderSearchPanel(el);
          } else if (state.searchQ) {
            state.searchQ = '';
            input.value = '';
            renderSearchPanel(el);
          }
          ev.preventDefault();
          return;
        }
        if (ev.key === 'ArrowDown' && hits.length) {
          state.searchOpen = true;
          state.searchActive = Math.min(state.searchActive + 1, hits.length - 1);
          renderSearchPanel(el);
          ev.preventDefault();
          return;
        }
        if (ev.key === 'ArrowUp' && hits.length) {
          state.searchOpen = true;
          state.searchActive = Math.max(state.searchActive - 1, 0);
          renderSearchPanel(el);
          ev.preventDefault();
          return;
        }
        if (ev.key === 'Enter' && hits.length) {
          goToHit(el, hits[state.searchActive] || hits[0]);
          ev.preventDefault();
        }
      });
    }
    var results = el.querySelector('#hwb-search-results');
    if (results) {
      results.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
      });
    }
  }

  function mount(container) {
    if (!container) return;
    container.innerHTML = html();
    indexFromDom(container);
    bind(container);
  }

  function matches(query) {
    var q = String(query || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    if (!q) return false;
    var tokens = q.split(/\s+/);
    for (var i = 0; i < tokens.length; i++) {
      if (SEARCH_BLOB.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  global.HowWeBuild = {
    html: html,
    bind: bind,
    mount: mount,
    matches: matches,
    showSection: showTab,
    searchTitle: '3E Insights Documentation',
    searchSummary: 'Portal & Launch — who gets which dashboard — plus process overview, tools, Dev vs Prod, and guardrails.'
  };
})(window);
