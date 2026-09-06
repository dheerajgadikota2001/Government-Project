"""
One row per cited source, so nobody has to remember to check 139 government pages.

WHAT THIS WATCHES
Every figure in the seed files carries a citation with a URL. Those URLs are the
complete list of things that, if they change, mean the site may be out of date.
So the watcher walks them and remembers what it saw.

It never reads a figure and never writes one. It answers three questions:

  - Has the publisher put out a newer edition than the one we transcribed?
  - Has the page we transcribed from changed since?
  - Is the citation still reachable at all? (A "[source]" link that 404s is its
    own kind of wrong on a platform whose promise is that you can check.)

WHY THE FINGERPRINT IS NARROW
Government pages change something almost every day — a banner, a visitor
counter, a session id in a URL. Hashing the whole page would flag all 139 every
morning, and an alert that always fires is an alert nobody reads. So the
fingerprint prefers the server's own freshness signals (ETag, Last-Modified) and
falls back to a hash of the page's DOCUMENT LINKS only — the set of PDFs and
reports it offers. That is the part that actually moves when a new edition
lands.

WHY A CHANGE MUST BE SEEN TWICE
A single differing fingerprint is as likely to be a load-balancer serving a
slightly different page as it is to be real. A change is recorded when first
seen and only reported once it survives a second run.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SourceWatch(Base):
    __tablename__ = "source_watch"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # The seed's own citation key, e.g. "RBI-HB-T174" — so an alert can be traced
    # straight back to the entry that needs updating.
    source_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    seed_file: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    # Carried so the alert can say "NITI Aayog — Fiscal Health Index" rather than
    # printing a URL at someone.
    publisher: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    # The date the seed says this citation is from. Compared against any newer
    # edition year found on the page.
    cited_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # --- what we last saw -------------------------------------------------
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    etag: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    last_modified: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Hash of the set of document links on the page — the narrow fingerprint.
    links_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # The newest edition year seen in the page's own link text, if any.
    latest_edition: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # --- state ------------------------------------------------------------
    # ok | changed | new_edition | dead | unreachable
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="ok", index=True)
    # A difference seen once, awaiting confirmation on the next run.
    pending_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    pending_since: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set once the change survived a second run — this is what the email reports.
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Cleared by hand once the seed has been updated, which returns it to "ok".
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Reported in an alert already — so the same finding is not mailed nightly.
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # A source that changes constantly for reasons that never matter. Muted
    # sources are still checked (so a 404 is still caught) but never mailed.
    muted: Mapped[bool] = mapped_column(nullable=False, default=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Consecutive failed fetches. One is noise; five means the citation is gone.
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("ix_source_watch_key_file", "source_key", "seed_file", unique=True),
        Index("ix_source_watch_state_confirmed", "state", "confirmed_at"),
    )

    def __repr__(self) -> str:
        return f"<SourceWatch {self.source_key} {self.state}>"
