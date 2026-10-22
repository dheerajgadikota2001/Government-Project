"""
Place names as press releases print them, mapped to today's 28 districts.

Used by the PIB reader (app/scrapers/pib_ap.py) to decide which districts a
release is about. Only district headquarters and well-known towns or landmarks
are listed: a release naming "Srisailam" is about Nandyal, one naming "Sri City"
is about Tirupati. Every match is kept with the word as printed, so a reader can
see why a release was filed under their district.

Two rules keep this honest:
- "Polavaram" alone is never a district hit. It is also a mandal in Eluru and the
  name of the dam, so only "Polavaram district" counts for the district of 2026;
  "Polavaram Project" is listed under Eluru, where the dam sits.
- Matching is on whole words and is case sensitive, so "rajam" inside another
  word, or a lowercase common noun, does not count.
Copied from the October 2026 gathering (gather/district_happenings/places.py).
"""

import re

AP_PLACES: dict[str, list[str]] = {
 "Alluri Sitharama Raju":["Alluri Sitharama Raju","Alluri Sitarama Raju","ASR district","Paderu","Araku"],
 "Anakapalli":["Anakapalli","Anakapalle","Atchutapuram","Achutapuram","Nakkapalli","Narsipatnam","Sabbavaram","Parawada","Rambilli","Elamanchili","Yelamanchili"],
 "Ananthapuramu":["Ananthapuramu","Anantapuramu","Anantapur","Ananthapur","Guntakal","Tadipatri"],
 "Annamayya":["Annamayya","Rayachoti","Madanapalle","Rajampet"],
 "Bapatla":["Bapatla","Chirala","Repalle","Suryalanka"],
 "Chittoor":["Chittoor","Kuppam","Palamaner","Nagari"],
 "Dr. B.R. Ambedkar Konaseema":["Konaseema","Amalapuram"],
 "East Godavari":["East Godavari","Rajamahendravaram","Rajahmundry","Rajamundry","Kovvur","Nidadavole"],
 "Eluru":["Eluru","Nuzvid","Jangareddygudem","Polavaram Project","Polavaram Irrigation Project","Kolleru"],
 "Guntur":["Guntur","Amaravati","Mangalagiri","Tenali","Tadepalli"],
 "Kakinada":["Kakinada","Peddapuram","Samalkot","Samarlakota","Tuni","Pithapuram"],
 "Krishna":["Machilipatnam","Gannavaram","Gudivada","Pedana","Krishna district"],
 "Kurnool":["Kurnool","Adoni","Orvakal","Yemmiganur"],
 "Markapuram":["Markapuram","Markapur","Kanigiri","Giddalur"],
 "Nandyal":["Nandyal","Srisailam","Atmakur (Nandyal)","Banaganapalle","Ahobilam"],
 "NTR":["NTR district","NTR District","Vijayawada","Nandigama","Jaggayyapeta","Kondapalli","Tiruvuru"],
 "Palnadu":["Palnadu","Narasaraopet","Sattenapalle","Macherla","Chilakaluripet","Vinukonda"],
 "Parvathipuram Manyam":["Parvathipuram","Palakonda","Salur"],
 "Polavaram":["Polavaram district","Rampachodavaram","Chinturu"],
 "Prakasam":["Prakasam","Ongole","Kandukur","Chimakurthi","Ramayapatnam"],
 "Sri Potti Sriramulu Nellore":["Nellore","Kavali","Krishnapatnam","Kandaleru"],
 "Sri Sathya Sai":["Sri Sathya Sai","Puttaparthi","Hindupur","Dharmavaram","Penukonda","Lepakshi","Kadiri"],
 "Srikakulam":["Srikakulam","Palasa","Tekkali","Ichchapuram","Kalingapatnam","Mulapeta","Moolapeta","Arasavalli"],
 "Tirupati":["Tirupati","Tirumala","Sriharikota","Satish Dhawan","Sullurpeta","Naidupeta","Srikalahasti","Renigunta","Sri City","Satyavedu"],
 "Visakhapatnam":["Visakhapatnam","Vizag","Vishakhapatnam","Bheemunipatnam","Bhimili","Gajuwaka","Gangavaram","Simhachalam","Pendurthi"],
 "Vizianagaram":["Vizianagaram","Bhogapuram","Bobbili","Rajam","Nellimarla"],
 "West Godavari":["West Godavari","Bhimavaram","Tadepalligudem","Narsapuram","Palakollu","Tanuku"],
 "YSR Kadapa":["Kadapa","Cuddapah","YSR district","YSR Kadapa","Gandikota","Proddatur","Jammalamadugu","Kopparthy","Pulivendula","Badvel"],
}

_PATTERNS = {d: re.compile(r"\b(" + "|".join(re.escape(x) for x in v) + r")\b") for d, v in AP_PLACES.items()}


def find_places(text: str) -> dict[str, list[str]]:
    """District -> the place words printed in text that point to it."""
    hits = {}
    for d, p in _PATTERNS.items():
        m = sorted(set(p.findall(text or "")))
        if m:
            hits[d] = m
    return hits
