"""What is happening in each district: pages 1 to 3 of the district paper (board 11).

Writes src/data/happenings.json from three inputs:

1. site/editorial/<slug>.json: hand-written lead stories. The build refuses to run unless
   scripts/check_editorial.py passes for every file, so a story with a number that is not in
   its official quote can never reach the page.
2. Four Lok Sabha tables that print a row for every district (rural houses, village health
   centres, tap connections, company internships). These are parsed here straight from the
   answer text, not from the gathered items, because the gathered rows missed districts printed
   as "Y.S.R." and "Visakhapatanam" and flattened the three internship rounds into one.
   Each table must reproduce the printed Total in every column before it is used. That sum is
   a check only; no total, share or difference of ours is ever shown.
3. gather/district_happenings/items.json: collectorate notices (jobs, tenders, announcements,
   press releases), PIB releases and the list of Lok Sabha answers that name the district.
   Merit, selection and seniority lists are counted and linked, never shown, because they
   carry people's names.

Numbers stay as printed. Indian digit grouping is added to plain integers only for reading.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
# The gathered sweep is not in git (it holds raw PDFs). Point AP_GATHER at an unpacked copy,
# e.g. sources/gather/district_happenings after extracting the gather bundle.
GATHER = Path(os.environ.get('AP_GATHER', SITE.parent / 'gather/district_happenings'))
LS = GATHER / 'raw/ls/pdf'
OUT = SITE / 'src/data/happenings'   # index.json plus one file per district, loaded only when that paper opens

_DI = json.loads((SITE / 'src/data/districts.json').read_text())['items']
D28 = [d['name'] for d in _DI]
SLUG = {d['name']: d['slug'] for d in _DI}
TE = {d['name']: d['te'] for d in _DI}
NEW_2026 = {'Markapuram': 'Prakasam', 'Polavaram': 'Alluri Sitharama Raju'}
WINDOW = ('2026-07-01', '2026-10-21')
HOST = {a: b for a, b in (ln.split('|') for ln in (GATHER / 'hosts.txt').read_text().splitlines() if '|' in ln)}
BAN_FROM = '2026-07-13'   # state Finance memo of 6 July 2026 stops fresh recruitment from this day
MONTH_TE = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

# How each table spells today's districts. A row we cannot place stops the build.
SPELL = {
    'Alluri Sitharama Raju': [r'Alluri Sitharama Raju', r'Alluri Sitharama'],
    'Anakapalli': [r'Anakapalli'],
    'Ananthapuramu': [r'Ananthapuramu', r'Anantapur'],
    'Annamayya': [r'Annamayya'],
    'Bapatla': [r'Bapatla'],
    'Chittoor': [r'Chittoor'],
    'Dr. B.R. Ambedkar Konaseema': [r'Dr\. B\.R\. Ambedkar Konaseema', r'Dr\. B\.R\. Ambedkar', r'Konaseema'],
    'East Godavari': [r'East Godavari'],
    'Eluru': [r'Eluru'],
    'Guntur': [r'Guntur'],
    'Kakinada': [r'Kakinada'],
    'Krishna': [r'Krishna'],
    'Kurnool': [r'Kurnool'],
    'Markapuram': [r'Markapuram'],
    'Nandyal': [r'Nandyal'],
    'NTR': [r'NTR', r'Ntr'],
    'Palnadu': [r'Palnadu'],
    'Parvathipuram Manyam': [r'Parvathipuram Manyam', r'Parvathipuram'],
    'Polavaram': [r'Polavaram'],
    'Prakasam': [r'Prakasam'],
    'Sri Potti Sriramulu Nellore': [r'Sri Potti Sriramulu Nellore', r'Sri Potti Sriramulu', r'Spsr Nellore', r'Nellore'],
    'Sri Sathya Sai': [r'Sri Sathya Sai'],
    'Srikakulam': [r'Srikakulam'],
    'Tirupati': [r'Tirupati'],
    'Visakhapatnam': [r'Visakhapatnam', r'Visakhapatanam'],
    'Vizianagaram': [r'Vizianagaram'],
    'West Godavari': [r'West Godavari'],
    'YSR Kadapa': [r'Y\.S\.R\.?'],
}
N = r'(\d[\d,]*)'


def ind(v: int) -> str:
    s = str(v)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ','.join(parts + [tail])


def date_en(d: str) -> str:
    y, m, dd = d.split('-')
    return f'{int(dd)} {MONTH_EN[int(m) - 1]} {y}'


def date_te(d: str) -> str:
    y, m, dd = d.split('-')
    return f'{int(dd)} {MONTH_TE[int(m) - 1]} {y}'


def table(path: Path, start: str, end: str, ncols: int, expect: set[str]) -> dict[str, list[int]]:
    """Rows of one printed table, keyed by today's district name.

    The block from `start` to the next `end` is joined into one line, because district names
    wrap over two lines in these PDFs and a stray value can land on the next line. Each
    district is then found by its spelling followed by exactly `ncols` numbers (a serial number
    that wrapped into the middle of a name, as in "Alluri Sitharama 6 Raju", is allowed). The printed
    Total row must equal the column sums, or the table is refused.
    """
    text = path.read_text(errors='ignore')
    i = text.index(start)
    j = text.index(end, i)
    block = re.sub(r'\s+', ' ', text[i:j + len(end) + 120])
    rows: dict[str, list[int]] = {}
    for d, spells in SPELL.items():
        for sp in spells:
            m = re.search(r'(?<![A-Za-z])' + sp + r'(?![A-Za-z])' + r'(?: \d{1,2}(?= [A-Za-z]))?(?: [A-Za-z.]+){0,2}?' + (r'\s+' + N) * ncols, block)
            if m:
                rows[d] = [int(x.replace(',', '')) for x in m.groups()]
                break
    if set(rows) != expect:
        raise SystemExit(f'{path.name} {start!r}: rows {sorted(set(rows) ^ expect)} differ from the expected districts')
    tm = re.search(r'(?:Total|TOTAL)' + (r'\s+' + N) * ncols, block)
    if not tm:
        raise SystemExit(f'{path.name} {start!r}: no Total row')
    total = [int(x.replace(',', '')) for x in tm.groups()]
    sums = [sum(r[k] for r in rows.values()) for k in range(ncols)]
    if sums != total:
        raise SystemExit(f'{path.name} {start!r}: rows sum to {sums}, printed Total is {total}')
    return rows


D26 = set(D28) - set(NEW_2026)


def standard() -> dict[str, dict]:
    houses = table(LS / 'LS18-8_U3685.txt', 'Sanctioned Completed Occupied', 'Total', 3, set(D28))
    aam = table(LS / 'LS18-8_U2274.txt', 'Ayushman Arogya Mandirs Operational', 'Total', 1, D26)
    taps = table(LS / 'LS18-8_U841.txt', 'Progress of Household Tap connections in Andhra Pradesh', 'Page 14 of 14', 3, D26)
    r1 = table(LS / 'LS18-8_U1213.txt', 'in Round I are as under', 'TOTAL', 3, D26)
    r2 = table(LS / 'LS18-8_U1213.txt', 'in Round II are as under', 'TOTAL', 3, D26)
    r3 = table(LS / 'LS18-8_U1213.txt', 'in Round III* (as on', 'TOTAL', 3, D26 | {'Markapuram'})
    urls = {}
    items = json.loads((GATHER / 'items.json').read_text())
    for key, q in (('houses', 'Q.No.3685:'), ('aam', 'Q.No.2274:'), ('taps', 'Q.No.841:'), ('intern', 'Q.No.1213:')):
        urls[key] = next(i['url'] for i in items if q in i['title'])

    out: dict[str, dict] = {}
    for d in D28:
        reads = d if d in D26 else NEW_2026[d]
        p_en = f' This table is on the 26-district map, so the figure is for {reads} district, which then included {d}.' if reads != d else ''
        p_te = f' ఈ పట్టిక 26 జిల్లాల పటం ప్రకారం; అందుకే ఇది {TE[reads]} జిల్లా అంకె, అప్పట్లో {TE[d]} అందులోనే ఉంది.' if reads != d else ''
        s: dict = {}
        h = houses[d]
        s['houses'] = {
            'kind': 'houses', 'kicker_en': 'Homes', 'kicker_te': 'ఇళ్లు',
            'head_en': f'{ind(h[0])} village houses sanctioned since 2016', 'head_te': f'2016 నుంచి గ్రామాల్లో {ind(h[0])} ఇళ్లు మంజూరు',
            'en': f'Under the Centre\'s rural housing scheme, {ind(h[0])} houses were sanctioned in our district from 1 April 2016. Of these, {ind(h[1])} are completed and {ind(h[2])} have people living in them.',
            'te': f'కేంద్ర గ్రామీణ గృహ పథకం కింద 1 ఏప్రిల్ 2016 నుంచి మన జిల్లాలో {ind(h[0])} ఇళ్లు మంజూరయ్యాయి. వీటిలో {ind(h[1])} పూర్తయ్యాయి; {ind(h[2])} ఇళ్లలో ప్రజలు ఉంటున్నారు.',
            'source_en': 'Lok Sabha, unstarred question 3685, 11 August 2026', 'source_te': 'లోక్‌సభ, ప్రశ్న 3685, 11 ఆగస్టు 2026',
            'url': urls['houses'], 'date': '2026-08-11',
        }
        a = aam[reads][0]
        s['health'] = {
            'kind': 'health', 'kicker_en': 'Health', 'kicker_te': 'ఆరోగ్యం',
            'head_en': f'{ind(a)} village health centres are working' if reads == d else f'{ind(a)} village health centres in {reads} district, which included us',
            'head_te': f'{ind(a)} గ్రామ ఆరోగ్య కేంద్రాలు పనిచేస్తున్నాయి' if reads == d else f'{TE[reads]} జిల్లాలో (మనం అప్పుడు అందులో) {ind(a)} గ్రామ ఆరోగ్య కేంద్రాలు',
            'en': f'{ind(a)} health centres that give basic care close to home were working on 30 June 2026.{p_en}',
            'te': f'ఇంటికి దగ్గర్లో ప్రాథమిక వైద్యం ఇచ్చే {ind(a)} ఆరోగ్య కేంద్రాలు 30 జూన్ 2026 నాటికి పనిచేస్తున్నాయి.{p_te}',
            'source_en': 'Lok Sabha, unstarred question 2274, 31 July 2026', 'source_te': 'లోక్‌సభ, ప్రశ్న 2274, 31 జూలై 2026',
            'url': urls['aam'], 'date': '2026-07-31',
        }
        t = taps[reads]
        s['taps_july'] = {
            'date': '2026-07-20', 'rural': t[0], 'with_tap': t[1], 'yet': t[2], 'reads': reads,
            'source_en': 'Lok Sabha, unstarred question 841, 23 July 2026', 'source_te': 'లోక్‌సభ, ప్రశ్న 841, 23 జూలై 2026',
            'url': urls['taps'], 'note_en': p_en.strip(), 'note_te': p_te.strip(),
        }
        rounds = []
        for label_en, label_te, tb, as_on in (('Round I', 'విడత 1', r1, None), ('Round II', 'విడత 2', r2, None), ('Round III', 'విడత 3', r3, '15 July 2026')):
            who = d if d in tb else reads
            v = tb[who]
            rounds.append({'en': label_en, 'te': label_te, 'offers': v[0], 'accepted': v[1], 'joined': v[2], 'reads': who, 'as_on': as_on})
        lines_en = [f'{r["en"]}{" (still going on, as on 15 July 2026)" if r["as_on"] else ""}: {ind(r["offers"])} offers, {ind(r["accepted"])} accepted, {ind(r["joined"])} joined{"" if r["reads"] == d else f" ({r['reads']} district)"}.' for r in rounds]
        lines_te = [f'{r["te"]}{" (ఇంకా జరుగుతోంది, 15 జూలై 2026 నాటికి)" if r["as_on"] else ""}: {ind(r["offers"])} ఆఫర్లు, {ind(r["accepted"])} మంది ఒప్పుకున్నారు, {ind(r["joined"])} మంది చేరారు{"" if r["reads"] == d else f" ({TE[r['reads']]} జిల్లా)"}.' for r in rounds]
        s['intern'] = {
            'kind': 'intern', 'kicker_en': 'Youth', 'kicker_te': 'యువత',
            'head_en': 'Internships in companies: three rounds', 'head_te': 'కంపెనీల్లో ఇంటర్న్‌షిప్: మూడు విడతలు',
            'en': 'Under the Centre\'s internship scheme, companies offer young people paid places. ' + ' '.join(lines_en),
            'te': 'కేంద్ర ఇంటర్న్‌షిప్ పథకం కింద కంపెనీలు యువతకు స్టైపెండ్‌తో అవకాశాలు ఇస్తాయి. ' + ' '.join(lines_te),
            'rounds': rounds,
            'source_en': 'Lok Sabha, unstarred question 1213, 27 July 2026', 'source_te': 'లోక్‌సభ, ప్రశ్న 1213, 27 జూలై 2026',
            'url': urls['intern'], 'date': '2026-07-27',
        }
        out[d] = s
    return out


PERSONAL = 'personal records'


def feed() -> dict[str, dict]:
    items = json.loads((GATHER / 'items.json').read_text())
    out: dict[str, dict] = {d: {'jobs': [], 'tenders': [], 'announcements': [], 'press': [], 'events': [], 'lists': [], 'pib': [], 'parliament': []} for d in D28}
    for i in items:
        d = i['district']
        if d not in out:
            raise SystemExit(f'unknown district {d!r} in items.json')
        if not (WINDOW[0] <= (i.get('date') or '') <= WINDOW[1]):
            continue
        f = out[d]
        base = {'date': i['date'], 'title': i['title'].strip(), 'url': i['url']}
        if i['source'] == 'district site':
            if PERSONAL in (i.get('summary') or ''):
                f['lists'].append(base)
                continue
            cat = i['category']
            if cat == 'recruitment':
                posts = [{'label': x['label'].replace('Posts: ', ''), 'value': x['value']} for x in (i.get('figures') or []) if str(x.get('label', '')).startswith('Posts')]
                f['jobs'].append({**base, 'date_end': i.get('date_end'), 'posts': posts, 'after_ban': i['date'] >= BAN_FROM, 'file_url': i.get('file_url')})
            elif cat == 'tender':
                f['tenders'].append({**base, 'date_end': i.get('date_end')})
            elif cat == 'press release':
                f['press'].append(base)
            elif cat == 'event':
                f['events'].append(base)
            else:
                f['announcements'].append(base)
        elif i['source'] == 'PIB':
            f['pib'].append({**base, 'ministry': i.get('ministry'), 'places': i.get('places_as_printed') or []})
        else:
            m = re.match(r'(Starred|Unstarred) Q\.No\.(\d+):\s*(.*)', base['title'])
            kind, no, subject = (m.group(1), m.group(2), m.group(3)) if m else ('', '', base['title'])
            f['parliament'].append({**base, 'starred': kind == 'Starred', 'no': no, 'subject': subject})
    for f in out.values():
        for k in f:
            f[k].sort(key=lambda x: x['date'], reverse=True)
        # One Lok Sabha answer can carry two tables that both name the district; list it once.
        seen, uniq = set(), []
        for p in f['parliament']:
            if p['url'] not in seen:
                seen.add(p['url'])
                uniq.append(p)
        f['parliament'] = uniq
    return out


def main() -> int:
    r = subprocess.run([sys.executable, str(HERE / 'check_editorial.py')], capture_output=True, text=True)
    if r.returncode:
        print(r.stdout)
        raise SystemExit('editorial check failed; fix the stories before building')
    std = standard()
    fd = feed()
    districts = {}
    for d in D28:
        ed = json.loads((SITE / 'editorial' / f'{SLUG[d]}.json').read_text())
        lead = [{k: v for k, v in st.items() if k not in ('quote', 'quote_file')} for st in ed.get('lead', [])]
        f = fd[d]
        site_n = sum(len(f[k]) for k in ('jobs', 'tenders', 'announcements', 'press', 'events', 'lists'))
        districts[d] = {
            'lead': lead, 'standard': std[d], 'feed': f, 'host': HOST[d],
            'counts': {'site': site_n, 'pib': len(f['pib']), 'parliament': len(f['parliament']), 'lists': len(f['lists'])},
            'thin': site_n <= 3,
            'none_reason_en': ed.get('none_reason_en'), 'none_reason_te': ed.get('none_reason_te'),
        }
    doc = {
        'window': {'from': WINDOW[0], 'to': WINDOW[1], 'from_en': date_en(WINDOW[0]), 'to_en': date_en(WINDOW[1]), 'from_te': date_te(WINDOW[0]), 'to_te': date_te(WINDOW[1])},
        'session': {'from': '2026-07-20', 'to': '2026-08-12'},
        'ban': {'from': BAN_FROM, 'memo': '2026-07-06'},
        'districts': districts,
    }
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for d, v in districts.items():
        (OUT / f'{SLUG[d]}.json').write_text(json.dumps(v, ensure_ascii=False, separators=(',', ':')))
    index = {k: v for k, v in doc.items() if k != 'districts'}
    index['counts'] = {d: {**v['counts'], 'lead': len(v['lead']), 'thin': v['thin']} for d, v in districts.items()}
    (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    n_lead = sum(len(v['lead']) for v in districts.values())
    size = sum(f.stat().st_size for f in OUT.glob('*.json')) // 1024
    print(f'wrote {OUT.relative_to(SITE)}/: {len(districts)} district files, {n_lead} lead stories, {size} KB in all')
    for d, v in districts.items():
        c = v['counts']
        print(f'  {d:30} lead {len(v["lead"]):2}  site {c["site"]:3}  pib {c["pib"]:3}  ls {c["parliament"]:3}{"  THIN" if v["thin"] else ""}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
