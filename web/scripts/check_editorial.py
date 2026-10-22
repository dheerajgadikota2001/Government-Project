"""Gate for the hand-written lead stories of the district paper (site/editorial/<slug>.json).

A lead story is written by a person (or drafted by an agent and read by a person), so this
script does not judge the writing. It checks the things a reader must be able to trust:

1. Every story points at an item we actually gathered for that district (its url).
2. The quote is really in that item's text, or in the raw official file named by quote_file.
3. Every number in the headline, body and meaning lines appears in the quote, the item title
   or the item date. No number of our own making gets through: no sums, differences, shares.
4. No party names, no politicians' names, no em dash, en dash or double dash.
5. A Telugu name that ends in a virama gets a ZWNJ before the suffix "లో" (warning only).

Usage: python3 scripts/check_editorial.py [slug ...]   (no slug: every file in editorial/)
Exit code 1 when any story fails, so the build can refuse to run on a bad file.
"""
import json
import os
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ED = SITE / 'editorial'
POOL = ED / 'pool'
# The gathered sweep is not in git (it holds raw PDFs). Point AP_GATHER at an unpacked copy.
GATHER = Path(os.environ.get('AP_GATHER', SITE.parent / 'gather/district_happenings'))
RAW = GATHER / 'raw'
ITEMS = GATHER / 'items.json'

TEXT_FIELDS = ('head_en', 'head_te', 'en', 'te', 'mean_en', 'mean_te', 'kicker_en', 'kicker_te')
REQUIRED = ('id', 'kicker_en', 'kicker_te', 'head_en', 'head_te', 'en', 'te', 'date', 'source_en', 'source_te', 'url', 'quote')
# Party names and dashes are refused anywhere in the text. Politicians' names are refused as
# whole words only, so a town such as Jangareddygudem is not caught by a surname.
BANNED = [
    'TDP', 'YSRCP', 'YSR Congress', 'Janasena', 'Jana Sena', 'BJP', 'Congress', 'Telugu Desam', 'Shri ', 'Smt', "Hon'ble",
    'తెలుగుదేశం', 'వైఎస్సార్‌సీపీ', 'వైఎస్ఆర్ కాంగ్రెస్', 'జనసేన', 'బీజేపీ', 'కాంగ్రెస్',
    '—', '–', '--',
]
NAMES_EN = re.compile(r'\b(Naidu|Chandrababu|Jagan|Pawan|Kalyan|Lokesh|Modi|Vaishnaw|Nadda|Rammohan|Reddy)\b', re.I)
NAMES_TE = ('నాయుడు', 'చంద్రబాబు', 'జగన్', 'పవన్', 'లోకేష్', 'మోదీ', 'రెడ్డి')


def banned_in(v: str) -> list[str]:
    hits = [b for b in BANNED if b.lower() in v.lower()]
    hits += [m.group(0) for m in NAMES_EN.finditer(v)]
    hits += [t for t in re.split(r'[\s,.:;()]+', v) if t.startswith(NAMES_TE)]
    return hits
NUM = re.compile(r'\d[\d,]*(?:\.\d+)?')


def norm(s: str) -> str:
    return re.sub(r'\s+', ' ', (s or '').replace('‌', '')).strip().lower()


def nums(s: str) -> set[str]:
    out = set()
    for m in NUM.findall(s or ''):
        v = m.replace(',', '').rstrip('.')
        if '.' in v:
            v = v.rstrip('0').rstrip('.') or '0'
        out.add(v.lstrip('0') or '0')
    return out


def check(slug: str, by_url: dict) -> tuple[list[str], list[str]]:
    errs, warns = [], []
    f = ED / f'{slug}.json'
    if not f.exists():
        return [f'{slug}: no editorial file'], []
    doc = json.loads(f.read_text())
    pool = json.loads((POOL / f'{slug}.json').read_text())
    district = pool['district']
    if doc.get('district') != district:
        errs.append(f'{slug}: district field {doc.get("district")!r} is not {district!r}')
    ids = set()
    for st in doc.get('lead', []):
        sid = st.get('id', '?')
        tag = f'{slug}/{sid}'
        for k in REQUIRED:
            if not st.get(k):
                errs.append(f'{tag}: missing {k}')
        if sid in ids:
            errs.append(f'{tag}: duplicate id')
        ids.add(sid)
        # Several items can share one url (a listing page, one Lok Sabha answer with two tables),
        # so the quote may come from any item gathered for this district under that url.
        srcs = by_url.get((district, st.get('url')))
        if not srcs:
            errs.append(f'{tag}: url is not an item gathered for {district}')
            continue
        hay = ' '.join(norm(x.get('title', '') + ' ' + (x.get('summary') or '')) for x in srcs)
        if st.get('quote_file'):
            qf = (RAW / st['quote_file']).resolve()
            if not str(qf).startswith(str(RAW.resolve())) or not qf.exists():
                errs.append(f'{tag}: quote_file {st["quote_file"]!r} not found under raw/')
            else:
                hay += ' ' + norm(qf.read_text(errors='ignore'))
        q = st.get('quote', '')
        if norm(q) not in hay:
            errs.append(f'{tag}: quote not found in the item text or quote_file')
        allowed = nums(q) | nums(st.get('date', ''))
        for x in srcs:
            allowed |= nums(x.get('title', '')) | nums(x.get('date', ''))
        allowed |= {str(int(x)) for x in (st.get('date') or '0-0-0').split('-') if x.isdigit()}
        for k in TEXT_FIELDS:
            v = st.get(k) or ''
            extra = nums(v) - allowed
            if extra:
                errs.append(f'{tag}: {k} has numbers not in the quote or title: {sorted(extra)}')
            for b in banned_in(v):
                errs.append(f'{tag}: {k} contains banned text {b!r}')
            if k.endswith('_te') or k == 'te':
                for m in re.finditer(r'(\S*[^ల\s])్లో', v):
                    warns.append(f'{tag}: {k} "{m.group(0)}" may need a ZWNJ before లో')
        for k in ('source_en', 'source_te'):
            for b in banned_in(st.get(k) or ''):
                errs.append(f'{tag}: {k} contains banned text {b!r}')
        if len(st.get('head_en', '')) > 90:
            warns.append(f'{tag}: English headline over 90 characters')
    n = len(doc.get('lead', []))
    if n == 0 and not doc.get('none_reason_en'):
        errs.append(f'{slug}: no lead stories and no none_reason_en')
    return errs, warns


def main() -> int:
    items = json.loads(ITEMS.read_text())
    by_url: dict = {}
    for i in items:
        by_url.setdefault((i['district'], i['url']), []).append(i)
    slugs = sys.argv[1:] or sorted(p.stem for p in ED.glob('*.json'))
    bad = 0
    for s in slugs:
        e, w = check(s, by_url)
        for x in w:
            print('warn ', x)
        for x in e:
            print('FAIL ', x)
        bad += len(e)
        if not e:
            print(f'ok    {s}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
