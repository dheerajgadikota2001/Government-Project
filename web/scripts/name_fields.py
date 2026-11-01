"""Reader-facing fields for every project, worked out once from the name as the paper printed it.

WHY THIS EXISTS
The names come from government papers. They are long, often in CAPITALS, sometimes split in the
middle of a word ("Jangareddygu dem") and carry the place at the end. Search results and browser
tabs cut them, which lost the one word people search for (project 601 lost JUNCTION).

Each project gets four extra fields. The printed name `t` is never changed or removed.

    cn   a clean name to show: spacing, capitals and split words fixed, nothing reworded
    pl   the place a reader would search with: a town from the state's list, else the district
    plt  that place in Telugu, only when it is in towns_te.json or districts.json (the owner
         approved those lists); otherwise absent and the page keeps the English place
    wk   a short plain description of the work, taken from the name
    rt   for a road or rail work with no town: its two ends, 'Mallapalle to Kavulakuntla'
    sb   for a named pond or tank, its name: 'Mala Kunta Cheruvu'
    rd   for a road with no town and no stated ends: its highway number, 'NH-365BG'
    hc   for any other work with no place: the start of the name, cut at a whole word

Only these edits are made to a printed name, and each is listed so the owner can see them:
  FIXES   one-word spelling fixes the owner approved
  JOINS   words a paper split in two, joined when the joined word is a known place
Nothing else is reworded. A name that cannot be improved safely is shown as printed, cleaned
for spacing and capitals only.

Run from the site folder:  python3 scripts/name_fields.py   (writes src/data/projects.json in place)
It is safe to run twice: it recomputes the fields from `t` each time.
"""
import json
import re
import sys
import unicodedata

DATA = 'src/data'

# ---- the edits the owner approved. Anything not here stays as printed.
FIXES = {
    r'\bPanchayath\b': 'Panchayat',
    r'\bNagara Panchayat\b': 'Nagar Panchayat',
    r'\bNagara Palaka\b': 'Nagar Palika',
    r'\bBoby\b': 'Body',
    r'\bdivertion\b': 'diversion',
    r'\bfacilites\b': 'facilities',
    r'\bStrengthing\b': 'Strengthening',
    r'\{': '[',
    r',,': ',',
    r'\bnetworkat\b': 'network at',
    r'\bMorampudiD-Block\b': 'Morampudi D-Block',
    r'\bUNits\b': 'Units',
    r'\bMUnicipal\b': 'Municipal',
    r'\bLIghting\b': 'Lighting',
    r'\bMAcherla\b': 'Macherla',
}

ACRONYMS = {
    'ELSR', 'GLSR', 'GVMC', 'ULB', 'APTIDCO', 'AMRUT', 'NH', 'SH', 'KM', 'KL', 'MLD', 'TMT', 'AC',
    'CI', 'DI', 'PB', 'NR', 'EPC', 'HDPE', 'PVC', 'RCC', 'MGNREGS', 'APIIC', 'APSRTC', 'AP', 'VGF',
    'PPP', 'BOT', 'JSW', 'ONGC', 'HPCL', 'BPCL', 'IOCL', 'GAIL', 'APSEZ', 'SEZ', 'UD', 'MC', 'ROB',
    'RUB', 'LHS', 'RHS', 'CC', 'BT', 'WBM', 'GSB', 'DBM', 'BC', 'PMGSY', 'APCRDA', 'CRDA', 'VUDA',
    'GMC', 'KMC', 'NMC', 'TUDA', 'HQ', 'MW', 'KV', 'EHT', 'LT', 'HT', 'OHSR', 'GLR', 'SSR', 'MSR',
    'MBR', 'NTR', 'YSR', 'STP', 'STPS', 'WTP', 'ETP', 'CETP', 'GW', 'MW', 'REZ', 'SPV', 'PS', 'IV',
    'II', 'III', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'PWD', 'APIDC', 'DPR', 'PKG', 'PKG.', 'CFL',
    'NCC', 'TN', 'AP', 'TG', 'GOI', 'MoSPI', 'HVDC', 'LNG', 'FSRU', 'IT', 'AI', 'LED', 'HPCL', 'VUPS', 'VUP', 'ESR',
}
SMALL = {'to', 'of', 'in', 'at', 'and', 'for', 'the', 'from', 'on', 'by', 'with', 'via', 'a', 'an',
         'or', 'under', 'near', 'through', 'into', 'as', 'per'}


def _norm(s):
    return re.sub(r'[^a-z]', '', s.lower())


def _caps_ratio(s):
    a = [c for c in s if c.isalpha()]
    return (sum(c.isupper() for c in a) / len(a)) if a else 0.0


