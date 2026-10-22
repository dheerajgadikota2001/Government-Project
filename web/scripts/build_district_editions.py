"""Draft edition 1 of the district paper (మన జిల్లా పత్రిక) for all 28 districts.

Reads the checked topic seeds (backend seed/ap_facts) and writes src/data/editions.json:
for each district, the items whose numbers come straight from official sources, each with
its sentence in English and Telugu (the Telugu is what the Listen button reads), the
numbers as printed and the source line.

Rules kept:
- Numbers as printed. No sums, differences, shares or ranks are made here. Where a source
  prints its own percentage or deviation, it is quoted as the source's.
- Names from each source are mapped to today's 28 districts by an explicit table. A name
  that is not in the table stops the build; nothing is matched by guesswork.
- Sources on the 26-district map answer Markapuram and Polavaram with the district they
  were cut from, and the sentence says so.
- Every edition is a DRAFT until Dheeraj approves it.
"""
import json
from pathlib import Path

from reservoir_names import EN as RES_EN, TE as RES_TE

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
# In the repo the backend sits next to web/; in Claude's workspace it sits under work/.
FACTS = next(p for p in (SITE.parent / 'backend/seed/ap_facts', SITE.parent / 'work/paging-device/backend/seed/ap_facts') if p.exists())

_DI = json.loads((SITE / 'src/data/districts.json').read_text())['items']
D28 = [d['name'] for d in _DI]
TE_NAME = {d['name']: d['te'] for d in _DI}
NEW_2026 = {'Markapuram': 'Prakasam', 'Polavaram': 'Alluri Sitharama Raju'}
ALIAS = {
    'Konaseema': 'Dr. B.R. Ambedkar Konaseema', 'Dr B.R Ambedkar Konaseema': 'Dr. B.R. Ambedkar Konaseema',
    'Y.S.R Kadapa': 'YSR Kadapa', 'Y.S.R.': 'YSR Kadapa', 'Ysr Kadapa': 'YSR Kadapa',
    'Ntr': 'NTR', 'Alluri Sita Ramaraju': 'Alluri Sitharama Raju', 'Alluri Seetha Rama Raju': 'Alluri Sitharama Raju',
    'Sri Satya Sai': 'Sri Sathya Sai', 'Ananthapur': 'Ananthapuramu', 'Prakasham': 'Prakasam', 'SPSR Nellore': 'Sri Potti Sriramulu Nellore',
}
NOT_A_DISTRICT = {'TOTAL', 'Andhra Pradesh', 'Vijayanagara(KS)'}   # state rows; a Karnataka district (Tungabhadra dam)
MONTH_TE = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
STAGE = {'FAE': ('first advance estimate', 'మొదటి ముందస్తు అంచనా'), 'FRE': ('first revised estimate', 'మొదటి సవరించిన అంచనా'),
         'SRE': ('second revised estimate', 'రెండో సవరించిన అంచనా'), 'TRE': ('third revised estimate', 'మూడో సవరించిన అంచనా')}


def canon(name: str) -> str | None:
    if name in NOT_A_DISTRICT:
        return None
    n = ALIAS.get(name, name)
    if n not in D28:
        raise SystemExit(f'unmapped district name {name!r}')
    return n


def by_district(values: dict) -> dict:
    out = {}
    for k, v in values.items():
        c = canon(k)
        if c:
            out[c] = v
    return out


def ind(v, dec=None) -> str:
    """Indian digit grouping, decimals as given."""
    if v is None:
        return ''
    s = f'{v:.{dec}f}' if dec is not None else (str(int(v)) if float(v).is_integer() else str(v))
    neg = s.startswith('-')
    s = s.lstrip('-')
    ip, _, dp = s.partition('.')
    if len(ip) > 3:
        head, tail = ip[:-3], ip[-3:]
        g = []
        while len(head) > 2:
            g.insert(0, head[-2:])
            head = head[:-2]
        if head:
            g.insert(0, head)
        ip = ','.join(g) + ',' + tail
    return ('-' if neg else '') + ip + ('.' + dp if dp else '')


