# GFB Portal

A desktop with five apps, each one a separate fictional site with its own look. Built so far: the Resident Registry (Simerican Office of Resident Affairs), Black Tea (front page plus a staff desk at `#/blacktea/desk`), Lotline (lot listings, buildings with units, owners, households), and Harbor Trust (the Callenders' bank: customer online banking plus a staff back office at `#/trust/staff`). and the Calendar app (84-day year of four 21-day seasons, with a "today in the save" date that also shows in the menu bar). the Office of Planning & Permits (your to-do list for the save, dressed as a state agency; it also files unfinished lots and Sim records on its own. Built on the Plumb engine in `sites/plumb/`, styled by `sites/permits/`). Simsta is a placeholder.

## Put it on GitHub Pages

1. Create a new repository on GitHub (for example `gfb-portal`).
2. Upload everything in this folder to the repo, keeping the folders as they are.
3. In the repo, go to **Settings > Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**, pick `main` and `/ (root)`, then save.
5. Wait a minute or two. Your site link appears at the top of that Pages screen.

You can also just double-click `index.html` to open it locally. No install needed.

## How the files fit together

- `index.html`: the desktop.
- `desktop/`: wallpaper, app icons, and the window each site opens in. App icons live in `desktop/desktop.js`.
- `sites/<name>/`: each site's own code and styles. Sites never share styling.
- `assets/data.js`: **the only file that touches data.** Today it reads `data/seed.js` and saves edits to your browser. When Supabase is set up, only this file changes.
- `data/seed.js`: the starting data, shaped like the future Supabase tables (`sims`, `relationships`).

## Editing right now

"Edit record" saves to the browser you're using. Edits won't show up on another device until Supabase is connected. "Discard my local edits" in the Registry sidebar resets everything back to the seed.

## To do

- Remove the temporary Simsta sample posts: delete `data/sample-simsta.js` and its line in `index.html`.

- Harbor Trust: hero photo is in (`sites/harbor/img/hero.jpg`). Swap the file anytime to change it.
- Lotline: logo set, then retheme the site to match.
