"""initial schema — all core tables

Creates: projects, project_images, tenders, mous, news_articles, documents,
document_links — with every index and the provenance columns.

Revision ID: 0001
Revises:
Create Date: 2026-08-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Enum definitions (named so Postgres creates proper types)
project_status = sa.Enum(
    "ANNOUNCED", "APPROVED", "TENDERED", "UNDER_CONSTRUCTION",
    "COMPLETED", "DELAYED", "CANCELLED", "SUSPENDED",
    name="projectstatus",
)
project_type = sa.Enum(
    "INFRASTRUCTURE", "ROADS", "IRRIGATION", "POWER", "INDUSTRIAL",
    "URBAN_DEVELOPMENT", "EDUCATION", "HEALTH", "AGRICULTURE", "PORTS",
    "AIRPORTS", "RAILWAYS", "HOUSING", "TOURISM", "IT_TECH", "OTHER",
    name="projecttype",
)
image_kind = sa.Enum(
    "SITE", "PROGRESS", "RENDER", "MAP", "DOCUMENT_SCAN", "EVENT", "OTHER",
    name="imagekind",
)
tender_status = sa.Enum(
    "ACTIVE", "CLOSED", "AWARDED", "CANCELLED", "CORRIGENDUM",
    name="tenderstatus",
)
tender_type = sa.Enum(
    "WORKS", "GOODS", "SERVICES", "AUCTION", "EOI", "RFP", "OTHER",
    name="tendertype",
)
mou_status = sa.Enum(
    "SIGNED", "INVESTMENT_STARTED", "OPERATIONAL", "STALLED", "CANCELLED",
    name="moustatus",
)
mou_sector = sa.Enum(
    "MANUFACTURING", "IT_TECH", "PHARMA", "AGRICULTURE", "FOOD_PROCESSING",
    "TEXTILES", "RENEWABLE_ENERGY", "INFRASTRUCTURE", "REAL_ESTATE",
    "TOURISM", "EDUCATION", "HEALTHCARE", "LOGISTICS", "PORTS",
    "AEROSPACE", "DEFENCE", "OTHER",
    name="mousector",
)
news_category = sa.Enum(
    "POLITICS", "DEVELOPMENT", "ECONOMY", "TENDERS", "INVESTMENTS",
    "INFRASTRUCTURE", "AGRICULTURE", "EDUCATION", "HEALTH", "CRIME",
    "WEATHER", "OTHER",
    name="newscategory",
)
news_source = sa.Enum(
    "SAKSHI", "EENADU", "ANDHRA_JYOTHY", "NDTV_AP", "THE_HINDU_AP",
    "DECCAN_CHRONICLE", "NEWS_ON_AIR", "PIB", "OTHER",
    name="newssource",
)
document_type = sa.Enum(
    "BUDGET", "ASSEMBLY_BILL", "GO", "POLICY", "ANNUAL_REPORT",
    "AUDIT_REPORT", "WHITE_PAPER", "PRESS_RELEASE", "MOU_DOCUMENT",
    "PROJECT_REPORT", "OTHER",
    name="documenttype",
)
doc_translation_status = sa.Enum(
    "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "NOT_NEEDED",
    name="documenttranslationstatus",
)
link_role = sa.Enum(
    "SANCTION_ORDER", "BUDGET_ALLOCATION", "TENDER_NOTICE",
    "PROGRESS_REPORT", "AUDIT_FINDING", "AGREEMENT", "CLEARANCE",
    "REFERENCE",
    name="linkrole",
)


def upgrade() -> None:
    # ---------- projects ----------
    op.create_table(
        "projects",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_telugu", sa.String(500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("description_telugu", sa.Text(), nullable=True),
        sa.Column("project_type", project_type, nullable=False),
        sa.Column("status", project_status, nullable=False),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("mandal", sa.String(100), nullable=True),
        sa.Column("constituency", sa.String(100), nullable=True),
        sa.Column("estimated_cost_crore", sa.Float(), nullable=True),
        sa.Column("actual_cost_crore", sa.Float(), nullable=True),
        sa.Column("central_funding_crore", sa.Float(), nullable=True),
        sa.Column("state_funding_crore", sa.Float(), nullable=True),
        sa.Column("department", sa.String(200), nullable=True),
        sa.Column("implementing_agency", sa.String(200), nullable=True),
        sa.Column("announced_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_completion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_completion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completion_percentage", sa.Float(), nullable=True),
        sa.Column("source_portal", sa.String(100), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("is_translated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_scraped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_projects_external_id", "projects", ["external_id"])
    op.create_index("ix_projects_district", "projects", ["district"])
    op.create_index("ix_projects_constituency", "projects", ["constituency"])
    op.create_index("ix_projects_department", "projects", ["department"])
    op.create_index("ix_projects_status_district", "projects", ["status", "district"])
    op.create_index("ix_projects_type_status", "projects", ["project_type", "status"])
    op.create_index("ix_projects_created_at", "projects", ["created_at"])

    # ---------- project_images ----------
    op.create_table(
        "project_images",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("project_id", sa.BigInteger(),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(1000), nullable=False),
        sa.Column("thumbnail_url", sa.String(1000), nullable=True),
        sa.Column("kind", image_kind, nullable=False),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("caption_telugu", sa.Text(), nullable=True),
        sa.Column("captured_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credit", sa.String(300), nullable=True),
        sa.Column("source_name", sa.String(200), nullable=True),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("license", sa.String(120), nullable=True),
        sa.Column("is_cover", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_images_project_id", "project_images", ["project_id"])
    op.create_index("ix_project_images_captured_date", "project_images", ["captured_date"])
    op.create_index("ix_project_images_project_order", "project_images", ["project_id", "sort_order"])
    op.create_index("ix_project_images_project_cover", "project_images", ["project_id", "is_cover"])

    # ---------- tenders ----------
    op.create_table(
        "tenders",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("tender_id", sa.String(100), nullable=True, unique=True),
        sa.Column("nit_number", sa.String(200), nullable=True),
        sa.Column("title", sa.String(1000), nullable=False),
        sa.Column("title_telugu", sa.String(1000), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("description_telugu", sa.Text(), nullable=True),
        sa.Column("tender_type", tender_type, nullable=False),
        sa.Column("status", tender_status, nullable=False),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("location_description", sa.String(500), nullable=True),
        sa.Column("estimated_value", sa.Float(), nullable=True),
        sa.Column("earnest_money_deposit", sa.Float(), nullable=True),
        sa.Column("department", sa.String(200), nullable=True),
        sa.Column("division", sa.String(200), nullable=True),
        sa.Column("tender_inviting_authority", sa.String(300), nullable=True),
        sa.Column("published_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("document_download_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("document_download_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bid_submission_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bid_submission_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bid_opening_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("awarded_to", sa.String(300), nullable=True),
        sa.Column("awarded_amount", sa.Float(), nullable=True),
        sa.Column("awarded_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_portal", sa.String(100), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("document_urls", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("is_translated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_scraped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tenders_status", "tenders", ["status"])
    op.create_index("ix_tenders_district", "tenders", ["district"])
    op.create_index("ix_tenders_department", "tenders", ["department"])

    # ---------- mous ----------
    op.create_table(
        "mous",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("company_name", sa.String(300), nullable=False),
        sa.Column("company_origin", sa.String(100), nullable=True),
        sa.Column("is_foreign_investment", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_telugu", sa.String(500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("description_telugu", sa.Text(), nullable=True),
        sa.Column("investment_crore", sa.Float(), nullable=True),
        sa.Column("expected_employment", sa.Integer(), nullable=True),
        sa.Column("sector", mou_sector, nullable=False),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("location_description", sa.String(300), nullable=True),
        sa.Column("status", mou_status, nullable=False),
        sa.Column("signed_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summit_name", sa.String(200), nullable=True),
        sa.Column("expected_start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_completion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_portal", sa.String(100), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("is_translated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_scraped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_mous_company_name", "mous", ["company_name"])
    op.create_index("ix_mous_district", "mous", ["district"])
    op.create_index("ix_mous_status", "mous", ["status"])
    op.create_index("ix_mous_sector_status", "mous", ["sector", "status"])
    op.create_index("ix_mous_signed_date", "mous", ["signed_date"])

    # ---------- news_articles ----------
    op.create_table(
        "news_articles",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("headline", sa.String(500), nullable=False),
        sa.Column("headline_telugu", sa.String(500), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("summary_telugu", sa.Text(), nullable=True),
        sa.Column("full_text", sa.Text(), nullable=True),
        sa.Column("category", news_category, nullable=False),
        sa.Column("source", news_source, nullable=False),
        sa.Column("source_name", sa.String(100), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=False, unique=True),
        sa.Column("districts", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scraped_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_summarized", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_translated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_news_category", "news_articles", ["category"])
    op.create_index("ix_news_source", "news_articles", ["source"])
    op.create_index("ix_news_category_published", "news_articles", ["category", "published_at"])
    op.create_index("ix_news_source_published", "news_articles", ["source", "published_at"])
    op.create_index("ix_news_published_at", "news_articles", ["published_at"])

    # ---------- documents ----------
    op.create_table(
        "documents",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_telugu", sa.String(500), nullable=True),
        sa.Column("document_type", document_type, nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("department", sa.String(200), nullable=True),
        sa.Column("reference_number", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("description_telugu", sa.Text(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("file_type", sa.String(20), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("storage_url", sa.String(1000), nullable=True),
        sa.Column("source_portal", sa.String(100), nullable=False),
        # Provenance: the page the file was found on, integrity hash, retrieval time
        sa.Column("source_page_url", sa.String(1000), nullable=True),
        sa.Column("source_page_title", sa.String(500), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("translation_status", doc_translation_status, nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=True),
        sa.Column("translated_storage_url", sa.String(1000), nullable=True),
        sa.Column("published_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_scraped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_document_type", "documents", ["document_type"])
    op.create_index("ix_documents_year", "documents", ["year"])
    op.create_index("ix_documents_translation_status", "documents", ["translation_status"])
    op.create_index("ix_documents_type_year", "documents", ["document_type", "year"])
    op.create_index("ix_documents_department", "documents", ["department"])

    # ---------- document_links (provenance bridge) ----------
    op.create_table(
        "document_links",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("document_id", sa.BigInteger(),
                  sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.BigInteger(),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("mou_id", sa.BigInteger(),
                  sa.ForeignKey("mous.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tender_id", sa.BigInteger(),
                  sa.ForeignKey("tenders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("role", link_role, nullable=False),
        sa.Column("collected_from_url", sa.String(1000), nullable=True),
        sa.Column("collected_from_title", sa.String(500), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN mou_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN tender_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_document_links_exactly_one_entity",
        ),
    )
    op.create_index("ix_document_links_document_id", "document_links", ["document_id"])
    op.create_index("ix_document_links_project", "document_links", ["project_id", "document_id"])
    op.create_index("ix_document_links_mou", "document_links", ["mou_id", "document_id"])
    op.create_index("ix_document_links_tender", "document_links", ["tender_id", "document_id"])


def downgrade() -> None:
    op.drop_table("document_links")
    op.drop_table("documents")
    op.drop_table("news_articles")
    op.drop_table("mous")
    op.drop_table("tenders")
    op.drop_table("project_images")
    op.drop_table("projects")

    bind = op.get_bind()
    for enum in (
        link_role, doc_translation_status, document_type, news_source,
        news_category, mou_sector, mou_status, tender_type, tender_status,
        image_kind, project_type, project_status,
    ):
        enum.drop(bind, checkfirst=True)
