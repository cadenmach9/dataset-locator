# Dataset Locator

A single-page dashboard for tracking where datasets live across your cloud and what they're cleared for. Built so a small team can quickly answer "do we have data for X?" and "is that one okay to use in marketing?" without digging through buckets, Notion pages, or Slack threads.

## Use case

You have datasets scattered across cloud storage — different buckets, different environments, different teams. You want a central index that shows:

- **What** each dataset is (name, screenshot, notes)
- **Where** it lives (a link to the bucket / dashboard / wherever)
- **What environment** it's in (Prod / Develop / Staging)
- **What it's tagged as** (Survey, Telecom, Transportation, Utilities, City, Suburban, Fun, etc.)
- **Whether it's cleared for marketing use**

The dashboard makes those answers a quick glance and a quick filter, not a hunt.

## Features

- **Cards** — each dataset is one card with a screenshot, name, link, notes, and color-coded chips
- **Tag chips** — click to toggle on cards (semitransparent = off, solid = applied), click to filter the dashboard
- **Two chip groups** — Location (Prod / Develop / Staging) and Tags (Marketing / Survey / Telecom / Transportation / Utilities / City / Suburban / Fun)
- **Detail view** — click any card to see it large in the center of the screen, with the full screenshot, all tags, and complete notes
- **Lightbox** — click the screenshot in the detail view for true full-size
- **Search + filter** — search by name / link / notes; filter by any combination of chips
- **Paste-to-add screenshots** — paste an image with Cmd/Ctrl+V while the editor is open, or use the file picker
- **Auto-resize** — screenshots are downscaled to 1280px max and re-encoded as JPEG to keep storage tiny

## How to use

No build step, no server. Open `index.html` in a browser:

```
open index.html
```

Then click **+ New card** to add your first dataset. That's it.

## How data is stored

Card metadata (name, link, tags, notes) lives in your browser's `localStorage` under the key `dataset-locator-cards-v1`. Screenshots are stored separately in **IndexedDB** (database `dataset-locator`), keyed by card id. That means:

- **No accounts, no backend, no network calls.** Your data never leaves your machine.
- **Per-browser, per-device.** Cards added in Chrome on your laptop won't show up in Safari, or on another machine.
- **Storage cap.** Metadata uses the small (~5–10 MB) `localStorage` budget, but screenshots use IndexedDB, whose quota scales with available disk (typically hundreds of MB to GBs) — so screenshots no longer compete with card data for that tiny budget. Images are still downscaled to 1280px and JPEG-encoded to stay efficient.

If you want team sharing, sync, or backups, that needs a backend (this project doesn't include one).

## Tech stack

Vanilla HTML, CSS, and JavaScript. No frameworks, no dependencies, no build tools. Three files: [index.html](index.html), [styles.css](styles.css), [app.js](app.js).

## Customizing chips

Chip groups, labels, and colors are defined in one place — the `TAG_GROUPS` constant at the top of [app.js](app.js). Add, rename, or recolor chips there and they'll show up in both the editor and the filter bar automatically.
