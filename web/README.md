# AP Fact Check: the new site (web/)

The new design of apfactcheck.dheeco.com, moved into the repo as `web/` on 21 October 2026
(milestone M1 of the production cutover). The old app in `ap-nadu-nedu/` still serves production
until the preview channel is checked and the cutover is approved.

Most data is compiled into the build (`src/data/`), read from the live record and official
sources. The district paper (`/paper/<district>`) is a DRAFT edition; readers should see it only
after it is approved.

## Run and build

    cd web
    npm ci
    npm run dev                      # local dev server, http://localhost:5173
    npm run build                    # the site, path addresses, split by page: web/dist
    SINGLE=1 npx vite build          # one-file preview build in dist-single/

## Put it on a Firebase preview channel (does not touch production)

From the repo root, after `npm run build` in web/:

    firebase hosting:channel:deploy new-design --config firebase.web.json --expires 7d

`firebase.web.json` serves `web/dist` with the same `/api/**` rewrite to Cloud Run and the same
security headers as production. Production keeps using `firebase.json` until the cutover.

## Rebuilding the data

The compiled JSON in `src/data/` is committed, so a build needs nothing else. To rebuild it:

- `scripts/build_district_editions.py` and `scripts/build_district_history.py` read `backend/seed/`.
- `scripts/check_editorial.py` and `scripts/build_district_happenings.py` read the gathered sweep,
  which is not in git (it holds raw PDFs). Unpack `sources/gather/` and set
  `AP_GATHER=<that folder>/district_happenings`. The build refuses to run if any lead story in
  `editorial/` fails the checker.
- `scripts/fetch_live.py` and `scripts/prep_data.py` still point at Claude's workspace; they are
  kept for the record and will be moved onto the API during milestone M2.

## Where things are

- `src/pages/`: Home, Projects, Polavaram, a generic project page, Districts, Money, State facts, Investments, Claims, Papers, Tenders, Updates.
- `src/components/`: the site shell, search, the design picker, shared parts.
- `src/components/ui/`: shadcn/ui components, added with the shadcn CLI.
- `src/vendor/<source>/`: components copied from other open registries, with imports changed to fit.
- `src/graphics/`: the map, the dam, the timeline road and the money charts.
- `src/data/`: JSON built from the live record by `scripts/prep_data.py`.
- `src/lib/design.tsx`: every choice in the "Pick the design" panel and the platform it came from.

## Licences of the copied components

Used on the pages:

- shadcn/ui, Origin UI components, Magic UI, Kokonut UI: MIT.
- blocks.so and shadcnui-blocks: MIT. Their stat and timeline layouts are copied into `src/components/project-parts.tsx`.
- tweakcn themes and Tremor Raw: Apache-2.0.
- Aceternity UI: not used. Its licence forbids sharing its source in a public repo, so the year-by-year timeline was rewritten as our own `src/components/year-timeline.tsx` (21 Oct 2026) and no Aceternity file is in this folder.

Copied for the survey but not used on any page: `src/vendor/cult-ui`, `src/vendor/kibo-ui`, `src/vendor/motion-primitives`, and most files in `src/vendor/blocks-so` and `src/vendor/shadcnui-blocks`. The build leaves them out.

## House rules this prototype keeps

No site-made totals, shares or ranks. Every number shows its date and its paper.
Estimates are hollow or dashed. Newspapers appear only as "Newspaper says" claims.
Government changes are marked by date only. The map is for picking, not shaded by count.
No party colours. Reduced motion is respected.
