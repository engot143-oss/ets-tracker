# ETS (Enrique's Tracking System)

A small, single-user tracker for sterile processing inventory and missing-instrument orders. It runs as a static site on GitHub Pages. Use it on a work desktop browser or an iPhone.

Live site: https://engot143-oss.github.io/ets-tracker/

## What it does

- **Inventory** — one table of shelf/bin slots (for example `Scissors 1` or `Forcep 3`) with catalog number, name, description, quantity, and status.
- **Missing** — one list of instruments on order, with a status donut and a quote → PO → delivery workflow.
- Typing a catalog number that already exists fills in the name and description.

There is no server of your own. Data is saved in this browser. After you finish [SETUP.md](SETUP.md), it can also save to a private Google Sheet named **ETS Data** in your Google Drive.

This site does not store patient information. The GitHub Pages site is public; your inventory stays in your browser and, if you sign in, in your private sheet.

## How to use it

1. Open the live site (or this folder in a browser).
2. Add slots on **Inventory**. Use **Status = Available** if you only want available rows.
3. Track replacements on **Missing**. Tap the status button to move an item forward. Use **Back** to step backward.
4. Optional: **Load sample data** to try the screens with example rows.
5. Use **Export JSON** / **Export CSV** for a backup, and **Import JSON** to restore.

Google sign-in is optional. Until a Client ID is pasted into `config.js`, the app stays on this device and still works.

## Files

Vanilla HTML, CSS, and JavaScript. No build step. GitHub Pages should serve the repository root of `main`.