def _title_word(w):
    core = re.sub(r'[^A-Za-z]', '', w)
    if not core:
        return w
    if core.upper() in ACRONYMS or re.search(r'\d', w):
        return w.upper() if core.upper() in ACRONYMS else w
    return w[:1].upper() + w[1:].lower()


def _title_case(name):
    out = []
    for i, tok in enumerate(name.split(' ')):
        parts = re.split(r'([/\-&,;:()\[\]]+)', tok)
        conv = []
        for s in parts:
            if not s or re.fullmatch(r'[/\-&,;:()\[\]]+', s):
                conv.append(s)
            elif i > 0 and s.lower() in SMALL:
                conv.append(s.lower())
            else:
                conv.append(_title_word(s))
        out.append(''.join(conv))
    return ' '.join(out)


def load_places():
    towns = json.load(open(f'{DATA}/towns_te.json', encoding='utf-8'))
    dist = {d['name']: d['te'] for d in json.load(open(f'{DATA}/districts.json', encoding='utf-8'))['items']}
    return towns, dist


# A few places a paper prints in a different spelling from the state's list.
ALIASES = {
    'gurazala': 'Gurajala', 'giddaluru': 'Giddalur', 'chittor': 'Chittoor', 'nuzivid': 'Nuzvid',
    'jaggayyapeta': 'Jaggiahpet', 'jaggaiahpet': 'Jaggiahpet', 'rajamahendravaram': 'Rajahmundry',
    'madanapalle': 'Madanapalli', 'palakollu': 'Palacole', 'kadapa': 'Cuddapah',
    'chilakaluripet': 'Chilakaluripeta', 'akividu': 'Akiveedu', 'ichchapuram': 'Ichapuram',
    'ponnur': 'Ponnuru', 'rayachoty': 'Rayachoti', 'sullurpeta': 'Sullurupeta',
    'vishakhapatnam': 'Visakhapatnam', 'visakhapatnam': 'Visakhapatnam', 'vizag': 'Visakhapatnam',
}


def clean_name(raw, joins):
    n = re.sub(r'\s+', ' ', raw).strip()
    n = re.sub(r'\(\s+', '(', n)
    n = re.sub(r'\s+\)', ')', n)
    n = re.sub(r'\s+([,;:.])', r'\1', n)
    n = re.sub(r'([,;:])(?=[A-Za-z])', r'\1 ', n)
    n = re.sub(r'(?<=[a-z])\((?=[A-Z0-9])', ' (', n)
    n = re.sub(r'\s+[—–]\s+', ', ', n)
    n = re.sub(r'\.+$', '', n).strip()
    n = re.sub(r'\s\?\s', ' - ', n)          # a dash that the paper's font turned into "?"
    for a, b in joins:
        n = re.sub(re.escape(a), b, n)
    if _caps_ratio(n) > 0.6:
        n = _title_case(n)
    for pat, rep in FIXES.items():
        n = re.sub(pat, rep, n)
    n = re.sub(r'\bnagar (?=Panchayat)', 'Nagar ', n)
    # a few CAPITAL words inside a mixed-case name ("Rejuvenation of BANDAR CANAL")
    n = re.sub(r"\b[A-Z]{4,}\b", lambda m: m.group(0) if m.group(0) in ACRONYMS else m.group(0).capitalize(), n)
    # a lower-case pond or tank name ("telukulavani cheruvu")
    n = re.sub(r"\b([a-z][a-z']+)(?= (?:cheruvu|kunta|koneru)\b)", lambda m: m.group(1).capitalize(), n)
    n = re.sub(r"\b(cheruvu|kunta|koneru)\b", lambda m: m.group(1).capitalize(), n)
    if n and n[0].islower():
        n = n[0].upper() + n[1:]
    return n


# Splits of village names that are not on the state's town list, found by reading the names.
EXTRA_JOINS = {('Purushottapa tnam', 'Purushottapatnam')}


def find_joins(projects, towns):
    """Words a paper split ('Jangareddygu dem'): two adjacent words whose join is a known town."""
    names = set(towns)
    wanted = {_norm(t): t for t in names}
    wanted.update({k: v for k, v in ALIASES.items()})
    joins = set()
    for p in projects:
        words = re.sub(r'\s+', ' ', p['t']).split(' ')
        for i in range(len(words) - 1):
            a, b = words[i], words[i + 1]
            if a.isalpha() and b.isalpha() and len(a) >= 4 and len(b) <= 6 and _norm(a + b) in wanted and _norm(a) not in {_norm(t) for t in names} and (b[:1].islower() or a.isupper()):
                joins.add((f'{a} {b}', a + b))
    joins.update(EXTRA_JOINS)
    return sorted(joins)


