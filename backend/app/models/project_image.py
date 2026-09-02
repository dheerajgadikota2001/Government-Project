"""
Project images — photographs of a project, ordered so a citizen can see
how it actually progressed over time.

Images are only ever shown when they exist. There is no placeholder and no
stock photography: an empty gallery renders nothing at all, because an
invented picture of a government project is worse than no picture.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ImageKind(str, enum.Enum):
    """What the photograph shows — drives grouping in the detail gallery."""
    SITE = "site"                 # The site / works as they stand
    PROGRESS = "progress"         # Dated progress shot
    RENDER = "render"             # Official artist impression or DPR render
    MAP = "map"                   # Route map, layout plan, satellite view
    DOCUMENT_SCAN = "document_scan"  # Photographed page from a G.O. or report
    EVENT = "event"               # Foundation stone, inauguration
    OTHER = "other"


class ProjectImage(Base):
    __tablename__ = "project_images"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Where the image actually lives. `url` is what the frontend loads —
    # either the original host or your own cached copy.
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    kind: Mapped[ImageKind] = mapped_column(
        Enum(ImageKind), nullable=False, default=ImageKind.SITE
    )

    # Shown under the image. Keep it factual — what and when, not adjectives.
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    caption_telugu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # When the photo was TAKEN (not when we ingested it). This is what makes
    # a gallery a progress record rather than a pile of pictures.
    captured_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Attribution — mandatory in spirit even where nullable in the schema.
    credit: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    source_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    license: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # Exactly one image per project may carry is_cover=True. The list card
    # uses it; when no image is marked, the card renders with no photo area.
    is_cover: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Manual ordering within the gallery; ties break on captured_date.
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project = relationship("Project", back_populates="images")

    __table_args__ = (
        Index("ix_project_images_project_order", "project_id", "sort_order"),
        Index("ix_project_images_project_cover", "project_id", "is_cover"),
    )

    def __repr__(self) -> str:
        return f"<ProjectImage id={self.id} project_id={self.project_id} kind={self.kind}>"
