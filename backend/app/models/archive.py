"""
The archive register: which government files we hold, and where and when each
was fetched.

The bytes live in the object store (app/services/archive.py), named by SHA-256.
These two tables are the index a page needs without touching the store:
`archived_files` has one row per distinct file; `archived_file_sources` has one
row per place we found it. A budget volume served at two URLs, or re-fetched on
two dates with identical bytes, is one file with several sources. Bytes that
change at the same URL become a second file, and the register shows both, dated:
that is how a quietly edited government PDF gets noticed.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ArchivedFile(Base):
    __tablename__ = "archived_files"

    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    stored_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    codec: Mapped[str] = mapped_column(String(10), nullable=False)          # "zstd" or "none"
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    page_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Set by scripts/archive_audit.py. A failed check hides the file from readers
    # until a person looks; it is never deleted automatically.
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    integrity_problem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ArchivedFileSource(Base):
    __tablename__ = "archived_file_sources"
    __table_args__ = (
        UniqueConstraint("sha256", "url", name="uq_archived_source_sha_url"),
        Index("ix_archived_source_url", "url"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sha256: Mapped[str] = mapped_column(String(64), ForeignKey("archived_files.sha256", ondelete="CASCADE"), nullable=False, index=True)
    # The file's own address on the government site, or "local:<path>" for a file
    # Dheeraj downloaded by hand, whose address is then filled in from his note.
    url: Mapped[str] = mapped_column(Text, nullable=False)
    page_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)      # the page the link was on
    publisher: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    first_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