def place_of(raw, district, towns, dist):
    """Most specific place a reader would search with, and where it came from."""
    # the place a paper puts after a dash at the end: "... Bund - Nellore"
    m = re.search(r'\s[—–-]\s*([A-Za-z .]+)$', raw)
    tail = m.group(1).strip() if m else None
    hay = _norm(re.sub(r'\s+', ' ', raw))
    cand = []
    for t in towns:
        k = _norm(t)
        if k and k in hay:
            cand.append((hay.find(k), -len(k), t))
    for al, canon in ALIASES.items():
        if al in hay and canon in towns:
            cand.append((hay.find(al), -len(al), canon))
    if tail:
        for t in towns:
            if _norm(t) == _norm(tail):
                return t
        if _norm(tail) in {_norm(d) for d in dist}:
            return next(d for d in dist if _norm(d) == _norm(tail))
    if cand:
        cand.sort(key=lambda c: (c[1], c[0]))
        return cand[0][2]
    if district and district in dist:
        return district
    return None


DISPLAY_PLACE = {'Ysr Tadigadapa': 'Tadigadapa', 'Sri Potti Sriramulu Nellore': 'Nellore',
                 'Vizianagaram Municipal Corporation': 'Vizianagaram',
                 'Machilipatnam Municipal Corporation': 'Machilipatnam', 'Dhone(M)': 'Dhone'}


# Plain descriptions of the work, first match wins. Taken only from words the name itself holds.
KINDS = [
    (r'refinery|petro|\bLNG\b|FSRU|bitumen', 'oil and gas works'),
    (r'highway|\bNH[- ]?\d|\bSH[- ]?\d|widening|\bgreenfield\b|\b\d+L\b|\blanes?\b|\bkm\b|bypass|flyover', 'road works'),
    (r'water supply|drinking water|water works|internal water|\bWTP\b|treated water|pipeline', 'water supply'),
    (r'rejuvenation|cheruvu|\bkunta\b|water ?body|\btanks?\b|\bbund\b', 'water body works'),
    (r'\bSTPs?\b|sewage|sewerage|underground drainage|\bUGD\b', 'sewage works'),
    (r'\bdrains?\b|drainage', 'drains'),
    (r'solid waste|garbage|landfill', 'waste works'),
    (r'transmission|substation|\bPS\b|\bREZ\b|\bHVDC\b|transformer', 'power lines'),
    (r'\bsolar\b|\bwind\b|pump(ed)? storage|renewable|hydro|thermal', 'power plant'),
    (r'\brail|\bROB\b|\bRUB\b|doubling|electrification|metro', 'railway works'),
    (r'airport|runway', 'airport works'),
    (r'\bports?\b|harbour|jetty|berth', 'port works'),
    (r'bypass|bridge|flyover|widening|\blanes?\b|\bNH[- ]?\d|\bSH[- ]?\d|highway|\broad\b|\bkm\b', 'road works'),
    (r'\bpark\b|market|building|stadium|auditorium|library|bus stand', 'public building'),
    (r'school|college|university|hostel', 'education works'),
    (r'hospital|health|medical', 'health works'),
    (r'housing|colony|houses', 'housing'),
    (r'canal|reservoir|barrage|\bdam\b|lift irrigation|irrigation', 'irrigation works'),
    (r'\bSEZ\b|industrial|cluster|factory', 'industrial project'),
]


def kind_of(raw, ty):
    for pat, label in KINDS:
        if re.search(pat, raw, re.I):
            return label
    return {
        'roads': 'road works', 'railways': 'railway works', 'irrigation': 'irrigation works',
        'urban_development': 'urban works', 'power': 'power works', 'airports': 'airport works',
        'ports': 'port works', 'industrial': 'industrial project', 'it_tech': 'technology project',
        'education': 'education works', 'health': 'health works',
    }.get(ty, 'public work')


# ---- the two ends of a road or rail work, when the name states them in words
_NAME = r"[A-Za-z][A-Za-z.'\u2019]*(?: [A-Za-z][A-Za-z.'\u2019]*){0,3}"
_CH = r"(?: (?:Ch|Km|KM|km)\.? ?[\d.+/]+)*"
_GENERIC = {'rehabilitation', 'construction', 'providing', 'widening', 'upgradation', 'strengthening',
            'improvement', 'development', 'modernisation', 'doubling', 'laying', 'construction'}


