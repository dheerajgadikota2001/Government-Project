"""Pull every live API dump the prototype's data build needs, into scratchpad/live/.

Run from the site folder before prep_data.py:
    python3 scripts/fetch_live.py && python3 scripts/prep_data.py

Each file is written only after its JSON parses, so a failed or half-finished
request never replaces a good dump from an earlier run. Paged endpoints are
followed to the end and checked against the total the API reports.
"""
import json
import os
import subprocess
import sys
import time

S = '/tmp/claude-0/-home-claude/1bec7e1b-544e-5672-b46e-4cf91965d07f/scratchpad'
LIVE = f'{S}/live'
B = 'https://apfactcheck.dheeco.com/api/v1'
os.makedirs(f'{LIVE}/reg', exist_ok=True)


def get(path, tries=4):
    """GET a JSON endpoint through the proxy, retrying with backoff."""
    last = None
    for i in range(tries):
        r = subprocess.run(['curl', '-sS', '-m', '90', '--fail', f'{B}/{path}'], capture_output=True, text=True)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except json.JSONDecodeError as e:
                last = f'bad JSON: {e}'
        else:
            last = r.stderr.strip()[:200]
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'{path}: {last}')


def save(name, obj):
    tmp = f'{LIVE}/{name}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, f'{LIVE}/{name}')
    print(f'{name:28s} {os.path.getsize(f"{LIVE}/{name}") // 1024:6d} KB')


def walk(path, page_size=100):
    """Follow ?page= until has_next is false. Returns the rows as served, repeats and all."""
    items, page, total = [], 1, None
    sep = '&' if '?' in path else '?'
    while True:
        d = get(f'{path}{sep}page_size={page_size}&page={page}')
        total = d.get('total', total)
        items += d['items']
        if not d.get('has_next'):
            break
        page += 1
    return items, total


def paged(path, also=()):
    """Every row of a paged list, once each, checked by id against the total the API reports.

    Counting rows is not enough. On 18 Oct 2026 the documents list returned 1,580 rows for a
    total of 1,580, but only 1,573 different papers: its sort ties (a refresh saves a page of
    papers with one timestamp), so some rows came twice and seven never came. When a walk
    misses ids, the same list is walked again in the other orders given in `also` until every
    id is seen; if they still fall short, this fails rather than save a register with holes.
    """
    items, total = walk(path)
    rows = {}
    for x in items:
        rows.setdefault(x['id'], x)
    repeats = len(items) - len(rows)
    sep = '&' if '?' in path else '?'
    for order in also:
        if total is None or len(rows) >= total:
            break
        more, _ = walk(f'{path}{sep}{order}')
        for x in more:
            rows.setdefault(x['id'], x)
    if total is not None and len(rows) != total:
        raise RuntimeError(f'{path}: {len(rows)} different rows of {total}')
    if repeats:
        print(f'{path}: the first walk repeated {repeats} rows; filled from {len(also)} other orders')
    return list(rows.values()), total


single = {
    'register.json': 'projects/register',
    'districts.json': 'projects/districts',
    'insights.json': 'projects/insights',
    'by_tenure_projects.json': 'projects/by-tenure',
    'by_tenure_mous.json': 'mous/by-tenure',
    'updates.json': 'meta/updates?days=60',
    'finances.json': 'finances/',
    'departments.json': 'finances/departments',
    'statefacts.json': 'state-facts/',
    'summits.json': 'mous/summits',
    'mous_stats.json': 'mous/stats',
    'library.json': 'documents/library',
    'documents_stats.json': 'documents/stats',
    'tenders_summary.json': 'tenders/register/summary',
    'contacts.json': 'contacts/',
    'governments.json': 'governments/',
    'community.json': 'community/topics',
    'news.json': 'news/latest',
    'reg613.json': 'projects/register/613',
    'ext613.json': 'projects/613/extras',
    'reg1.json': 'projects/register/1',
    'ext1.json': 'projects/1/extras',
}
for name, path in single.items():
    save(name, get(path))

mous, _ = paged('mous/')
save('mous.json', {'items': mous, 'total': len(mous)})

active, _ = paged('tenders/')
closed, _ = paged('tenders/?status=closed')
save('tenders.json', {'items': active, 'closed': closed})

# Until the documents list ends its sort with the id (the paging fix waiting for Dheeraj's go),
# offset pages can repeat and skip papers; the other orders fill what the first walk missed.
docs, total = paged('documents/', also=('sort=date&order=asc', 'sort=title&order=asc', 'sort=title&order=desc',
                                        'sort=retrieved&order=desc', 'sort=retrieved&order=asc', 'sort=year&order=asc'))
save('documents_all.json', {'items': docs, 'total': total})

# Per-project registers carry the dated events; only works with events have one worth fetching.
reg = json.load(open(f'{LIVE}/register.json', encoding='utf-8'))
want = [p['id'] for p in reg['projects'] if p.get('event_count')]
for pid in want:
    d = get(f'projects/register/{pid}')
    with open(f'{LIVE}/reg/{pid}.json', 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
stale = [f for f in os.listdir(f'{LIVE}/reg') if int(f[:-5]) not in set(want)]
for f in stale:
    os.remove(f'{LIVE}/reg/{f}')
print(f'reg/: {len(want)} registers ({len(stale)} stale removed)')

with open(f'{LIVE}/FETCHED', 'w') as f:
    f.write(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()) + '\n')
print('done')