def date_words(iso: str):
    y, m, d = (int(x) for x in iso[:10].split('-'))
    return f'{d} {MONTH_EN[m - 1]} {y}', f'{d} {MONTH_TE[m - 1]} {y}'


def load(topic):
    return json.loads((FACTS / f'{topic}.json').read_text())


def series(doc, sid):
    return next(s for s in doc['series'] if s['id'] == sid)


def src_line(doc, sid, page=None):
    s = next(x for x in doc['sources'] if x['id'] == sid)
    return {'title': s['title'], 'by': s['by'], 'url': s['url'], 'released': s.get('released'), 'page': page}


def te_in(name: str) -> str:
    """'in <name>' in Telugu. A name ending in a consonant needs a zero-width non-joiner before
    the suffix, or the letters fuse into a conjunct; a name with a bracket reads better with a colon."""
    if '(' in name:
        return name + ':'
    return name + ('\u200c' if name.endswith('\u0c4d') else '') + 'లో'


def imd_class(dev):
    """IMD's own rainfall categories for a departure from normal (per cent)."""
    if dev is None:
        return None
    if dev >= 60: return ('large excess', 'అత్యధిక వర్షపాతం')
    if dev >= 20: return ('excess', 'అధిక వర్షపాతం')
    if dev > -20: return ('normal', 'సాధారణ వర్షపాతం')
    if dev > -60: return ('deficient', 'లోటు వర్షపాతం')
    return ('large deficient', 'తీవ్ర లోటు వర్షపాతం')


