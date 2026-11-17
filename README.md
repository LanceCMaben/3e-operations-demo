# 3E Operations

**Repo home:** [`eee_internal_insights`](https://github.com/3enrollment/eee_internal_insights) → folder `3E_Operations/`  
**Portal:** 3E Insights Portal · ClearSquare **Development → internal** (Dev card) or internal Prod page

**Team process:** [../PROCESS.md](../PROCESS.md)

Internal Operations Overview card (Domo design **3E Operations**, folder `3E_Operations/`) with chapter-style navigation. **Overview** is the landing grid. **Partner Data Health** is the rebuild of Analyzer page [559098403](https://3enrollment-marketing.domo.com/page/559098403). Other chapters embed Print Batches, Campaign Upload QA, Timelines, Load History, Program Meta, Insights Activity, and Documentation. The old **Partner Progress** design name is retired; these are the same design ids. Insights Activity is a chapter of this card only.

| | Value |
|---|--------|
| Prod design | `3E Operations` · `6f0ea78d-391d-4fb7-acbc-e3492b21e803` |
| Dev design | `DEV 3E Operations` · `5a5bf3e6-a965-464c-a3e8-b22e313228d7` |
| Source page | `559098403` |

## Chapters

- **Overview** — Operations Overview launcher grid with color-coded cards, hover summaries, and open-item badges where available. Uses the shared filter bar (Partner, Campaign, Year, Status).
- **Partner Data Health** — filters, KPI strip, and stacked tables (Activity, Files, Downloads, Daily Load, Totals) on one page. Deep link example: `#partnerDataHealth/downloads` scrolls to that table.
- **Print Batches** — on-demand and batch available vs sent by client from `PRINT_BATCHES` (lazy-loaded). Campaign years load with `GROUP BY CAMPAIGN_YEAR` (same as the standalone Print Batches app). An Overview scope year like `CY26` maps onto a print-year pill like `2026` when those values are equivalent.
- **Campaign Upload QA** — partition upload freshness from Enrollment Metrics (XPL fallback). **CY25** / **CY26** year pills (AWR is CY25). Campaign tabs: **All**, **CNVA**, **CNVAU**, **CNVAA**, **CNVAAFF**, **CNVASC**, **CNVD**, **AWR**. Uses the same Partner / Campaign / Year / Program Status filters as Partner Data Health. Verbose campaign names (`CF_CAMPAIGN_TYPE` such as Conversion Apply) map onto `PROGRAM_SOLUTION` codes before joining. Late statuses only include **Active** programs for that partner + campaign + year (inactive programs such as Ringling CNVA stay hidden until you include Inactive). Roster pills show Active / Inactive / Development / Unmapped for the joined program. **Click a roster row** for a client detail panel (upload freshness, matched program, and other loaded campaigns for that client).
- **Campaign Timelines** — rebuild of Analyzer page [1151828266](https://3enrollment-marketing.domo.com/page/1151828266). Gantt of each program from `FIRST_ACTIVITY` to `LAST_ACTIVITY`, one row per client (`PARTITION`), bars colored by `CAMPAIGN_YEAR`. Campaign slicer is `PROGRAM_SOLUTION`. Gold marker = campaign dashboard availability (first activity + 14 days; shared constant in `ops-join.js`).
- **Campaign Load History** — membership load over time from `PARTNER DASH LEADS_PROGRAMS_XPL` (`MEMBERSHIP_DATE`). Opening the chapter selects **HighPoint** and loads it (CNVA when that campaign exists) unless Overview scope already has a partner. Filters match the standalone Load History app (client-first selects, searchable year multi-select, record type / origin pills). **Client** options use the same partner list as Partner Data Health (`programs` + status + cascade), not every partition that ever had membership in XPL. Overview scope partner, campaign, and year sync on Apply via `OpsJoin` campaign/year matching. Point in Time Only (default) compares years as of the same calendar date and keeps membership dated before Aug 1 in the total. The PIT student table is unfiltered.
- **Program Meta** — one card per campaign from `VW_PROGRAM_META`, joined to email skew on `PARTITION` + `CAMPAIGN_YEAR` + `PROGRAM_SOLUTION`, last download from `VW_PARTNER_DOWNLOADS_KMK`, and `TOP_PROGRAMS_ACTIVITY_STATUS` on `PROGRAM_ID`. Status on the card and in the Status filter is that activity row’s `PROGRAM_STATUS` as stored (Complete, Active, Development, and any other value). It is not derived from `ACTIVE_FLAG`. Dashboard availability still uses that same activity row (first activity + 14 days). Cards also show returns, MAP, dashboards (enabled / not enabled), last download date, market revision/tier, print ready (state code + landing page), and `PERCENTAGE_DIFF` when a skew match exists. CY26 cards also show `DQ_STATUS` (green, yellow, or red; blank is red Pending) and `DQ_NOTES` when present. Filters: multi-select Partner, Campaign, and Campaign Year (Partner checklist is the same `programs` list as Partner Data Health, not every partition in `VW_PROGRAM_META`), plus Status, Returns, MAP, and Dashboards (enabled / not enabled), Last download (has / never / recency), Search, Apply, and Reset (latest year selected on first load; Status starts on all values). Overview partner, campaign, and year still sync. Overview’s Active / Inactive / Development filter does not.
- **Insights Activity** — portal page-view log from the same dataset as Analyzer page [2074513896](https://3enrollment-marketing.domo.com/page/2074513896). **Portal**, **date range**, **Partition** (`workspace_name`), and **Dashboard** (`page_name`) filters (Apply / Reset); Internal / Client / All audience in Portal menu. KPI strip (views, viewers, dashboards, est. time), charts (views over time, unique viewers over time, audience mix, top partitions), a Top Dashboards table with a relative bar plus viewers and estimated time, ranked tables with sortable columns, drill-down detail (below Recent Activity), **Export CSV** on the activity log, and estimated dwell (30 min cap between views). Test sandboxes (`z_` partners, partitions ending in ` test`, and portal QA viewers such as `@test.com` or names ending in ` Test`) count as **Internal**, not Client; `z_` rows are excluded from the chapter. Date range is Last 7 days, Last 30 days, Last 90 days, or **Last 12 months** (365 days). The activity log loads newest PortalActivity rows, 25,000 at a time and up to **100,000**, and stops once that 12-month window is covered. PortalActivity rejects a date filter on the Data API, so the 12-month cutoff is applied after the load. Banner when the log is still short of the window. With only a date range set, headline totals and dashboard rankings are counted in SQL across that range. Deep link: `#insightsActivity` (legacy `#insightsUsage`). Chapter only (no separate Domo design).
- **Documentation** — 3E Insights Documentation (no datasets). Opens on **Portal & Launch**, then process overview, tools, practice vs live, and rules. Search jumps to process steps, tools, or sections. Deep link: `#howWeBuild`.

## Partner Data Health (chapter 1)

- **Filters** — Partner (`PARTITION`), Campaign (`PROGRAM_SOLUTION`), Campaign Year, and Program Status (Active / Inactive / Development) are **multi-select**, each with a search box inside the dropdown to narrow options. Latest campaign year is selected on first load; **Program Status** defaults to **All statuses**. Apply commits scope to tables and embedded chapters; it does not text-search table rows.
- **KPIs** — program count, active count, stale (14+ days), last activity, file-row count.
- **Program Activity** — first/last activity, status chips, days since last touched (amber at 14 days, red at 30). **Click a row** to open a detail drawer; export a formatted Excel program report or latest partner file report from the drawer. The drawer shows **campaign dashboard availability** (first activity + 14 days) and, when CNVA exists for that partner and year, **cross-campaign availability** anchored on CNVA (same +14-day rule).
- **Dashboard availability (ops rule of thumb)** — **Campaign** client dashboards ≈ two weeks after `FIRST_ACTIVITY` for that program. **Cross-campaign** client dashboards follow **CNVA** for the same partner and campaign year (year switch / launch). Portal page-level exceptions are not encoded yet; confirm with ops when dates disagree.
- **Partner Data Files Detail** — funnel counts from partner source files (`APP_ST` / `APP_SUB` / `APP_COMP` and the rest of the Analyzer file metrics). Partner and campaign columns stay pinned. Counts show as full integers. **App Strt not Submitted** (`APP_STXSUB`, started minus submitted) displays as 0 when the source is negative, which happens when submits exceed starts. The program drawer says what the source count was.
- **Partner Downloads** — Analyzer card **PDH Partner Downloads**: Download Date (`EVENT_DATE`), Partner (`CLIENT`), Campaign (`CAMPAIGN`), Campaign Year (`CY` or `CAMPAIGN_YEAR`, with a filename search only when those columns return nothing), and File (`FILE_NAME`). Queries order by download date. Overview scope years such as `2026` match download `CY26`. Campaign filters use program codes (`CNVA`) even when the download row says Conversion Apply. The same Active / Inactive / Development filter used on files and daily load hides downloads whose matched program is outside the selected statuses. Undated `DAO` / return files do not appear when a year is selected.
- **Daily Load Details** — membership load by date, with a running total.
- **Campaign Totals** — record counts from `leads_programs_xpl` (`COUNT(1)` grouped by partner, campaign, and year on `PARTITION`). A selected year also matches `2026` / `CY2026`. Counts run a few partners at a time so a full-table query does not fail the section.

Tables in Partner Data Health are paginated at 50 rows and shown stacked on one page. Files, downloads, daily load, and campaign totals query after a **campaign year** and/or **partner** is selected. Files and daily load put that year in the SQL (`CAMPAIGN_YEAR`, and `CY` on files), including equivalent forms such as `CY26` and `2026`, so a year-only open does not download the full history. Files use `CAMPAIGN` / `SOURCE_FILE` / `FILETYPE` (not `PROGRAM_SOLUTION` / `SOURCE_FILE_NAME`). Downloads use `CLIENT` / `CAMPAIGN` / `CY` / `FILE_NAME` like the Analyzer card; partner matching also accepts `PARTITION` and a `_{partner}_` token in the file name.

Chapters with local filters (Print Batches, Timelines, Load History, Program Meta) hide the shared filter bar but inherit a single partner, campaign, or year from Overview scope when you open them. **Campaign Upload QA** shows the same Partner Data Health filter bar and applies those filters to the partition roster.

## Datasets

| Alias | Domo name | Dataset id | Used by |
|-------|-----------|------------|---------|
| `programs` | `MARVIN_ANALYTICS.REPORTING.TOP_PROGRAMS_ACTIVITY_STATUS` | `59afa2d3-bbd8-4ed8-9e1c-c474f6fe7c46` | Partner Data Health, Campaign Timelines |
| `partnerFiles` | `MARVIN_ANALYTICS.REPORTING.PARTNER_FILES_SUMMARY` | `79b16d1a-be4d-441d-a6ec-619156b764cf` | Partner Data Health — Files |
| `downloads` | `MARVIN_ANALYTICS.REPORTING.VW_PARTNER_DOWNLOADS_KMK` | `422fec3e-c1f1-4e9d-baba-2e8365cb6289` | Partner Data Health — Downloads; Program Meta last download (shared join in `ops-join.js`, manifest maps `EVENT_DATE` / `DOWNLOAD_DATE`, partner, campaign, year) |
| `loadHistory` | `MARVIN_ANALYTICS.REPORTING.PROGRAM_LOAD_HISTORY` | `cf232f03-3941-4bfe-b4c6-8e5709c6c1a2` | Partner Data Health — Daily Load |
| `leads` | `PARTNER DASH LEADS_PROGRAMS_XPL` | `e4871332-8b50-4d6a-8021-dcb29669f5b8` | Partner Data Health — Totals; Campaign Upload QA fallback; Load History |
| `printBatches` | `PRINT_BATCHES` | `9100cf4b-7aa4-46be-b055-a59cb46e70db` | Print Batches (manifest lists `PARTITION`, `PROGRAM_SOLUTION`, `CAMPAIGN_YEAR`, `SENT_BATCH`, `SENT_DEMAND`, `CNV_SCORE`) |
| `campaignQaInsights` | Enrollment Metrics | `43a17397-6e63-4e9d-9ef6-bbc2217ddac2` | Campaign Upload QA |
| `programMeta` | `VW_PROGRAM_META` | `efa412ee-ca5b-483a-9cf0-f7eca03034ed` | Program Meta |
| `emailSkew` | Email skew status | `c9aced4a-18bd-43df-aa45-df993c868726` | Program Meta |
| `pageViews` | **PortalActivity** (Domo Webform; legacy Analyzer [2074513896](https://3enrollment-marketing.domo.com/page/2074513896)) | Map alias to **PortalActivity** on the card (manifest id `dea70a64-…` must match that dataset UUID) | Insights Activity — **no manifest field list**; chapter resolves `page_name` / `Page Name` / `act_date` etc. at runtime |
| `dashboardExceptions` | *(optional)* **Ops Dashboard Availability Overrides** webform | Create in Domo, map on card as alias `dashboardExceptions` | PDH drawer (and future Launch Readiness) — replaces first-activity + 14d when a row matches partner / campaign / year |

After publishing, map **all ten required** aliases on the card (eleven when overrides webform exists). Portal page filters must use `PARTITION`, not `CLIENT`.

Partners whose `PARTITION` starts with **`z_`** (test/sandbox) are hidden across Operations chapters — see `IGNORED_PARTITION_PREFIX` in `ops-join.js`.

## Backlog (3E Operations)

| Area | Issue |
|------|--------|
| **Launch Readiness** | **Tabled** — hidden from chapter nav and Overview grid (`TABLED_CHAPTERS` in `app.js`). Merged work queue code remains for later validation; use Partner Data Health, Campaign Upload QA, and Program Meta instead. Re-enable by clearing `workQueue` from `TABLED_CHAPTERS`. |
| **Partner Data Health — Files** | Overview scope Program Status must filter file/load/total rows via matched program (fixed in app `getFiltered`). |
| **Program Meta** | Status is raw `PROGRAM_STATUS` from `TOP_PROGRAMS_ACTIVITY_STATUS`, joined on `PROGRAM_ID`. It does not follow Overview’s Active / Inactive / Development filter. |
| **Program Meta** | Reset keeps the latest year and all statuses, then puts the current Overview partner, campaign, and year back when that scope is set. |
| **Program Meta / PDH downloads** | v0.0.153+ aligns last-download join with PDH (CLIENT+PARTITION, fuzzy partner, missing CY). Still verify dataset freshness and edge cases (Humboldt vs files.com). |
| **Program Meta** | Data quality: Marist CNVA, MSMC inactive rows, other small card errors. |
| **Portal / tabs** | Active vs Dev tab behavior (ClearSquare or card env) — confirm with portal team. |

## Publish (from this folder)

```bash
cd 3E_Operations

npx --yes ryuu -m manifest.dev.json publish

# Prod — only from main after Dev looks good.
npx --yes ryuu -m manifest.json publish
```

Bump `version` in the manifest you are publishing before each publish. Hard-refresh the portal after deploy.

## Node / vendor

`package.json` and `vendor/domo.js`. Do not commit `node_modules`.
