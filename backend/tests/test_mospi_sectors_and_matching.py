"""
The PAIMANA report names sectors its own way ("Roads & Highways",
"Transmission & Distribution", "Oil & Gas"). Each must land on the site's
project type, and "port" must not fire on "transport".
"""
from app.models.project import ProjectType
from app.scrapers.mospi_projects import _norm_title, sector_type


def test_paimana_sector_names_map_to_project_types():
    assert sector_type("Roads & Highways") == ProjectType.ROADS
    assert sector_type("Railways") == ProjectType.RAILWAYS
    assert sector_type("Aviation & Aviation Infrastructure") == ProjectType.AIRPORTS
    assert sector_type("Oil & Gas") == ProjectType.INDUSTRIAL
    assert sector_type("Water Resources") == ProjectType.IRRIGATION
    assert sector_type("Transmission & Distribution") == ProjectType.POWER
    assert sector_type("Telecommunication") == ProjectType.IT_TECH
    assert sector_type("Ports & Shipping") == ProjectType.PORTS
    assert sector_type("Healthcare") == ProjectType.HEALTH
    assert sector_type("Education") == ProjectType.EDUCATION
    assert sector_type("Waste & Water") == ProjectType.URBAN_DEVELOPMENT


def test_the_old_table7_names_still_map():
    assert sector_type("ROAD TRANSPORT AND HIGHWAYS") == ProjectType.ROADS
    assert sector_type("SHIPPING AND PORTS") == ProjectType.PORTS
    assert sector_type("CIVIL AVIATION") == ProjectType.AIRPORTS


def test_unknown_sector_is_infrastructure_and_port_does_not_fire_on_transport():
    assert sector_type("Real Estate") == ProjectType.INFRASTRUCTURE
    assert sector_type("Logistics Support") == ProjectType.INFRASTRUCTURE
    assert sector_type("") == ProjectType.INFRASTRUCTURE


def test_titles_match_across_punctuation_and_case():
    assert _norm_title("Polavaram Irrigation Project") == _norm_title("POLAVARAM  IRRIGATION PROJECT.")
    assert _norm_title("4L PS Mydukur - Badvel") == _norm_title("4l ps mydukur badvel")
