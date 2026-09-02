"""Import all models so SQLAlchemy registers them with Base.metadata."""

from app.database import Base
from app.models.project import Project
from app.models.project_image import ProjectImage, ImageKind
from app.models.document_link import DocumentLink, LinkRole
from app.models.tender import Tender
from app.models.mou import MOU
from app.models.news import NewsArticle
from app.models.document import Document
from app.models.progress_observation import ProgressObservation
from app.models.community import ForumPost, CorrectionReport, PostStatus, CorrectionStatus

__all__ = [
    "Base",
    "ForumPost",
    "CorrectionReport",
    "PostStatus",
    "CorrectionStatus",
    "Project",
    "ProjectImage",
    "ImageKind",
    "DocumentLink",
    "LinkRole",
    "Tender",
    "MOU",
    "NewsArticle",
    "Document",
    "ProgressObservation",
]
