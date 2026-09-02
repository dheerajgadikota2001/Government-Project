r"""
Build seed/state_projects_seed.json — the state irrigation project register,
transcribed from the AP government's own Socio-Economic Survey editions.

WHY THIS EXISTS
AP publishes no online project register. The Socio-Economic Survey (Planning
Dept), tabled with the budget, is the government's only recurring project-wise
statement of its irrigation programme. Five editions on hand print the
ongoing-projects table (or prose status): 2017-18, 2018-19 (with admin-approval
costs and expenditure), 2020-21, 2021-22, 2024-25. 2019-20 and 2022-23 print no
project-wise table — those are honest gaps in the trail, not missing data here.

TRANSCRIPTION DISCIPLINE
Every figure below is verbatim from the printed tables/prose, eye-checked
against rendered page images (SES 2024-25 pp.406-408 printed; SES 2021-22
pp.142-145 printed; SES 2018-19 pp.104-110 printed). Editions disagree with
each other (a % that goes DOWN between editions, a project "completed" in
2017-18 that is ongoing in 2024-25) — those disagreements are kept as printed,
never reconciled. Observed dates follow each edition's own stated cutoff:
  SES 2017-18 -> 2018-03-31 (prose claims made in the survey published Mar 2018)
  SES 2018-19 -> 2019-03-31 (survey's closing fiscal year)
  SES 2020-21 -> 2021-03-31 (survey's closing fiscal year)
  SES 2021-22 -> 2021-12-31 (chapter repeatedly states figures "as of/till December 2021")
  SES 2024-25 -> 2024-12-31 (annexure family states cutoff "upto 31.12.2024")
The tables themselves print no as-on date; this convention is declared in the
seed's _readme and in each observation's source label.

Run:  python scripts/build_state_projects_seed.py   (writes seed/state_projects_seed.json)
Then: python scripts/load_state_projects.py
"""

import json
import os

