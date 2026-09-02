"""
Community models — the public message board and private correction reports.

Design principles (mirroring the platform's honesty rules):
- No accounts. A poster chooses a display name; nothing else is asked.
- No raw IP is ever stored — only a salted hash, used for rate limiting.
- Posts are never silently edited. Removal leaves a tombstone status, and
  a poster can delete their own post only with the secret token issued to
  their browser when the post was created.
- Correction reports are PRIVATE: they go to the maintainer's queue, never
  to the public board.
"""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PostStatus(str, enum.Enum):
    VISIBLE = "visible"
    HELD = "held"          # auto-hidden after reader reports; awaiting review
    REMOVED = "removed"    # removed by the maintainer or by its own author


class ForumPost(Base):
    __tablename__ = "forum_posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Where the post lives: a community topic ("general", "projects", ...)
    # OR a page thread key ("project:12", "investments", "finances", ...).
    topic: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    page_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("forum_posts.id", ondelete="CASCADE"), nullable=True, index=True
    )

    display_name: Mapped[str] = mapped_column(String(40), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    lang: Mapped[str] = mapped_column(String(5), nullable=False, default="en")

    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus), nullable=False, default=PostStatus.VISIBLE, index=True
    )
    report_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Salted hash of the poster's IP (rate limiting / abuse). Raw IP is never stored.
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    # Secret returned once to the posting browser; lets the author delete their own post.
    delete_token: Mapped[str] = mapped_column(String(64), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_forum_topic_status_created", "topic", "status", "created_at"),
        Index("ix_forum_page_status_created", "page_key", "status", "created_at"),
    )


class CorrectionStatus(str, enum.Enum):
    NEW = "new"
    REVIEWED = "reviewed"
    FIXED = "fixed"
    REJECTED = "rejected"


class CorrectionReport(Base):
    __tablename__ = "correction_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Which page / section the reader was on (free text or page key).
    page_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional way to reach the reader back (email or phone) — their choice.
    contact: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    lang: Mapped[str] = mapped_column(String(5), nullable=False, default="en")

    status: Mapped[CorrectionStatus] = mapped_column(
        Enum(CorrectionStatus), nullable=False, default=CorrectionStatus.NEW, index=True
    )
    admin_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
