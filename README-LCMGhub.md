# 3E Operations (LCMGhub snapshot)

Static snapshot of **3E Operations** from `3enrollment/eee_internal_insights` → `3E_Operations/`.

## Live site

**https://lcmghub.github.io/3e-operations-demo/**

Internal Operations card — requires Domo and internal datasets. Pages deployment mirrors the design files for reference; not a working demo without Domo.

## Domo publish

`cd 3E_Operations` → `npx --yes ryuu -m manifest.dev.json publish` (Dev) or `manifest.json` (Prod).