def route_of(cn):
    """'Mallapalle to Kavulakuntla' from '... from Mallapalle Ch. 176000 to Kavulakuntla Ch. ...'.
    Returns None unless both ends are plain place words, so nothing is guessed."""
    m = re.search(rf"\bfrom ({_NAME}){_CH} to ({_NAME}){_CH}(?= of | in | section|\s*\(|,|$|\s+\d|\s+Km|\s+KM|\s+NH|\s+Pkg|\s+Package)", cn)
    if not m:
        m = re.match(rf"^({_NAME}) to ({_NAME})(?= from| via| section| of |\s+[Kk][Mm]|\s+\d|\s*\(|,|$)", cn)
    if not m:
        return None
    a, b = m.group(1).strip(), m.group(2).strip()
    bad = lambda w: w.split(' ')[0].lower() in _GENERIC or re.match(r'(km|ch)\b', w, re.I)
    if bad(a) or bad(b) or len(a) < 3 or len(b) < 3:
        return None
    tidy = lambda w: re.sub(r"(?:\s+(?:Ch|Km|KM|km|NH|SH|Design|Chainage|Section|of|Pkg|Package)\.?)+$", '', w).strip()
    a, b = tidy(a), tidy(b)
    if len(a) < 3 or len(b) < 3:
        return None
    return f'{a} to {b}'


def head_core(cn, limit=48):
    """The start of a name, cut where the numbers and chainages begin and at a whole word."""
    s = re.split(r"\s(?:from (?:Km|KM|km|Design|Ch)|Design (?:km|Km|KM|Chainage)|of NH|with (?:a )?capacity| of capacity|Ch\.|Km\.? ?\d|KM ?\d|\(|\[|Phase|Pkg|Package)", cn)[0].strip(' ,;:-')
    if len(s) <= limit:
        return s
    out = ''
    for w in s.split(' '):
        t = (out + ' ' + w) if out else w
        if len(t) > limit:
            break
        out = t
    out = re.sub(r"[\s,;:\-]+$", '', out)
    out = re.sub(r"\s(?:to|of|and|for|in|at|from|the|with|by|on)$", '', out, flags=re.I)
    return out


def water_body(cn, place):
    """'Mala Kunta Cheruvu' from 'Rejuvenation of Mala Kunta Cheruvu in ...'. Only a named pond, tank or lake;
    anything less sure returns None and the title says 'water body works'."""
    m = re.search(r"((?:\b[A-Za-z'.]+\s){1,3}(?:Cheruvu|Kunta|Koneru|Pond|Tank|Lake))\b", cn)
    if not m:
        return None
    s = m.group(1).strip()
    for _ in range(4):
        s = re.sub(r"^(?:of|in|at|and|the|Development|Rejuvenation|Rejuvanation|Strengthening|Improvement|Development|Restoration|Renovation|Desilting)\s+", '', s, flags=re.I)
    if place:
        s = re.sub(re.escape(place), '', s, flags=re.I).strip()
    if len(s.split()) < 2 or len(s) > 30:
        return None
    return ' '.join(w if (w.isupper() and len(w) <= 3) else w[:1].upper() + w[1:] for w in s.split())


def compute(projects, towns, dist):
    joins = find_joins(projects, towns)
    out = []
    for p in projects:
        cn = clean_name(p['t'], joins)
        pl = place_of(cn, p.get('d'), towns, dist)
        row = {'cn': cn, 'wk': kind_of(cn, p.get('ty'))}
        place_for_sb = place_of(cn, p.get('d'), towns, dist)
        sb = water_body(cn, place_for_sb) if row['wk'] == 'water body works' else None
        if sb:
            row['sb'] = sb
        if not pl:
            rt = route_of(cn)
            rd = re.search(r"\b(NH|SH)[- ]?(\d+[A-Z]{0,3})\b", cn)
            if rt:
                row['rt'] = rt
            elif rd and row['wk'] == 'road works':
                row['rd'] = f"{rd.group(1)}-{rd.group(2)}"
            else:
                row['hc'] = head_core(cn)
        if pl:
            shown = DISPLAY_PLACE.get(pl, pl)
            row['pl'] = shown
            te = towns.get(pl) or towns.get(shown) or dist.get(pl)
            # a value with " / " still lists several spellings the owner has not chosen between: never show it
            if te and ' / ' not in te:
                row['plt'] = te
        out.append(row)
    return out, joins


def main():
    towns, dist = load_places()
    path = f'{DATA}/projects.json'
    projects = json.load(open(path, encoding='utf-8'))
    fields, joins = compute(projects, towns, dist)
    overrides = json.load(open(f'{DATA}/name_overrides.json', encoding='utf-8'))
    for p, f in zip(projects, fields):
        o = overrides.get(str(p['id']))
        if o:
            for k, v in o.items():
                if v is None:
                    f.pop(k, None)
                else:
                    f[k] = v
    for p, f in zip(projects, fields):
        for k in ('cn', 'pl', 'plt', 'wk', 'rt', 'rd', 'hc', 'sb'):
            p.pop(k, None)
        p.update(f)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(projects, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(projects)} projects; joins applied: {joins}')


if __name__ == '__main__':
    sys.exit(main())
