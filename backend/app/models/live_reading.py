"""
Live readings: what a government dashboard said, when we read it.

Some official sources are not documents but live dashboards: APWRIMS serves
today's reservoir storage, season rainfall and tank filling as JSON, and changes
it every morning. A dashboard has no edition to cite, so the reading itself is
the record: the shaped payload, the time it was read, the "as on" the source
stamped on it, and a fingerprint of the payload.

One row per distinct payload. Reading the same numbers twice adds nothing (the
fingerprint is unique per source), so the table grows only when the source
changes, and yesterday's reading stays queryable after today's arrives. Rows are
never updated or deleted by the app.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LiveReading(Base):
    __tablename__ = "live_readings"
    __table_args__ = (
        UniqueConstraint("source_key", "payload_sha256", name="uq_live_reading_source_payload"),
        Index("ix_live_reading_source_read_at", "source_key", "read_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Stable name of what was read, e.g. "apwrims.reservoirs". Not a URL: the
    # dashboard's address can move while the thing being read stays the same.
    source_key: Mapped[str] = mapped_column(String(64), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # The source's own time stamp, as text, because each dashboard words it differently.
    as_on: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
