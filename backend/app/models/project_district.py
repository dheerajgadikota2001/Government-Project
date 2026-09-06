"""
Which districts a project actually touches — because one column could not say.

WHY THIS TABLE EXISTS
`projects.district` is a single nullable string, and that shape is wrong for the
projects that matter most. Thotapalli Barrage lies across Parvathipuram Manyam,
Vizianagaram and Srikakulam. Polavaram's dam is in Eluru, its submergence
reaches Alluri Sitharama Raju and East Godavari, and its canals run to
Visakhapatnam and Krishna.

Asked "which district is Polavaram in", the honest answer is that the question
has no single answer — which is very likely why the Socio-Economic Survey's own
table prints no district column for these projects at all. Forty-eight projects
therefore sat with a NULL district and were shown to readers as "statewide",
which was not what the source said and not what is true.

Filling that column with one district would have been worse than leaving it
empty: it would have looked sourced.

WHAT A ROW MEANS
One row is one claim: "this project touches this district, in this way,
according to this document." The citation is not optional — a district recorded
here without a source_url is the same invention the NULL was protecting us from,
just harder to spot later.

`role` carries the part that a single district field always lost:

    primary       the works themselves — the dam, the barrage, the headworks
    spans         the project body extends across this district
    submergence   land here goes under water
    canal         a canal or distributary network reaches here
    ayacut        this district's land is irrigated by it
    stated        the source named this district and said no more

WHY projects.district STAYS
It remains the single "primary" district, so every existing query, filter and
index keeps working while this table is filled. It is a cache of the primary row
here, not a second source of truth — the backfill writes both.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DistrictRole:
    """Not an Enum on purpose.

    A new source will describe a relationship none of these words cover, and a
    Postgres enum would need a migration to admit it. The check is in the
    backfill and the API, where a bad value can be reported, rather than in a
    type that turns it into a 500.
    """

    PRIMARY = "primary"
    SPANS = "spans"
    SUBMERGENCE = "submergence"
    CANAL = "canal"
    AYACUT = "ayacut"
    STATED = "stated"

    ALL = (PRIMARY, SPANS, SUBMERGENCE, CANAL, AYACUT, STATED)


class ProjectDistrict(Base):
    __tablename__ = "project_districts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # The canonical district name, already folded by normalise_district — the
    # same spelling the map and the filters use, so a join never has to guess.
    district: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=DistrictRole.STATED)

    # The citation. A row without one is an assertion nobody can check, which is
    # the one thing this platform must not publish.
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # The sentence the district was read from, so a reader can see the wording
    # rather than take our word for the reading.
    source_quote: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project = relationship("Project", backref="district_links")

    __table_args__ = (
        # One claim per project per district per role: a project can be both
        # "canal" and "ayacut" in the same district, and both are worth keeping,
        # but the same claim twice is a double count on the map.
        UniqueConstraint("project_id", "district", "role", name="uq_project_district_role"),
        Index("ix_project_districts_district_role", "district", "role"),
    )

    def __repr__(self) -> str:
        return f"<ProjectDistrict p{self.project_id} {self.district} ({self.role})>"