ED = {
    "18": {"url": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/SocioEconomicalSurvey2017-18.pdf", "date": "2018-03-31", "label": "Socio-Economic Survey 2017-18, ch.7 (prose; survey published with Budget 2018; no as-on date printed)"},
    "19": {"url": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/SocioEconomicalSurvey2018-19.pdf", "date": "2019-03-31", "label": "Socio-Economic Survey 2018-19, ch.7 Tables 7.3-7.5 (no as-on date printed; survey year end used)"},
    "21": {"url": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/Socio_Economic_Survey_2020-21.pdf", "date": "2021-03-31", "label": "Socio-Economic Survey 2020-21, ch.7 ongoing-projects table (no as-on date printed; survey year end used)"},
    "22": {"url": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/Socio_Economic_Survey_2021-22.pdf", "date": "2021-12-31", "label": "Socio-Economic Survey 2021-22, Table 7.2 (chapter states figures as of December 2021)"},
    "25": {"url": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/AP_Socio_Economic_Survey_2024_25.pdf", "date": "2024-12-31", "label": "Socio-Economic Survey 2024-25, Annexure 7.2 (annexures state cutoff upto 31.12.2024)"},
    "25c": {"url": "https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/uploads/index-docs/AP_Socio_Economic_Survey_2024_25.pdf", "date": "2024-12-31", "label": "Socio-Economic Survey 2024-25, Annexure 7.3 (SPV projects via APRDMPDCL; cutoff upto 31.12.2024)"},
}

SP = "AP Socio-Economic Survey (Planning Dept)"


def obs(ed, pct, note, cost=None, exp=None):
    o = {"observed_date": ED[ed]["date"], "source_label": ED[ed]["label"],
         "source_url": ED[ed]["url"],  # AP Finance Dept's own hosting of the survey
         "completion_percentage": pct, "status_note": note}
    if cost is not None:
        o["estimated_cost_crore"] = cost
    if exp is not None:
        o["cumulative_expenditure_crore"] = exp
    return o


def proj(eid, title, status, desc, cost=None, district=None, observations=(),
         attach_to_title=None, ptype="irrigation"):
    p = {"external_id": eid, "title": title, "project_type": ptype,
         "status": status, "department": "Water Resources Department, Government of Andhra Pradesh",
         "source_portal": SP, "description": desc,
         "observations": list(observations)}
    urls = [o.get("source_url") for o in observations if o.get("source_url") and "apfinance" in o.get("source_url")]
    if urls:
        p["source_url"] = urls[-1]  # the newest survey edition that lists the project
    if cost is not None:
        p["estimated_cost_crore"] = cost
    if district:
        p["district"] = district
    if attach_to_title:
        p["attach_to_title"] = attach_to_title
    return p


P = []

# ---------------------------------------------------------------- Major (SES 2024-25 Annexure 7.2 rows 1-23)
P.append(proj("SES-IRR-VAMSADHARA-2-2", "B.R.R. Vamsadhara Project Phase-II of Stage-II", "under_construction",
    "Boddepally Raja Gopal Rao Vamsadhara Project, Stage-II Phase-II, Srikakulam region. SES 2017-18: Stage-I and Phase-I of Stage-II completed (2,10,510 acres); Phase-II of Stage-II in three packages for 45,000 acres, then expected by 31-3-2018; LA & R&R cost revised from Rs 273.00 Cr to Rs 930.00 Cr. SES 2018-19 (Table 7.3): admin approval Rs 2,038.03 Cr, 76% progress, target 07/2020, benefits 225 villages in 9 mandals of Srikakulam. Later editions: 85.59% (target 2021), 90.77% (target 2022), 92% (target 2025) — the same project's printed completion has moved four times.",
    cost=2038.03, district="Srikakulam", observations=[
        obs("18", None, "Phase-II of Stage-II taken up in 3 packages for 45,000 ac ayacut; expected completion 31-3-2018 as printed"),
        obs("19", 76, "Admin approval Rs 2,038.03 Cr; IP contemplated 45,000 ac new; target 07/2020", cost=2038.03),
        obs("21", 85.59, "Target 2021; new ayacut 20,000 ac"),
        obs("22", 90.77, "Target 2022; new ayacut 12,200 ac"),
        obs("25", 92, "Target 2025; new ayacut 17,200 ac"),
    ]))

P.append(proj("SES-IRR-THOTAPALLI", "Sardar Gowthu Latchanna Thotapalli Barrage Project", "under_construction",
    "SGL Thotapalli Barrage on the Nagavali, serving Vizianagaram and Srikakulam districts; also feeds 42 tanks for drinking water in 24 villages enroute. SES 2017-18 prose declares it 'completed' with 1 lakh acres new and 64,000 acres stabilized; every later edition lists it as ongoing — printed as-is. SES 2018-19 (Table 7.3): admin approval Rs 1,127.58 Cr, 91%, target 06/2020. SES 2024-25: 84.77% (A: barrage) and 43.90% (B: Gajapathinagaram Branch Canal), target 2025.",
    cost=1127.58, observations=[
        obs("18", None, "Prose: 'The Project is completed' — 1,00,000 ac new ayacut created, 64,000 ac stabilized, as printed"),
        obs("19", 91, "Admin approval Rs 1,127.58 Cr; contemplated 131,221 new + 64,000 stab; created 69,004 + 64,000; target 06/2020", cost=1127.58),
        obs("21", 79, "Barrage 79%, Gajapathinagaram Branch Canal 43.34%; target 2021"),
        obs("22", 83, "Barrage 83.00%, Branch Canal 43.34%; target 2023"),
        obs("25", 84.77, "Barrage 84.77%, Gajapathi nagaram Branch Canal 43.90%; target 2025"),
    ]))

P.append(proj("SES-IRR-PUSHKARA", "Pushkara Lift Irrigation Scheme", "under_construction",
    "Pushkara (Pushkaram) LIS on the Godavari, East Godavari region; its 1.86 lakh acre ayacut is counted inside Polavaram's 7.2 lakh contemplated acres. SES 2018-19 (Table 7.4): sanction Rs 674.52 Cr, expenditure Rs 621.82 Cr, 92%. Printed at 98.72% in 2020-21, 2021-22 and 2024-25 alike — unchanged across four years as printed.",
    cost=674.52, observations=[
        obs("19", 92, "Sanction Rs 674.52 Cr, expenditure Rs 621.82 Cr; contemplated 186,000 ac; created 148,154 ac", cost=674.52, exp=621.82),
        obs("21", 98.72, "Target 2021; new ayacut 30,011 ac"),
        obs("22", 98.72, "Target 2022; new ayacut 30,011 ac"),
        obs("25", 98.72, "No target printed; new ayacut 44,152 ac"),
    ]))

P.append(proj("SES-IRR-TADIPUDI", "Tadipudi Lift Irrigation Scheme", "under_construction",
    "Tadipudi LIS on the Godavari, West Godavari region; its 2.066 lakh acre ayacut is counted inside Polavaram's contemplated ayacut. SES 2018-19 (Table 7.4): sanction Rs 885.54 Cr, expenditure Rs 580.73 Cr, 66%. Printed 86% in 2020-21 and 2021-22, then 78% in 2024-25 — the figure goes DOWN between editions, printed as-is.",
    cost=885.54, observations=[
        obs("19", 66, "Sanction Rs 885.54 Cr, expenditure Rs 580.73 Cr; contemplated 206,600 ac; created 157,544 ac", cost=885.54, exp=580.73),
        obs("21", 86, "Target 2022; 47,487 new + 1,569 stab"),
        obs("22", 86, "Target 2023; 47,487 new + 1,569 stab"),
        obs("25", 78, "Target 2025; 47,487 new + 1,569 stab — lower than the 86% printed in 2020-21/2021-22"),
    ]))

P.append(proj("SES-IRR-POLAVARAM-SES", "Polavaram Project — SES trail", "under_construction",
    "", attach_to_title="Polavaram Irrigation Project (Phase 1)", observations=[
        obs("18", None, "Prose: total cost Rs 16,010.45 Cr (2010-11 PL), expenditure to date Rs 12,564.49 Cr, GoI reimbursed Rs 4,329.06 Cr; completion scheduled June 2019", cost=16010.45, exp=12564.49),
        obs("19", 71, "Table 7.3: admin approval Rs 55,548.87 Cr, 71%; contemplated 720,000 new + 23.5 lakh stab; target 06/2021", cost=55548.87),
        obs("21", 71.46, "Excluding power house; target 2021; 436,185 new + 1,569 stab"),
        obs("22", 77.66, "Table 7.2: 77.66%, target 2023. Ch.7 prose (as of Dec 2021): overall 77.91%, LA&R&R 20.19%, RMC 92.57%, LMC 71.24%, head works 75.75%, total incl. LA&R&R up to EL+45.72m 42.56%"),
        obs("25", 78.64, "Target 2027; 720,000 ac new"),
    ]))

P.append(proj("SES-IRR-VENKATANAGARAM", "Venkatanagaram Pumping Scheme", "under_construction",
    "Venkatanagaram Pumping Scheme, Godavari region. SES 2018-19 (Table 7.4): sanction Rs 124.18 Cr, expenditure Rs 87.35 Cr, 70%. SES 2024-25 prints it 83.19% and 'Preclosed'.",
    cost=124.18, observations=[
        obs("19", 70, "Sanction Rs 124.18 Cr, exp Rs 87.35 Cr; contemplated 23,359 new + 10,641 stab; created 19,109 + 10,641", cost=124.18, exp=87.35),
        obs("21", 82.21, "Target 2021; 19,109 new + 8,441 stab"),
        obs("22", 83.19, "Target 2022; 23,359 new"),
        obs("25", 83.19, "Printed 'Preclosed'; 34,000 ac new"),
    ]))

P.append(proj("SES-IRR-UTTARANDHRA", "BJR Uttarandhra Sujala Sravanthi Project", "under_construction",
    "Babu Jagjivan Ram Uttarandhra Sujala Sravanthi — lift of Godavari water (from Polavaram left canal) for north-coastal AP (Visakhapatnam, Vizianagaram, Srikakulam region); contemplated 8 lakh acres. SES 2018-19 (Table 7.4, Phase-1): sanction Rs 8,435.27 Cr, expenditure Rs 12.67 Cr, 1%, target 09/2020. Printed 2% in 2020-21 and 2021-22, then 0.27% in 2024-25 — as printed.",
    cost=8435.27, observations=[
        obs("19", 1, "Phase-1 sanction Rs 8,435.27 Cr, exp Rs 12.67 Cr; contemplated 800,000 ac; target 09/2020", cost=8435.27, exp=12.67),
        obs("21", 2, "Phase-I; target 2022; 130,000 ac"),
        obs("22", 2, "Phase-I; target 2022; 321,000 ac"),
        obs("25", 0.27, "No target printed; 800,000 ac — lower % than every earlier edition, as printed"),
    ]))

P.append(proj("SES-IRR-CHINTALAPUDI", "Chintalapudi Lift Irrigation Scheme", "under_construction",
    "Chintalapudi LIS on the Godavari, Eluru/West Godavari region. SES 2018-19 (Table 7.4): sanction Rs 4,909.80 Cr, expenditure Rs 2,698.92 Cr, 55%, target 08/2020. Printed 56.06% (2020-21), 77% (2021-22), then 66.43% (2024-25) — the sequence is not monotonic, printed as-is.",
    cost=4909.80, observations=[
        obs("19", 55, "Sanction Rs 4,909.80 Cr, exp Rs 2,698.92 Cr; contemplated 200,000 new + 280,000 stab; target 08/2020", cost=4909.80, exp=2698.92),
        obs("21", 56.06, "Target 2022; 200,000 new + 280,000 stab"),
        obs("22", 77, "Target 2023; 200,000 new + 280,000 stab"),
        obs("25", 66.43, "Target 2026; 200,000 new + 280,879 stab — lower than 2021-22's 77%, as printed"),
    ]))

P.append(proj("SES-IRR-GUNDLAKAMMA", "Kandula Obul Reddy Gundlakamma Reservoir Project", "under_construction",
    "Gundlakamma Reservoir, Prakasam district. SES 2017-18: partially completed, 60,000 acres created, remaining distributory network due Kharif 2018. SES 2018-19 (Table 7.4): sanction Rs 753.83 Cr, expenditure Rs 627.85 Cr, 98%, target 12/2019. SES 2024-25: 98%, 'Pre-closed and balance works are taken under CADWM and it is in progress'.",
    cost=753.83, district="Prakasam", observations=[
        obs("18", None, "Prose: partially completed; 60,000 ac created; remaining distributory network programmed for Kharif 2018; +20,000 ac to be added"),
        obs("19", 98, "Sanction Rs 753.83 Cr, exp Rs 627.85 Cr; contemplated 80,060 ac; created 68,977 ac; target 12/2019", cost=753.83, exp=627.85),
        obs("21", 94, "Target 2021; 13,063 ac"),
        obs("22", 98, "Pre-closed; balance works under CADWM, in progress; 13,063 ac"),
        obs("25", 98, "Pre-closed; balance works under CADWM, in progress; 8,825 new + 5,050 stab"),
    ]))

P.append(proj("SES-IRR-VELIGONDA", "Poola Subbaiah Veligonda Project", "under_construction",
    "Veligonda — flood-water diversion of 43.50 TMC from the Krishna (Kollam Vagu/Srisailam foreshore) by gravity to the drought-prone, fluoride-affected uplands of Prakasam, Nellore and Kadapa districts (30 mandals); contemplated irrigation for about 4.47 lakh acres and drinking water for 15.25 lakh people. The government's own record moves backwards: SES 2017-18 says 'Overall, 81% work is completed… entire project by December 2018'; SES 2018-19 prints 74% (admin approval Rs 6,017.99 Cr, target 12/2020); SES 2020-21 and 2021-22 print 78% (target 2023); SES 2024-25 prints 75% (target 2026). Each figure is kept exactly as printed. On 1 September 2026 the Chief Minister inaugurated Phase-1 at Gantavanipalli (Prakasam), releasing water from the 18.8 km twin tunnels into the 21.8 km feeder canal towards Nallamala Sagar; press reports put Phase-1 at 19,000 acres and drinking water for about 4 lakh people, with Rs 5,662 crore spent against a project cost reported as 'over Rs 10,200 crore' (The Hans India, 1-2 Sep 2026 — press figures, no government order on record yet). The project as a whole remains ongoing.",
    cost=6017.99, observations=[
        obs("18", 81, "Prose: reservoir work completed, canals nearing completion; 'Overall, 81% work is completed'; one tunnel by Kharif 2018, entire project by December 2018"),
        obs("19", 74, "Admin approval Rs 6,017.99 Cr; IP contemplated 447,300 ac; target 12/2020", cost=6017.99),
        obs("21", 78, "Target 2023; 425,600 new + 14,700 stab"),
        obs("22", 78, "Target 2023; 425,100 new + 14,700 stab"),
        obs("25", 75, "Target 2026; 424,100 new + 14,800 stab — lower than the 78% printed in 2020-21/2021-22 and the 81% claimed in 2017-18"),
        # Press-tier point: no numeric fields stored (figures stay in the note,
        # attributed), so government-published numbers alone drive the charts.
        {"observed_date": "2026-09-01",
         "source_portal": "PRESS",
         "source_label": "The Hans India, 1 Sep 2026 (press report — no government order on record yet)",
         "source_url": "https://www.thehansindia.com/news/cities/kurnool/cm-naidu-dedicates-veligonda-to-nation-1116236",
         "completion_percentage": None,
         "status_note": "Phase-1 inaugurated at Gantavanipalli: water released from 18.8 km twin tunnels into 21.8 km feeder canal towards Nallamala Sagar. Press: Phase-1 irrigates 19,000 ac, drinking water for ~4 lakh; Rs 5,662 Cr spent, cost 'over Rs 10,200 Cr'. Full project (4.47 lakh ac) still ongoing."},
    ]))

P.append(proj("SES-IRR-SOMASILA", "Somasila Project", "under_construction",
    "Somasila Project on the Pennar, Nellore district region. SES 2018-19 (Table 7.4): sanction Rs 1,548.49 Cr, 61% (expenditure Rs 1,776.62 Cr printed spanning Somasila and Somasila HLC rows), contemplated 135,000 new + 122,500 stab, created 92,477 + 68,173, target 06/2020. Printed 94.96% in 2020-21, 2021-22 and 2024-25 alike.",
    cost=1548.49, observations=[
        obs("19", 61, "Sanction Rs 1,548.49 Cr; exp Rs 1,776.62 Cr printed merged across Somasila+HLC rows; created 92,477 new + 68,173 stab; target 06/2020", cost=1548.49),
        obs("21", 94.96, "Target 2021; 38,406 new + 11,511 stab"),
        obs("22", 94.96, "Target 2023; 38,406 new + 11,511 stab"),
        obs("25", 94.96, "Target 2025; 38,406 new + 11,511 stab"),
    ]))

P.append(proj("SES-IRR-SOMASILA-HLC", "Somasila High Level Canal (Phase-I and Phase-II)", "under_construction",
    "Somasila High Level Lift Canal, Nellore region. SES 2018-19 (Table 7.4): Phase-I sanction Rs 1,532.19 Cr, 56%, target 03/2020. SES 2024-25 prints Phase-I 65% (target 2025, 43,200 ac) and, for the first time, Phase-II 35% (target 2025, 46,453 ac).",
    cost=1532.19, observations=[
        obs("19", 56, "Phase-I sanction Rs 1,532.19 Cr; 43,200 ac; target 03/2020", cost=1532.19),
        obs("21", 59.89, "Phase-I; target 2021; 43,200 ac"),
        obs("22", 62.33, "Phase-I; target 2023; 43,200 ac"),
        obs("25", 65, "Phase-I 65% (target 2025, 43,200 ac); Phase-II 35% (target 2025, 46,453 ac)"),
    ]))

P.append(proj("SES-IRR-SOMASILA-SWARNAMUKHI", "Somasila Swarna Mukhi Link Canal", "under_construction",
    "Somasila–Swarnamukhi Link Canal, Nellore/Tirupati region. SES 2018-19 (Table 7.4): sanction Rs 437.42 Cr, expenditure Rs 204.31 Cr, 66%, target 12/2019. 72.70% in 2020-21/2021-22; 94% in 2024-25.",
    cost=437.42, observations=[
        obs("19", 66, "Sanction Rs 437.42 Cr, exp Rs 204.31 Cr; 12,000 new + 78,464 stab; target 12/2019", cost=437.42, exp=204.31),
        obs("21", 72.70, "Target 2021; 12,000 new + 78,464 stab"),
        obs("22", 72.70, "Target 2022; 12,000 new + 78,464 stab"),
        obs("25", 94, "No target printed; 12,000 new + 78,464 stab"),
    ]))

P.append(proj("SES-IRR-HNSS", "Handri Neeva Sujala Sravanthi Project (HNSS Phase-I and Phase-II)", "under_construction",
    "Handri-Neeva Sujala Sravanthi — lift of Krishna floodwater from Srisailam for Rayalaseema (Kurnool, Anantapur, Kadapa, Chittoor). SES 2017-18: Phase-I pumps and motors commissioned; record 37.32 TMC lifted in 2016-17. SES 2018-19: Phase-I (Table 7.3) admin approval Rs 4,653.64 Cr, 84%, target 06/2020, creating 80,000 ac in Kurnool and 118,000 ac in Anantapur; Phase-II (Table 7.4) sanction Rs 7,340.87 Cr, expenditure Rs 5,509.42 Cr, 75%, target 12/2020. SES 2024-25: Phase-I 94%, Phase-II 82%, 'Pre-closed', 575,996 ac.",
    cost=4653.64, observations=[
        obs("18", None, "Prose: Phase-I pumps/motors commissioned, main canal work completed; 37.32 TMC lifted in 2016-17; 33.60 TMC in 2018-19 per next edition"),
        obs("19", 84, "Ph-I: Rs 4,653.64 Cr approval, 84%, contemplated 198,894 ac, created 25,300, target 06/2020. Ph-II: Rs 7,340.87 Cr, exp Rs 5,509.42 Cr, 75%, 404,500 ac, target 12/2020", cost=4653.64),
        obs("21", 78.09, "Ph-I 78.09%, Ph-II 89.90%; combined target 2023; 551,500 ac"),
        obs("22", 93, "Ph-I 93.00%, Ph-II 90.00%; target 2023; 551,500 ac"),
        obs("25", 94, "Ph-I 94%, Ph-II 82% — Ph-II lower than the 90% printed in 2021-22; 'Pre-closed'; 575,996 ac"),
    ]))

P.append(proj("SES-IRR-TELUGU-GANGA", "Telugu Ganga Project", "under_construction",
    "Telugu Ganga — Krishna water via Srisailam to Rayalaseema and (historically) Chennai drinking water. SES 2018-19 (Table 7.4): sanction Rs 6,671.63 Cr, expenditure Rs 5,066.78 Cr, 76%, contemplated 522,539 ac (created 441,460), target 12/2019. 96.39% in 2020-21/2021-22; 89.76% in 2024-25 — lower, as printed.",
    cost=6671.63, observations=[
        obs("19", 76, "Sanction Rs 6,671.63 Cr, exp Rs 5,066.78 Cr; contemplated 522,539 ac, created 441,460; target 12/2019", cost=6671.63, exp=5066.78),
        obs("21", 96.39, "Target 2021; 89,520 ac"),
        obs("22", 96.39, "Target 2022; 89,520 ac"),
        obs("25", 89.76, "No target printed; 194,107 new + 23,907 stab — lower % than 2020-21/2021-22, as printed"),
    ]))

P.append(proj("SES-IRR-GNSS", "Galeru Nagari Sujala Sravanthi Project (GNSS Phase-I and Phase-II)", "under_construction",
    "Galeru-Nagari Sujala Sravanthi — Krishna floodwater (38 TMC) via Srisailam/SRBC to Kadapa, Chittoor and Nellore uplands. SES 2017-18: Phase-I 'substantially completed'; 6 TMC first stored in Gorakallu. SES 2018-19: Phase-I (Table 7.3) Rs 6,361.92 Cr, 81%, target 06/2020; Phase-II (Table 7.4) Rs 3,575.00 Cr, expenditure Rs 851.12 Cr, 27%, target 06/2021. SES 2021-22's table prints GNSS Phase-II twice (19.75%) and no Phase-I row — a printing fault in the source, recorded as printed. SES 2024-25: Phase-I 95% (target 2025), Phase-II 63.56% (target 2026).",
    cost=6361.92, observations=[
        obs("18", None, "Prose: GNSS Phase-I substantially completed; first 6.00 TMC stored in Gorakallu reservoir; Gandikota capacity to be raised to 18 TMC in 2017-18"),
        obs("19", 81, "Ph-I: Rs 6,361.92 Cr approval, 81%, target 06/2020. Ph-II: Rs 3,575.00 Cr, exp Rs 851.12 Cr, 27%, 225,000 ac, target 06/2021", cost=6361.92),
        obs("21", 76.06, "Ph-I 76.06%, Ph-II 10.07%; target 2023; 258,500 new + 3,950 stab"),
        obs("22", None, "Table prints 'GNSS Phase-II' twice at 19.75% (targets 2022 and 2024) with no Phase-I row — source printing fault, recorded as printed without a trail %; 256,850 new + 3,950 stab"),
        obs("25", 95, "Ph-I 95% (target 2025), Ph-II 63.56% (target 2026); 256,050 new + 3,950 stab"),
    ]))

P.append(proj("SES-IRR-GKLIS", "Guru Raghavendra (GKLIS) Lift Irrigation Scheme including Micro Irrigation", "under_construction",
    "GKLIS lift irrigation with micro-irrigation component, Kurnool region. SES 2018-19 (Table 7.4): sanction Rs 983.00 Cr, expenditure Rs 735.71 Cr, 96%, target 12/2019. 97.77% in 2020-21/2021-22; 96% in 2024-25.",
    cost=983.00, observations=[
        obs("19", 96, "Sanction Rs 983.00 Cr, exp Rs 735.71 Cr; contemplated 47,500 new + 41,000 stab, created 7,500 + 20,000; target 12/2019", cost=983.00, exp=735.71),
        obs("21", 97.77, "Target 2021; 40,400 ac"),
        obs("22", 97.77, "Target 2022; 40,000 ac"),
        obs("25", 96, "No target printed; 24,700 ac"),
    ]))

P.append(proj("SES-IRR-GANDIKOTA-CBR", "Gandikota - CBR Lift Scheme", "under_construction",
    "Gandikota to Chitravati Balancing Reservoir lifts, Kadapa region. SES 2018-19 (Table 7.4): Lifts I-V sanction Rs 1,744.00 Cr, expenditure Rs 1,519.35 Cr, 95%; Lift VI Rs 315.00 Cr, expenditure Rs 36.68 Cr, 31% — both target 12/2019. SES 2024-25: 'Lift I to V Completed, Lift VI - 25.80%'.",
    cost=1744.00, observations=[
        obs("19", 95, "Lifts I-V: Rs 1,744.00 Cr, exp Rs 1,519.35 Cr, 95%. Lift VI: Rs 315.00 Cr, exp Rs 36.68 Cr, 31%. Target 12/2019", cost=1744.00, exp=1519.35),
        obs("21", 61.02, "Target 2021; 20,750 ac"),
        obs("22", 73.79, "Target 2022; 20,750 ac"),
        obs("25", None, "Printed: 'Lift I to V Completed, Lift VI - 25.80%'; 12,000 ac"),
    ]))

P.append(proj("SES-IRR-CBR-RIGHT-CANAL", "Chitravati Balancing Reservoir (CBR) Right Canal — Lingala Canal", "under_construction",
    "CBR Right Canal (Lingala Canal), Kadapa region. SES 2018-19 (Table 7.4): sanction Rs 693.20 Cr, expenditure Rs 276.32 Cr, 77%, target 09/2020. SES 2024-25: 94.76%, 'Pre closed and work is taken up under Rayalaseema Drought Mitigation Project'.",
    cost=693.20, observations=[
        obs("19", 77, "Sanction Rs 693.20 Cr, exp Rs 276.32 Cr; contemplated 59,400 ac, created 26,054; target 09/2020", cost=693.20, exp=276.32),
        obs("21", 81.97, "Target 2021; 33,351 ac"),
        obs("22", 94.76, "Target 2022; 33,351 ac"),
        obs("25", 94.76, "Pre-closed; work taken up under Rayalaseema Drought Mitigation Project; 33,400 ac"),
    ]))

P.append(proj("SES-IRR-MYLAVARAM", "Mylavaram Modernization", "suspended",
    "Modernization of Mylavaram system, Kadapa region. SES 2018-19 (Table 7.4): sanction Rs 145.45 Cr, expenditure Rs 123.11 Cr, 81%, remark 'stopped the work Since 2013'. SES 2024-25: Package 90 at 95.28%, Package 91 at 66.65%, 'Contract Pre-closed'.",
    cost=145.45, observations=[
        obs("19", 81, "Sanction Rs 145.45 Cr, exp Rs 123.11 Cr; 75,000 ac stab (73,046 created); remark: 'stopped the work Since 2013'", cost=145.45, exp=123.11),
        obs("21", 81.17, "Target 2021; 1,954 ac stab"),
        obs("22", 95.28, "Package No.90 95.28% (Contract Pre-closed); second package printed 66.65%; 1,954 ac stab"),
        obs("25", 95.28, "Package No.90 95.28%, Package No.91 66.65%; Contract Pre-closed; 4,413 ac stab"),
    ]))

P.append(proj("SES-IRR-PBC", "Modernization of Pulivendula Branch Canal (PBC) System", "suspended",
    "Pulivendula Branch Canal modernization, Kadapa region. SES 2018-19 (Table 7.4): sanction Rs 657.43 Cr, expenditure Rs 176.62 Cr, 72%, target 12/2019. SES 2024-25: 76%, 'Contract Pre-closed. PBC Micro Irrigation is taken up under Rayalaseema Drought Mitigation Scheme'.",
    cost=657.43, observations=[
        obs("19", 72, "Sanction Rs 657.43 Cr, exp Rs 176.62 Cr; contemplated 36,900 new + 60,000 stab, 45,000 stab created; target 12/2019", cost=657.43, exp=176.62),
        obs("21", 76.56, "Target 2021; 36,900 new + 4,421 stab"),
        obs("22", 76.56, "Contract Pre-closed; PBC Micro Irrigation under Rayalaseema Drought Mitigation Scheme; 36,900 + 4,421"),
        obs("25", 76, "Contract Pre-closed; PBC Micro Irrigation under Rayalaseema Drought Mitigation Scheme; 4,420 ac stab"),
    ]))

P.append(proj("SES-IRR-SRBC", "Srisailam Right Branch Canal (SRBC) — Gorakallu Balancing Reservoir", "suspended",
    "SRBC / Gorakallu Balancing Reservoir, Kurnool region. SES 2018-19 (Table 7.4): sanction Rs 840.34 Cr, expenditure Rs 592.16 Cr, 93%, target 08/2019. SES 2024-25: 91.50%, 'The work is pre-closed on mutual consent'.",
    cost=840.34, observations=[
        obs("19", 93, "Sanction Rs 840.34 Cr, exp Rs 592.16 Cr; 56,475 ac stab contemplated, 46,857 created; target 08/2019", cost=840.34, exp=592.16),
        obs("21", 87, "Target 2021; 36,064 ac"),
        obs("22", 91.08, "Work pre-closed on mutual consent; 36,064 ac"),
        obs("25", 91.50, "Work pre-closed on mutual consent; 36,064 ac"),
    ]))

P.append(proj("SES-IRR-PABR-2", "Pendekallu Balancing Reservoir (PABR) - Stage II", "suspended",
    "PABR Stage-II, Kurnool/Anantapur region. SES 2018-19 (Table 7.4): sanction Rs 768.90 Cr, expenditure Rs 501.04 Cr, 65%, target 03/2020. SES 2024-25: 96%, 'The works are pre-closed due to LA problem'.",
    cost=768.90, observations=[
        obs("19", 65, "Sanction Rs 768.90 Cr, exp Rs 501.04 Cr; contemplated 51,600 ac, created 9,000; target 03/2020", cost=768.90, exp=501.04),
        obs("21", 95, "Target 2021; 42,600 ac"),
        obs("22", 96, "Works pre-closed due to LA problem; 42,600 ac"),
        obs("25", 96, "Works pre-closed due to LA problem; 42,600 ac"),
    ]))

# ---------------------------------------------------------------- Medium (rows 24-30)
P.append(proj("SES-IRR-MAHENDRATANAYA", "Off-Shore Reservoir on River Mahendratanaya", "under_construction",
    "Offshore reservoir on the Mahendratanaya, Srikakulam district. SES 2018-19 (Table 7.4): sanction Rs 466.28 Cr, expenditure Rs 298.45 Cr, 46%, target 07/2020. Printed 38% in 2020-21, 2021-22 (works pre-closed, revised estimate submitted) and 2024-25 (target 2025) — 46% then 38%, as printed.",
    cost=466.28, district="Srikakulam", observations=[
        obs("19", 46, "Sanction Rs 466.28 Cr, exp Rs 298.45 Cr; 24,600 ac; target 07/2020", cost=466.28, exp=298.45),
        obs("21", 38, "Target 2021; 24,600 ac — lower than 2018-19's 46%, as printed"),
        obs("22", 38, "Works Pre-closed; revised estimate submitted to Govt.; 24,600 ac"),
        obs("25", 38, "Target 2025; 24,600 ac"),
    ]))

P.append(proj("SES-IRR-TRTS", "Taraka Rama Theertha Sagar Project", "under_construction",
    "Tharaka Rama Theertha Sagaram Reservoir, Vizianagaram district — new ayacut 16,538 acres and stabilization of 8,172 acres under Denkada anicut. SES 2018-19 (Table 7.3): admin approval Rs 471.31 Cr, 48%, target 12/2020. SES 2024-25: 58%, target 2025.",
    cost=471.31, district="Vizianagaram", observations=[
        obs("19", 48, "Admin approval Rs 471.31 Cr; 16,538 new + 8,172 stab; target 12/2020", cost=471.31),
        obs("21", 48.40, "Target 2021; 16,538 new + 8,172 stab"),
        obs("22", 59.57, "Target 2023; 16,538 new + 8,172 stab"),
        obs("25", 58, "Target 2025; 16,538 new + 8,172 stab — lower than 2021-22's 59.57%, as printed"),
    ]))

P.append(proj("SES-IRR-MADDUVALASA", "Sri Gorle Sriramulu Naidu Madduvalasa Reservoir Project Stage-II", "under_construction",
    "Madduvalasa Stage-II, Srikakulam district. SES 2018-19 (Table 7.4): sanction Rs 72.87 Cr, expenditure Rs 42.27 Cr, 79%, target 06/2020. SES 2021-22: works pre-closed, balance works estimate submitted. SES 2024-25: 80%, target 2025.",
    cost=72.87, district="Srikakulam", observations=[
        obs("19", 79, "Sanction Rs 72.87 Cr, exp Rs 42.27 Cr; contemplated 12,500 ac, created 5,200; target 06/2020", cost=72.87, exp=42.27),
        obs("21", 78.89, "Target 2021; 7,300 ac"),
        obs("22", 78.99, "Works Pre-closed; balance works estimate submitted to Govt.; 7,300 ac"),
        obs("25", 80, "Target 2025; 7,300 ac"),
    ]))

P.append(proj("SES-IRR-JANJHAVATHI", "VKMN Janjhavathi Reservoir Project", "under_construction",
    "Vijayarama Raju (VKMN) Janjhavathi Reservoir, Vizianagaram district. SES 2018-19 (Table 7.4): sanction Rs 159.77 Cr, expenditure Rs 118.59 Cr, 77%, target 05/2020. SES 2024-25: 80.38%, target 2025.",
    cost=159.77, district="Vizianagaram", observations=[
        obs("19", 77, "Sanction Rs 159.77 Cr, exp Rs 118.59 Cr; contemplated 5,405 new + 19,235 stab, created 1,392 + 7,608; target 05/2020", cost=159.77, exp=118.59),
        obs("21", 76, "Target 2021; 4,013 new + 11,627 stab"),
        obs("22", 80.38, "Target 2022; 4,013 new + 11,627 stab"),
        obs("25", 80.38, "Target 2025; 4,013 new + 11,627 stab"),
    ]))

P.append(proj("SES-IRR-PALERU", "SPC Paleru Reservoir Project", "suspended",
    "Paleru Reservoir, Prakasam region. SES 2018-19 (Table 7.4): sanction Rs 50.50 Cr, expenditure Rs 15.07 Cr, 17%, target 12/2019. SES 2021-22 and 2024-25: 33%, 'Contract Pre-closed'.",
    cost=50.50, observations=[
        obs("19", 17, "Sanction Rs 50.50 Cr, exp Rs 15.07 Cr; 9,500 ac; target 12/2019", cost=50.50, exp=15.07),
        obs("21", 15, "Target 2021; 9,500 ac"),
        obs("22", 33, "Contract Pre-closed; 9,500 ac"),
        obs("25", 33, "Contract Pre-closed; 9,500 ac"),
    ]))

P.append(proj("SES-IRR-KORISAPADU", "YCPR Korisapadu Lift Irrigation Scheme", "under_construction",
    "Korisapadu LIS — 1.330 TMC to irrigate 20,000 acres under micro-irrigation in Korisapadu and Naguluppalapadu mandals of Prakasam district. SES 2018-19 (Table 7.3): admin approval Rs 177.00 Cr, 60%, target 06/2020. SES 2024-25: 66%, target 2025, 18,471 ac.",
    cost=177.00, district="Prakasam", observations=[
        obs("19", 60, "Admin approval Rs 177.00 Cr; 20,000 ac; target 06/2020", cost=177.00),
        obs("21", 50, "Target 2021; 20,000 ac — lower than 2018-19's 60%, as printed"),
        obs("22", 64.24, "Target 2022; 20,000 ac"),
        obs("25", 66, "Target 2025; 18,471 ac"),
    ]))

P.append(proj("SES-IRR-SIDDAPURAM", "Siddapuram Lift Irrigation Scheme", "suspended",
    "Siddapuram LIS, Kurnool region. SES 2018-19 (Table 7.4): sanction Rs 116.52 Cr, expenditure Rs 84.62 Cr, 73%, target 10/2019. SES 2020-21 prints 85%; 2021-22 72.63%; 2024-25 73.32% 'Contract Pre-closed' — non-monotonic, as printed.",
    cost=116.52, observations=[
        obs("19", 73, "Sanction Rs 116.52 Cr, exp Rs 84.62 Cr; contemplated 20,300 new + 1,000 stab, created 18,000 + 1,000; target 10/2019", cost=116.52, exp=84.62),
        obs("21", 85, "Target 2021; 2,300 ac"),
        obs("22", 72.63, "Contract Pre-closed; 2,300 ac — lower than 2020-21's 85%, as printed"),
        obs("25", 73.32, "Contract Pre-closed; 9,300 ac"),
    ]))

# ---------------------------------------------------------------- Modernization (rows 31-36)
P.append(proj("SES-IRR-MOD-NAGAVALI", "Modernization of Nagavali System (Thotapalli Old Canal system)", "under_construction",
    "Modernization of the existing Nagavali left/right main canal system (Sadar Gowthu Lachanna Thotapalli old regulator system), Srikakulam/Vizianagaram region. SES 2018-19 (Table 7.4): sanction Rs 195.34 Cr, expenditure nil, 6%, target 5/2021. SES 2024-25: 23.38%, target 2025.",
    cost=195.34, observations=[
        obs("19", 6, "Sanction Rs 195.34 Cr, exp Rs 0.00 Cr; target 5/2021", cost=195.34, exp=0.00),
        obs("21", 9.38, "Target 2021; 64,000 ac stab"),
        obs("22", 10.50, "Target 2022"),
        obs("25", 23.38, "Target 2025"),
    ]))

P.append(proj("SES-IRR-MOD-YELERU", "Modernisation of Yeleru Delta System (Phase-I)", "under_construction",
    "Yeleru Delta modernization, Kakinada/East Godavari region — stabilisation of ayacut. SES 2018-19 (Table 7.4): sanction Rs 295.83 Cr, expenditure Rs 65.31 Cr, 29%, target 02/2024. SES 2024-25: 69%, target 2026.",
    cost=295.83, observations=[
        obs("19", 29, "Sanction Rs 295.83 Cr, exp Rs 65.31 Cr; 14,000 new + 53,017 stab contemplated (53,017 created); target 02/2024", cost=295.83, exp=65.31),
        obs("21", 20, "Target 2022 — lower than 2018-19's 29%, as printed"),
        obs("22", 69, "Phase-I; target 2023"),
        obs("25", 69, "Phase-I; target 2026"),
    ]))

P.append(proj("SES-IRR-MOD-GODAVARI-DELTA", "Modernisation of Godavari Delta System", "suspended",
    "Godavari Delta modernization — stabilisation of ayacut in East and West Godavari districts (10.38 lakh acre delta). SES 2018-19 (Table 7.3): admin approval Rs 3,361.00 Cr, 64%, target 06/2020. Printed 52% (2020-21), 53% (2021-22), 55% 'Preclosed' (2024-25) — all lower than 2018-19's 64%, as printed.",
    cost=3361.00, observations=[
        obs("19", 64, "Admin approval Rs 3,361.00 Cr; 1,013,000 ac stab; target 06/2020", cost=3361.00),
        obs("21", 52, "Target 2023 — lower than 2018-19's 64%, as printed"),
        obs("22", 53, "Target 2023"),
        obs("25", 55, "Printed 'Preclosed'"),
    ]))

P.append(proj("SES-IRR-MOD-KRISHNA-DELTA", "Modernisation of Krishna Delta System", "suspended",
    "Krishna Delta modernization — stabilisation of ayacut in West Godavari, Krishna, Guntur and Prakasam districts (13.08 lakh acre delta). SES 2018-19 (Table 7.3): admin approval Rs 4,573.00 Cr, 65%, target 05/2020. SES 2024-25: 83.70%, 'Preclosed'.",
    cost=4573.00, observations=[
        obs("19", 65, "Admin approval Rs 4,573.00 Cr; 1,307,882 ac stab; target 05/2020", cost=4573.00),
        obs("21", 72.09, "Target 2021"),
        obs("22", 72.36, "Target 2022"),
        obs("25", 83.70, "Printed 'Preclosed'"),
    ]))

P.append(proj("SES-IRR-MOD-PENNA-DELTA", "Modernisation of Penna Delta System (Nellore & Sangam Barrages, Kanupur and Pennar Delta canals)", "completed",
    "Penna Delta modernization, Nellore region — four components. SES 2018-19 (Table 7.3): Pennar River Canal System Rs 569.33 Cr (87%), Sangam Barrage Rs 147.50 Cr (68%), Nellore Barrage Rs 192.11 Cr (86%), Kanupur Canal Rs 137.70 Cr (66%). SES 2024-25 prints Nellore Barrage 97% 'completed', Sangam Barrage 98% 'completed', Kanupur Canal 72.37% 'Contract Pre-closed except package no.4', Pennar Delta Canal 88.65% 'Contract Pre-closed'. Status here reflects the two barrages the source marks completed; the canal components are printed pre-closed.",
    cost=569.33, district="Nellore", observations=[
        obs("19", None, "Pennar River Canal 87% (Rs 569.33 Cr), Sangam Barrage 68% (Rs 147.50 Cr), Nellore Barrage 86% (Rs 192.11 Cr), Kanupur Canal 66% (Rs 137.70 Cr); targets 09/2019-03/2020"),
        obs("21", None, "Nellore Barrage 86.55%, Sangam Barrage 87.98%, Kanupur Canal 79.63%, Penna Delta Canal 78.46%; targets 2021"),
        obs("22", None, "Nellore Barrage 87.00%, Sangam Barrage 88.30%, Kanupur Canal 77.37% (pre-closed except pkg 4), Pennar Delta Canal 88.65% (pre-closed)"),
        obs("25", None, "Nellore Barrage 97% completed; Sangam Barrage 98% completed; Kanupur Canal 72.37% pre-closed except pkg 4; Pennar Delta Canal 88.65% pre-closed"),
    ]))

P.append(proj("SES-IRR-MOD-TBP", "Modernisation of TBP High Level & Low Level Canals (TBPHLC / TBPLLC)", "suspended",
    "Tungabhadra Project canal modernization including MP South Canal and Guntakal Branch Canal, Anantapur/Kurnool region. SES 2018-19 (Table 7.4): TBP-LLC Rs 179.00 Cr (exp Rs 159.34 Cr, 66%); TBP-HLC Rs 1,265.88 Cr (expenditure printed merged). SES 2024-25: HLC 68% 'Contract Pre-closed', LLC 96% 'Works are Pre-closed'.",
    cost=1265.88, observations=[
        obs("19", 66, "TBP-LLC: Rs 179.00 Cr, exp Rs 159.34 Cr, 66%. TBP-HLC: Rs 1,265.88 Cr sanction (exp printed merged)", cost=1265.88),
        obs("21", 49.07, "HLC (incl. MP South & Guntakal Branch canals) 49.07% target 2022; LLC 47.45% target 2021"),
        obs("22", 68, "HLC 68% Contract Pre-closed; LLC 96% Works Pre-closed"),
        obs("25", 68, "HLC 68% Contract Pre-closed; LLC 96% Works Pre-closed"),
    ]))

# ---------------------------------------------------------------- Flood banks (rows 37-40)
P.append(proj("SES-IRR-FB-VAMSADHARA-NAGAVALI", "Flood Banks of Vamsadhara & Nagavali", "under_construction",
    "Flood protection banks on the Vamsadhara and Nagavali rivers, Srikakulam region. SES 2018-19 (Table 7.4): sanction Rs 1,055.60 Cr, expenditure Rs 72.01 Cr, 25%, target 11/2020. SES 2024-25: 22.84%, target 2025 — lower than 2018-19, as printed.",
    cost=1055.60, observations=[
        obs("19", 25, "Sanction Rs 1,055.60 Cr, exp Rs 72.01 Cr; target 11/2020", cost=1055.60, exp=72.01),
        obs("21", 50.57, "Nagavali flood banks 50.57% (works closed); Vamsadhara 8.96% target 2022"),
        obs("22", 23.37, "Combined 23.37% works pre-closed; Vamsadhara row 8.96% target 2022"),
        obs("25", 22.84, "Target 2025"),
    ]))

P.append(proj("SES-IRR-FB-KRISHNA", "Flood Banks of Krishna River", "completed",
    "Krishna river flood banks (including Ramalingeswara Nagar flood protection wall at Vijayawada). SES 2018-19 (Table 7.4): sanction Rs 398.15 Cr, expenditure Rs 246.90 Cr, 96%. SES 2024-25: Krishna Left Flood Bank 100% 'Works are Completed'; Right Flood Bank 96.31% 'Works are Pre-closed'.",
    cost=398.15, observations=[
        obs("19", 96, "Sanction Rs 398.15 Cr, exp Rs 246.90 Cr, 96%", cost=398.15, exp=246.90),
        obs("21", 95, "95% — printed 'Completed'"),
        obs("22", 90, "Ramalingeswara Nagar Flood Protection Wall 90%, target 2021"),
        obs("25", 100, "Left Flood Bank 100% completed; Right Flood Bank 96.31% pre-closed"),
    ]))

P.append(proj("SES-IRR-FB-KURNOOL-NANDYAL", "Flood Banks in Kurnool and Nandyal", "suspended",
    "Flood banks in Kurnool and Nandyal districts. SES 2018-19 (Table 7.4): Kurnool Rs 244.70 Cr (exp Rs 1.17 Cr, 1%); Nandyal Rs 97.51 Cr (exp Rs 12.32 Cr, 13%). SES 2024-25: Kurnool 0.86%, Nandyal 20%, 'Works are Pre-closed'.",
    cost=244.70, observations=[
        obs("19", 1, "Kurnool: Rs 244.70 Cr, exp Rs 1.17 Cr, 1%. Nandyal: Rs 97.51 Cr, exp Rs 12.32 Cr, 13%", cost=244.70, exp=1.17),
        obs("21", None, "Printed: 'The Works are closed'"),
        obs("22", 20, "Kurnool and Nandyal 20%, works pre-closed"),
        obs("25", 0.86, "Kurnool 0.86%, Nandyal 20%; Works are Pre-closed"),
    ]))

P.append(proj("SES-IRR-FB-NELLORE", "Flood Banks in Nellore District (Swarnamukhi, Tsallakalva, Kandaleru & Kalangi)", "suspended",
    "Flood banks in Nellore district. SES 2018-19 (Table 7.4): sanction Rs 652.70 Cr. SES 2024-25: Swarnamukhi & Tsallakalva 88.75% 'Works are Pre-closed'; Kandaleru & Kalangi 50% (pre-closed for Kandaleru; EOT proposals submitted for Kalangi).",
    cost=652.70, district="Nellore", observations=[
        obs("19", None, "Sanction Rs 652.70 Cr (no progress % printed)", cost=652.70),
        obs("21", 55.64, "Modernisation of Flood Banks in Nellore Dist. 55.64%, target 2022"),
        obs("22", 50, "50%; pre-closure proposals submitted for approval"),
        obs("25", None, "Swarnamukhi & Tsallakalva 88.75% pre-closed; Kandaleru & Kalangi 50%, EOT proposals for Kalangi"),
    ]))

# ---------------------------------------------------------------- SPV projects (SES 2024-25 Annexure 7.3)
P.append(proj("SES-IRR-RAYALASEEMA-LIFT", "Rayalaseema Lift Scheme (Sangameswaram)", "under_construction",
    "Rayalaseema Lift Scheme — to draw and utilise 3 TMC per day from Sangameswaram (Srisailam foreshore) to SRMC at Km 4 from Pothireddypadu Head Regulator; implemented through the SPV APRDMPDCL. SES 2024-25 (Annexure 7.3): 18.42%, target 2025, stabilizing 15,12,878 acres.",
    observations=[
        obs("25c", 18.42, "Target 2025; stabilized ayacut 15,12,878 ac; implemented through APRDMPDCL (SPV)"),
    ]))

P.append(proj("SES-IRR-VEDAVATHI", "Vedavathi (Hagari) River Lift Irrigation Scheme", "under_construction",
    "Vedavathi (Hagari) river LIS, Anantapur region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 1,945.45 Cr, expenditure nil, 0%, 80,000 acres stabilization, target 12/2021. SES 2024-25 (Annexure 7.3): 7.19%, target 2025, 80,000 acres new.",
    cost=1945.45, observations=[
        obs("19", 0, "Admin sanction Rs 1,945.45 Cr, exp Rs 0.00 Cr; 80,000 ac stab; target 12/2021", cost=1945.45, exp=0.00),
        obs("25c", 7.19, "Target 2025; 80,000 ac new; implemented through APRDMPDCL (SPV)"),
    ]))

# ---------------------------------------------------------------- Projects last printed in SES 2018-19 (Tables 7.3-7.5)
P.append(proj("SES-IRR-VARIKAPUDISELA", "Varikapudisela Lift Irrigation Scheme", "approved",
    "Varikapudisela LI Scheme — new ayacut of 24,900 acres in the Macharla area of (then) Guntur district; taken up on war footing per SES 2018-19. Table 7.3: admin approval Rs 340.26 Cr, 0% progress, target 03/2021. Last appears in SES 2018-19; later editions on record do not list it.",
    cost=340.26, observations=[
        obs("19", 0, "Admin approval Rs 340.26 Cr; 24,900 ac new; target 03/2021; taken up on war footing", cost=340.26),
    ]))

P.append(proj("SES-IRR-ILR-VAMSADHARA-NAGAVALI", "Inter-linking of Vamsadhara and Nagavali Rivers", "under_construction",
    "River interlinking, Srikakulam region. SES 2018-19 (Table 7.4): admin sanction Rs 84.90 Cr, expenditure Rs 60.66 Cr, 74%, 5,000 new + 18,527 stab acres, target 07/2020. Last appears in SES 2018-19 among editions on record.",
    cost=84.90, observations=[
        obs("19", 74, "Sanction Rs 84.90 Cr, exp Rs 60.66 Cr; 5,000 new + 18,527 stab; target 07/2020", cost=84.90, exp=60.66),
    ]))

P.append(proj("SES-IRR-ILR-NAGAVALI-CHAMPAVATI", "Inter-linking of Nagavali River with Champavati", "under_construction",
    "River interlinking, Vizianagaram region. SES 2018-19 (Table 7.4): admin sanction Rs 24.80 Cr, expenditure nil, 4%, 2,950 acres stabilization, target 07/2020. Last appears in SES 2018-19 among editions on record.",
    cost=24.80, observations=[
        obs("19", 4, "Sanction Rs 24.80 Cr, exp Rs 0.00 Cr; 2,950 ac stab; target 07/2020", cost=24.80, exp=0.00),
    ]))

P.append(proj("SES-IRR-ILR-VAMSADHARA-BAHUDA", "Inter-linking of Vamsadhara and Bahuda Rivers", "approved",
    "River interlinking, Srikakulam region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 6,329.42 Cr, expenditure nil, 0%, 90,000 new + 110,000 stab acres, target 03/2022. Last appears in SES 2018-19 among editions on record.",
    cost=6329.42, observations=[
        obs("19", 0, "Admin sanction Rs 6,329.42 Cr, exp Rs 0.00 Cr; 90,000 new + 110,000 stab; target 03/2022", cost=6329.42, exp=0.00),
    ]))

P.append(proj("SES-IRR-VISSANNAPETA", "Vissannapeta - Chanubanda Lift Irrigation Scheme", "approved",
    "Vissannapeta–Chanubanda LIS, NTR/Krishna region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 698.90 Cr, expenditure nil, 0%, 50,000 acres stabilization. Last appears in SES 2018-19 among editions on record.",
    cost=698.90, observations=[
        obs("19", 0, "Admin sanction Rs 698.90 Cr, exp Rs 0.00 Cr; 50,000 ac stab", cost=698.90, exp=0.00),
    ]))

P.append(proj("SES-IRR-ILR-GODAVARI-PENNA", "Inter-linking of Godavari - Penna Rivers (Phase-I)", "under_construction",
    "Godavari–Penna interlinking Phase-I. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 6,020.15 Cr, expenditure Rs 88.96 Cr, 1%, 961,000 acres stabilization, target 01/2021. Last appears in SES 2018-19 among editions on record.",
    cost=6020.15, observations=[
        obs("19", 1, "Admin sanction Rs 6,020.15 Cr, exp Rs 88.96 Cr; 961,000 ac stab; target 01/2021", cost=6020.15, exp=88.96),
    ]))

P.append(proj("SES-IRR-GUNTUR-CHANNEL", "Extension of Guntur Channel from Km 47.00 to 76.40", "approved",
    "Guntur Channel extension, Guntur district. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 274.53 Cr, expenditure nil, 0%, 29,000 new + 19,000 stab acres, target 03/2021. Last appears in SES 2018-19 among editions on record.",
    cost=274.53, district="Guntur", observations=[
        obs("19", 0, "Admin sanction Rs 274.53 Cr, exp Rs 0.00 Cr; 29,000 new + 19,000 stab; target 03/2021", cost=274.53, exp=0.00),
    ]))

P.append(proj("SES-IRR-VYKUNTAPURAM", "New Barrage across Krishna River near Vykuntapuram", "approved",
    "New barrage across the Krishna near Vykuntapuram village (Amaravati region). SES 2018-19 (Table 7.5, new projects): admin sanction Rs 2,169.00 Cr, expenditure nil, 0%, target 02/2021. Last appears in SES 2018-19 among editions on record.",
    cost=2169.00, observations=[
        obs("19", 0, "Admin sanction Rs 2,169.00 Cr, exp Rs 0.00 Cr; target 02/2021", cost=2169.00, exp=0.00),
    ]))

P.append(proj("SES-IRR-MUKTYALA", "Muktyala Lift Irrigation Scheme", "approved",
    "Muktyala LIS, Krishna region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 489.28 Cr, expenditure nil, 0%, 38,627 acres stabilization, target 02/2020. Last appears in SES 2018-19 among editions on record.",
    cost=489.28, observations=[
        obs("19", 0, "Admin sanction Rs 489.28 Cr, exp Rs 0.00 Cr; 38,627 ac stab; target 02/2020", cost=489.28, exp=0.00),
    ]))

P.append(proj("SES-IRR-KURNOOL-WESTERN", "Water Supply to Western Mandals of Kurnool District", "under_construction",
    "Water supply scheme for the western mandals of Kurnool district. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 224.31 Cr, expenditure Rs 33.92 Cr, 42%, 10,130 acres stabilization, target 08/2019. Last appears in SES 2018-19 among editions on record.",
    cost=224.31, district="Kurnool", observations=[
        obs("19", 42, "Admin sanction Rs 224.31 Cr, exp Rs 33.92 Cr; 10,130 ac stab; target 08/2019", cost=224.31, exp=33.92),
    ]))

P.append(proj("SES-IRR-RAJOLIBANDA", "Rajolibanda Diversion Scheme (RDS)", "approved",
    "Rajolibanda Diversion Scheme on the Tungabhadra, Kurnool region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 1,988.51 Cr, expenditure nil, 0%, 40,000 acres new, target 12/2021. Last appears in SES 2018-19 among editions on record.",
    cost=1988.51, observations=[
        obs("19", 0, "Admin sanction Rs 1,988.51 Cr, exp Rs 0.00 Cr; 40,000 ac new; target 12/2021", cost=1988.51, exp=0.00),
    ]))

P.append(proj("SES-IRR-GUNDREVULA", "Gundrevula Reservoir Project", "approved",
    "Gundrevula Reservoir on the Tungabhadra, Kurnool region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 2,890.55 Cr, expenditure nil, 0%, 265,628 acres stabilization, target 03/2024. Last appears by name in SES 2018-19 among editions on record.",
    cost=2890.55, observations=[
        obs("19", 0, "Admin sanction Rs 2,890.55 Cr, exp Rs 0.00 Cr; 265,628 ac stab; target 03/2024", cost=2890.55, exp=0.00),
    ]))

P.append(proj("SES-IRR-JEEDIPALLI-PENNAR", "Lifting of Water from Jeedipalli Reservoir to Upper Pennar Project", "under_construction",
    "Jeedipalli (HNSS) to Upper Pennar lift, Anantapur region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 805.08 Cr, expenditure Rs 55.67 Cr, 16%, 15,000 new + 10,000 stab acres, target 07/2020. Last appears in SES 2018-19 among editions on record.",
    cost=805.08, observations=[
        obs("19", 16, "Admin sanction Rs 805.08 Cr, exp Rs 55.67 Cr; 15,000 new + 10,000 stab; target 07/2020", cost=805.08, exp=55.67),
    ]))

P.append(proj("SES-IRR-JEEDIPALLI-BT", "Lifting of Water from Jeedipalli Reservoir to Bhairavanithippa Project", "under_construction",
    "Jeedipalli (HNSS) to Bhairavanithippa lift, Anantapur region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 970.31 Cr, expenditure Rs 32.00 Cr, 15%, 22,323 acres stabilization, target 10/2019. Last appears in SES 2018-19 among editions on record.",
    cost=970.31, observations=[
        obs("19", 15, "Admin sanction Rs 970.31 Cr, exp Rs 32.00 Cr; 22,323 ac stab; target 10/2019", cost=970.31, exp=32.00),
    ]))

P.append(proj("SES-IRR-CBR-HNSS", "Supply of Water from Chitravathi Balancing Reservoir (CBR) to HNSS Main Canal", "approved",
    "CBR to HNSS main canal supply scheme, Anantapur/Kadapa region. SES 2018-19 (Table 7.5, new projects): admin sanction Rs 1,797.00 Cr, expenditure nil, 0%, 12,880 acres stabilization. Last appears in SES 2018-19 among editions on record.",
    cost=1797.00, observations=[
        obs("19", 0, "Admin sanction Rs 1,797.00 Cr, exp Rs 0.00 Cr; 12,880 ac stab", cost=1797.00, exp=0.00),
    ]))

P.append(proj("SES-IRR-KC-CANAL-LIFT", "KC Canal Lift Scheme", "under_construction",
    "Kurnool-Cuddapah (KC) Canal lift, Kurnool region. SES 2018-19 (Table 7.4): sanction Rs 120.00 Cr, expenditure Rs 77.70 Cr, 65%, 268,268 acres stabilization, remark 'Going to completion'. Last appears in SES 2018-19 among editions on record.",
    cost=120.00, district="Kurnool", observations=[
        obs("19", 65, "Sanction Rs 120.00 Cr, exp Rs 77.70 Cr; 268,268 ac stab; remark: 'Going to completion'", cost=120.00, exp=77.70),
    ]))

# ---------------------------------------------------------------- Completed per SES prose
P.append(proj("SES-IRR-PATTISEEMA", "Pattiseema Lift Irrigation Scheme", "completed",
    "Pattiseema — interlinking of the Godavari and Krishna by lifting Godavari water into the Polavaram right main canal towards Krishna Delta. SES 2017-18: commissioned by March 2016 in a record one year (Limca Book of Records: fastest completed project in the country, as printed); 4.21 TMC diverted in 2015-16, 55.62 TMC in 2016-17 (crop worth Rs 5,500 Cr claimed), 95.24 TMC 'this year'. SES 2018-19: 96.94 TMC diverted to Krishna Delta during the previous year.",
    observations=[
        obs("18", 100, "Prose: commissioned March 2016; 55.62 TMC diverted 2016-17; 95.24 TMC diverted so far in 2017-18; claims as printed"),
        obs("19", 100, "Prose: 96.94 TMC diverted from Godavari to Krishna via Pattiseema last year"),
    ]))

P.append(proj("SES-IRR-PURUSHOTHAPATNAM", "Purushothapatnam Lift Irrigation Scheme", "completed",
    "Purushothapatnam LIS near Seethanagaram (East Godavari) — lifts Godavari flood water into the Polavaram left main canal to serve 2,15,000 acres under Yeleru Reservoir and Pithapuram Branch Canal during contingency, plus Visakhapatnam industrial/domestic water. Listed under 'Completed projects' in SES 2018-19.",
    observations=[
        obs("19", 100, "Listed under 'Completed projects' in SES 2018-19 ch.7"),
    ]))

P.append(proj("SES-IRR-KONDAVEETI-VAGU", "Kondaveeti Vagu Flood Water Lift Scheme", "completed",
    "Kondaveeti Vagu lift at Undavalli — lifts up to 5,000 cusecs of Kondaveeti Vagu flood water into the Krishna upstream of Prakasam Barrage to protect the Amaravati capital region from inundation. Listed under 'Completed projects' in SES 2018-19.",
    district="Guntur", observations=[
        obs("19", 100, "Listed under 'Completed projects' in SES 2018-19 ch.7"),
    ]))


def main():
    # The project row's completion_percentage is the LATEST printed figure in
    # its observation trail — an official published number, never our estimate.
    # Pages that show it also show the dated trail naming the edition it is from.
    for p in P:
        if p.get("attach_to_title"):
            continue
        latest = [o for o in p["observations"] if o.get("completion_percentage") is not None]
        if latest:
            p["completion_percentage"] = latest[-1]["completion_percentage"]

    out = {
        "state": "AP",  # key registered in verify/states.json — never the display name
        "_readme": (
            "State irrigation project register, transcribed verbatim from the Government of Andhra Pradesh's "
            "Socio-Economic Survey editions 2017-18, 2018-19, 2020-21, 2021-22 and 2024-25 (the editions on hand "
            "that print a project-wise table or status prose; 2019-20 and 2022-23 print none — honest gaps). "
            "AP publishes no online project register, so the SES is the government's own recurring project-wise record. "
            "Figures are kept exactly as printed, including percentages that move backwards between editions and "
            "targets that slip; disagreements are never reconciled. Costs are the printed admin approvals/sanctions "
            "(mostly SES 2018-19, the last edition to print them). Observation dates follow each edition's stated "
            "cutoff (see source labels); the tables themselves print no as-on date. "
            "Eye-checked against rendered page images on 2026-09-02. "
            "Load with: python scripts/load_state_projects.py"
        ),
        "projects": P,
    }
    dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed", "state_projects_seed.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n_obs = sum(len(p["observations"]) for p in P)
    print(f"Wrote {dest}: {len(P)} projects, {n_obs} observations.")


if __name__ == "__main__":
    main()