def main():
    water, taps, econ = load('water'), load('homes_taps'), load('district_economy')
    items = {d: [] for d in D28}

    # 1. Reservoirs in the district, today (APWRIMS). Largest three by design capacity.
    res = series(water, 'reservoir_storage_today')
    per = {}
    for p in res['points']:
        # Only AP reservoirs with a reading from the last three days; an older reading is not 'today'.
        if p.get('category_as_served') == 'outside_ap' or not p.get('district') or p.get('value') is None:
            continue
        if not p.get('as_on') or p['as_on'][:10] < '2026-10-18':
            continue
        d = canon(p['district'])
        if d:
            per.setdefault(d, []).append(p)
    tmc = lambda x: ind(round(x, 2)) if x is not None else None
    for d, ps in per.items():
        ps.sort(key=lambda p: -(p['values'].get('Design gross capacity (TMC)') or 0))
        lines, less, more = [], 0, 0
        for p in ps[:3]:
            v = p['values']
            raw = p['name'].title().replace('Reservoir', '').replace('Project', '').strip()
            name = RES_EN.get(raw, raw)
            if name not in RES_TE:
                raise SystemExit(f'no Telugu name for reservoir {name!r} (served as {p["name"]!r})')
            name_te = RES_TE[name]
            cap, last, pct = v.get('Design gross capacity (TMC)'), v.get('Storage on same date last year (TMC)'), v.get('Percent of capacity filled (as served)')
            if last is not None:
                less += p['value'] < last
                more += p['value'] > last
            pct_en = f" The Water Resources Department shows it {round(pct)}% full." if pct is not None else ''
            pct_te = f" జల వనరుల శాఖ లెక్కన ఇది {round(pct)}% నిండింది." if pct is not None else ''
            last_en = f" On this day last year it held {tmc(last)} TMC." if last is not None else ''
            last_te = f" పోయిన ఏడాది ఇదే రోజు {tmc(last)} టీఎంసీలు ఉండేవి." if last is not None else ''
            lines.append({
                'name': name, 'name_te': name_te, 'served_as': p['name'], 'storage': p['value'], 'capacity': cap,
                'last_year': last, 'pct_served': pct, 'read_at': p['as_on'],
                'en': (f"{name} holds no water today (0 TMC), out of {tmc(cap)} TMC when full.{last_en}" if p['value'] == 0
                       else f"{name} holds {tmc(p['value'])} TMC today, out of {tmc(cap)} TMC when full.{pct_en}{last_en}"),
                'te': (f"{te_in(name_te)} ఈ రోజు నీరు లేదు (0 టీఎంసీ). పూర్తిగా నిండితే {tmc(cap)} టీఎంసీలు పడతాయి.{last_te}" if p['value'] == 0
                       else f"{te_in(name_te)} ఈ రోజు {tmc(p['value'])} టీఎంసీల నీరు ఉంది. పూర్తిగా నిండితే {tmc(cap)} టీఎంసీలు పడతాయి.{pct_te}{last_te}"),
            })
        if less and not more:
            head_en, head_te = 'Less water in our reservoirs than a year ago', 'మన జలాశయాల్లో పోయిన ఏడాది కంటే తక్కువ నీరు'
        elif more and not less:
            head_en, head_te = 'More water in our reservoirs than a year ago', 'మన జలాశయాల్లో పోయిన ఏడాది కంటే ఎక్కువ నీరు'
        else:
            head_en, head_te = 'How much water our reservoirs hold today', 'మన జలాశయాల్లో ఈ రోజు ఎంత నీరు ఉంది'
        when_en, when_te = date_words(ps[0]['as_on'])
        items[d].append({
            'kind': 'reservoir', 'live': True, 'head_en': head_en, 'head_te': head_te,
            'lines': lines, 'more': max(0, len(ps) - 3),
            'mean_en': 'Water for the rabi crop and for drinking is released from these reservoirs, so their level today shapes the months ahead.',
            'mean_te': 'రబీ పంటలకు సాగునీరు, ఊళ్లకు తాగునీరు ఈ జలాశయాల నుంచే విడుదల చేస్తారు. ఈ రోజు ఎంత నీరు ఉందో, రాబోయే నెలలు ఎలా గడుస్తాయో దాదాపు అదే చెబుతుంది.',
            'note_en': 'TMC means a thousand million cubic feet, the unit the Water Resources Department uses. Figures are rounded to two decimals; the exact reading is on the source.',
            'note_te': 'టీఎంసీ అంటే వంద కోట్ల ఘనపుటడుగులు; జల వనరుల శాఖ వాడే కొలమానం. అంకెలను రెండు దశాంశాలకు కుదించాం; పూర్తి రీడింగ్ మూలంలో ఉంది.',
            'source': src_line(water, res['points'][0]['source']) | {'label_en': 'Water Resources Department, AP (APWRIMS), reservoir readings', 'label_te': 'జల వనరుల శాఖ, ఆంధ్రప్రదేశ్ (APWRIMS), జలాశయాల రీడింగ్','as_on_en': when_en, 'as_on_te': when_te},
        })

    # 2. Rain since 1 June (IMD, as served by APWRIMS).
    a = series(water, 'rainfall_actual_1jun_21oct')['points'][-1]
    n = series(water, 'rainfall_normal_1jun_21oct')['points'][-1]
    dv = series(water, 'rainfall_deviation_1jun_21oct')['points'][-1]
    A, N, DV = by_district(a['values']), by_district(n['values']), by_district(dv['values'])
    to_en, to_te = date_words(a['as_on'])
    for d in D28:
        if A.get(d) is None:
            continue
        dev = DV.get(d)
        cls = imd_class(dev)
        mm = lambda x: ind(x if not float(x).is_integer() else int(x))
        if cls is None:
            head_en, head_te, dev_en, dev_te = 'Rain this season', 'ఈ వానాకాలం వర్షం', '', ''
        else:
            side_en, side_te = ('below', 'తక్కువ') if dev < 0 else ('above', 'ఎక్కువ')
            if cls[0] == 'normal':
                head_en, head_te = 'Rain close to normal this season', 'ఈ వానాకాలం వర్షం దాదాపు సాధారణం'
                dev_en = f" That is {ind(abs(dev), 1)}% {side_en} normal by the Water Resources Department's count. The India Meteorological Department counts anything within 19% of normal as normal rainfall."
                dev_te = f" జల వనరుల శాఖ లెక్కన ఇది సాధారణం కంటే {ind(abs(dev), 1)}% {side_te}. సాధారణానికి 19% లోపు తేడా ఉంటే భారత వాతావరణ శాఖ దాన్ని సాధారణ వర్షపాతంగానే లెక్కిస్తుంది."
            else:
                strong = cls[0].startswith('large')
                if dev < 0:
                    head_en, head_te = ('Much less rain than normal', 'సాధారణం కంటే చాలా తక్కువ వర్షం') if strong else ('Less rain than normal', 'సాధారణం కంటే తక్కువ వర్షం')
                else:
                    head_en, head_te = ('Much more rain than normal', 'సాధారణం కంటే చాలా ఎక్కువ వర్షం') if strong else ('More rain than normal', 'సాధారణం కంటే ఎక్కువ వర్షం')
                dev_en = f" That is {ind(abs(dev), 1)}% {side_en} normal by the Water Resources Department's count, which the India Meteorological Department calls {cls[0]} rainfall."
                dev_te = f" జల వనరుల శాఖ లెక్కన ఇది సాధారణం కంటే {ind(abs(dev), 1)}% {side_te}. భారత వాతావరణ శాఖ దీన్ని '{cls[1]}' అంటుంది."
        items[d].append({
            'kind': 'rain', 'head_en': head_en, 'head_te': head_te,
            'big': {'value': A[d], 'unit_en': 'mm of rain since 1 June', 'unit_te': 'మి.మీ. వర్షం, జూన్ 1 నుంచి'},
            'en': f"From 1 June to {to_en}, {mm(A[d])} mm of rain fell in our district. In a normal year these same days bring {mm(N.get(d))} mm.{dev_en}",
            'te': f"జూన్ 1 నుంచి {to_te} వరకు మన జిల్లాలో {mm(A[d])} మి.మీ. వర్షం కురిసింది. మామూలుగా ఇవే రోజుల్లో {mm(N.get(d))} మి.మీ. కురుస్తుంది.{dev_te}",
            'mean_en': 'Rain fills tanks and borewells and carries crops that have no canal water. A short season shows up later as dry tanks and deeper borewells.',
            'mean_te': 'వర్షమే చెరువులను, బోర్లను నింపుతుంది; కాలువ నీరు లేని పంటలకు అదే ఆధారం. వాన తగ్గితే ఆ ప్రభావం తర్వాతి నెలల్లో ఎండిన చెరువులు, లోతుకు వెళ్లిన బోర్లుగా కనిపిస్తుంది.',
            'source': src_line(water, a['source']) | {'label_en': 'Water Resources Department, AP (APWRIMS), rainfall measured by the India Meteorological Department', 'label_te': 'జల వనరుల శాఖ, ఆంధ్రప్రదేశ్ (APWRIMS); వర్షపాతం భారత వాతావరణ శాఖ కొలతలు','as_on_en': to_en, 'as_on_te': to_te},
        })

    # 3. Groundwater depth, latest month and the same month last year.
    g = series(water, 'groundwater_depth_district')
    now = next(p for p in g['points'] if p['period'] == '2026-09')
    last = next(p for p in g['points'] if p['period'] == '2025-09')
    G, L = by_district(now['values']), by_district(last['values'])
    for d in D28:
        if G.get(d) is None:
            continue
        l = L.get(d)
        if l is not None and G[d] > l:
            head_en, head_te = 'Groundwater has gone deeper than a year ago', 'భూగర్భ జలం పోయిన ఏడాది కంటే లోతుకు వెళ్లింది'
        elif l is not None and G[d] < l:
            head_en, head_te = 'Groundwater is closer to the surface than a year ago', 'భూగర్భ జలం పోయిన ఏడాది కంటే పైకి వచ్చింది'
        else:
            head_en, head_te = 'How deep the groundwater is', 'భూగర్భ జలం ఎంత లోతులో ఉంది'
        items[d].append({
            'kind': 'groundwater', 'head_en': head_en, 'head_te': head_te,
            'big': {'value': round(G[d], 2), 'unit_en': 'metres below the ground', 'unit_te': 'మీటర్ల లోతులో'},
            'en': f"In September 2026, groundwater in our district stood on average {ind(round(G[d], 2))} metres below the ground." + (f" In September 2025 it stood at {ind(round(l, 2))} metres." if l is not None else ''),
            'te': f"సెప్టెంబర్ 2026లో మన జిల్లాలో భూగర్భ జలం సగటున భూమికి {ind(round(G[d], 2))} మీటర్ల లోతులో ఉంది." + (f" సెప్టెంబర్ 2025లో ఇది {ind(round(l, 2))} మీటర్ల లోతులో ఉండేది." if l is not None else ''),
            'mean_en': 'The deeper the water, the deeper a borewell must go and the more power a motor needs to lift it.',
            'mean_te': 'నీరు ఎంత లోతుకు వెళ్తే బోరు అంత లోతుగా వేయాలి; మోటారుకు అంత ఎక్కువ కరెంటు పడుతుంది.',
            'note_en': 'An average over the department\'s observation wells in the district. Your own village can be higher or lower.',
            'note_te': 'జిల్లాలోని పరిశీలన బావుల సగటు ఇది. మీ ఊరిలో ఇంతకంటే ఎక్కువ లేదా తక్కువ ఉండొచ్చు.',
            'source': src_line(water, now['source']) | {'label_en': 'Water Resources Department, AP (APWRIMS), groundwater levels', 'label_te': 'జల వనరుల శాఖ, ఆంధ్రప్రదేశ్ (APWRIMS), భూగర్భ జల మట్టాలు','as_on_en': 'September 2026', 'as_on_te': 'సెప్టెంబర్ 2026'},
        })

    # 4. Taps in village homes (Jal Jeevan Mission, 26-district map).
    hh = series(taps, 'tap_district_rural_households_26')['points'][-1]
    tp = series(taps, 'tap_district_households_with_tap_end_26')['points'][-1]
    H, T = by_district(hh['values']), by_district(tp['values'])
    for d in D28:
        reads = NEW_2026.get(d, d)
        if H.get(reads) is None:
            continue
        parent_en = f" These are {reads} district's figures, which then included {d}." if reads != d else ''
        parent_te = f" ఇవి {TE_NAME[reads]} జిల్లా అంకెలు; అప్పట్లో {TE_NAME[d]} అందులోనే ఉంది." if reads != d else ''
        items[d].append({
            'kind': 'taps', 'head_en': 'Tap water at home, village by village', 'head_te': 'గ్రామాల్లో ఇంటింటికీ నల్లా నీరు',
            'big': {'value': T.get(reads), 'unit_en': 'village homes with a tap', 'unit_te': 'నల్లా ఉన్న గ్రామీణ ఇళ్లు'},
            'en': f"The rural drinking water mission counts {ind(H[reads])} village homes in our district. As of 20 October 2026, it reports {ind(T.get(reads))} of them with a tap connection.{parent_en}",
            'te': f"గ్రామీణ తాగునీటి మిషన్ లెక్కలో మన జిల్లాలో {ind(H[reads])} గ్రామీణ ఇళ్లు ఉన్నాయి. వాటిలో {ind(T.get(reads))} ఇళ్లకు నల్లా కనెక్షన్ ఇచ్చినట్లు 20 అక్టోబర్ 2026 నాటి నివేదిక చెబుతోంది.{parent_te}",
            'mean_en': 'A connection on paper is not water in the pot. This report counts connections; it does not say whether water comes every day. If your village is different, tell us and we will check.',
            'mean_te': 'కాగితం మీద కనెక్షన్ ఉండటం వేరు, కుండలోకి నీరు రావడం వేరు. ఈ నివేదిక కనెక్షన్లను లెక్కిస్తుంది; ప్రతి రోజు నీరు వస్తోందో లేదో చెప్పదు. మీ ఊరిలో పరిస్థితి వేరుగా ఉంటే మాకు చెప్పండి; మేము పరిశీలిస్తాం.',
            'source': src_line(taps, tp['source']) | {'label_en': 'Jal Jeevan Mission, Union Ministry of Jal Shakti, district report', 'label_te': 'జల్ జీవన్ మిషన్, కేంద్ర జల శక్తి మంత్రిత్వ శాఖ, జిల్లా నివేదిక','as_on_en': '20 October 2026', 'as_on_te': '20 అక్టోబర్ 2026'},
        })

    # 5. The district's economy (DES, District Domestic Product, 28-district map).
    gd = series(econ, 'ddp2425_gddp_current')
    pc = series(econ, 'ddp2425_pci_nddp_current')
    gp = next(p for p in gd['points'] if p['period'] == '2024-25')
    pp = next(p for p in pc['points'] if p['period'] == '2024-25')
    GD, PC = by_district(gp['values']), by_district(pp['values'])
    st_en, st_te = STAGE[gp['stage']]
    for d in D28:
        if GD.get(d) is None:
            continue
        items[d].append({
            'kind': 'economy', 'head_en': 'What our district produced in a year', 'head_te': 'ఒక ఏడాదిలో మన జిల్లా ఉత్పత్తి',
            'big': {'value': GD[d], 'unit_en': '₹ crore, 2024-25', 'unit_te': '₹ కోట్లు, 2024-25'},
            'en': f"Farms, factories, shops and services in our district together produced ₹{ind(GD[d])} crore worth of goods and services in 2024-25, at that year's prices. The district's per capita income was ₹{ind(PC.get(d))} a year. This is the {st_en}; the state revises it as more data comes in.",
            'te': f"పొలాలు, పరిశ్రమలు, దుకాణాలు, సేవలు అన్నీ కలిపి 2024-25లో మన జిల్లాలో ₹{ind(GD[d])} కోట్ల విలువైన వస్తువులు, సేవలు ఉత్పత్తయ్యాయి (ఆ ఏడాది ధరల్లో). జిల్లా తలసరి ఆదాయం ఏడాదికి ₹{ind(PC.get(d))}. ఇది {st_te}; మరిన్ని లెక్కలు వచ్చాక ప్రభుత్వం దీన్ని సవరిస్తుంది.",
            'mean_en': 'Per capita income is the district\'s income shared out equally over every person. It is an average, not what any one family takes home.',
            'mean_te': 'తలసరి ఆదాయం అంటే జిల్లా మొత్తం ఆదాయాన్ని ప్రతి ఒక్కరికీ సమానంగా పంచితే వచ్చే సగటు. ఏ ఒక్క కుటుంబం చేతికి వచ్చే డబ్బు కాదు.',
            'source': src_line(econ, gp['source'], gp.get('page_or_table')) | {'label_en': 'District Domestic Product 2024-25, Directorate of Economics and Statistics, AP', 'label_te': 'జిల్లా దేశీయ ఉత్పత్తి 2024-25, అర్థ గణాంక శాఖ, ఆంధ్రప్రదేశ్','as_on_en': '2024-25', 'as_on_te': '2024-25'},
        })

    out = {
        'name_te': 'మన జిల్లా పత్రిక', 'name_en': 'Our District Paper',
        'edition': 1, 'date': '2026-10-21', 'status': 'draft',
        'districts': items,
    }
    dest = SITE / 'src/data/editions.json'
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(dest, dest.stat().st_size, {d: len(v) for d, v in items.items()})


if __name__ == '__main__':
    main()
