# 3E Operations (GitHub Pages snapshot)

Static snapshot of **3E Operations** from `3enrollment/eee_internal_insights` → `3E_Operations/`.

## Live site

**https://lancecmaben.github.io/3e-operations-demo/**

**Demo mode:** Overview, filters, and Partner Data Health load from fictional partners/campaigns via an in-browser SQL shim. Embedded chapters may stay empty where datasets are not mocked.

## Domo publish

`cd 3E_Operations` → `npx --yes ryuu -m manifest.dev.json publish` (Dev) or `manifest.json` (Prod).