"""
News topics — the reader-facing grouping of collected articles.

A topic is OUR grouping of articles the outlets published, decided by the
article's stored category and by words that appear in its own headline or
summary. It is a way to browse, never a claim about the article and never a
judgement of its accuracy: the article's own headline, outlet and link always
travel with it.

Keep this list short and readable. Every topic must be something a citizen
would actually look for.
"""

# key, label, the stored categories that belong to it, and words that -- when
# they appear in the article's own headline/summary -- put it in this topic.
NEWS_TOPICS = [
    {
        "key": "government_policy",
        "label": "Government & Policy",
        "label_telugu": "ప్రభుత్వం & విధానాలు",
        "blurb": "Orders, cabinet decisions, assembly business, schemes and administration.",
        "categories": ["politics", "development", "tenders"],
        "keywords": [
            "government order", "g.o.", "cabinet", "assembly", "policy", "scheme",
            "minister", "chief minister", "secretariat", "ordinance", "notification",
            "bill", "amendment", "governance", "tender", "welfare", "pension",
        ],
    },
    {
        "key": "business",
        "label": "Business",
        "label_telugu": "వ్యాపారం",
        "blurb": "Companies, factories, industry and jobs in Andhra Pradesh.",
        "categories": ["investments"],
        "keywords": [
            "company", "firm", "factory", "plant", "industry", "industrial",
            "manufacturing", "msme", "startup", "investment", "expansion",
            "employment", "jobs", "unit", "park",
        ],
    },
    {
        "key": "markets_finance",
        "label": "Markets & Finance",
        "label_telugu": "మార్కెట్లు & ఆర్థికం",
        "blurb": "Budgets, borrowing, banks, taxes and the state's public finances.",
        "categories": ["economy"],
        "keywords": [
            "budget", "debt", "borrowing", "loan", "bond", "fiscal", "deficit",
            "revenue", "gst", "tax", "bank", "rbi", "cag", "audit", "market",
            "crore", "finance",
        ],
    },
    {
        "key": "trade",
        "label": "Trade",
        "label_telugu": "వాణిజ్యం",
        "blurb": "Exports, imports, ports, cargo and logistics.",
        "categories": [],
        "keywords": [
            "export", "import", "trade", "port", "cargo", "shipment", "customs",
            "sez", "logistics", "container", "freight", "harbour", "harbor",
        ],
    },
    {
        "key": "energy_commodities",
        "label": "Energy & Commodities",
        "label_telugu": "ఇంధనం & సరుకులు",
        "blurb": "Power, renewables, fuel, mining and raw materials.",
        "categories": [],
        "keywords": [
            "power", "electricity", "solar", "wind", "thermal", "coal", "oil",
            "gas", "petroleum", "energy", "renewable", "discom", "grid",
            "mining", "cement", "steel", "megawatt", "pump", "hydro",
        ],
    },
    {
        "key": "technology",
        "label": "Technology",
        "label_telugu": "సాంకేతికత",
        "blurb": "IT, electronics, data centres, digital services and telecom.",
        "categories": [],
        "keywords": [
            "technology", "software", "data centre", "data center", "semiconductor",
            "electronics", "artificial intelligence", " ai ", "digital", "drone",
            "telecom", "5g", "chip", "it park", "internet", "cyber",
        ],
    },
    {
        "key": "climate_weather",
        "label": "Climate & Weather",
        "label_telugu": "వాతావరణం",
        "blurb": "Rain, cyclones, floods, drought and climate impacts.",
        "categories": ["weather", "agriculture"],
        "keywords": [
            "rain", "rainfall", "cyclone", "flood", "drought", "monsoon",
            "heat wave", "heatwave", "climate", "weather", "imd", "temperature",
            "storm", "reservoir", "crop damage",
        ],
    },
    {
        "key": "health",
        "label": "Health",
        "label_telugu": "ఆరోగ్యం",
        "blurb": "Hospitals, medical care, disease and public health.",
        "categories": ["health"],
        "keywords": [
            "hospital", "health", "medical", "doctor", "patient", "disease",
            "vaccine", "arogyasri", "medicine", "clinic", "dengue", "outbreak",
            "nurse", "surgery",
        ],
    },
]

TOPIC_KEYS = {t["key"] for t in NEWS_TOPICS}


def topic_by_key(key: str):
    return next((t for t in NEWS_TOPICS if t["key"] == key), None)
