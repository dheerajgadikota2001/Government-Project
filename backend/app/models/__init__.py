"""Import all models so SQLAlchemy registers them with Base.metadata."""

from app.database import Base
from app.models.project import Project
from app.models.tender import Tender
from app.models.mou import MOU
from app.models.news import NewsArticle
from app.models.document import Document

__all__ = ["Base", "Project", "Tender", "MOU", "NewsArticle", "Document"]
