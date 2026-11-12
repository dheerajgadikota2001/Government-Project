"""
The verifier: a figure passes only if the paper's own text prints it.

No database, no network, no model. The caller supplies page texts and approved facts,
so every rule is tested with plain dictionaries. The cases that matter most are the
ones a confident model gets wrong: a quote that is not in the paper, a quote on another
page, a number the quote does not print (a sum, a rounding, a conversion), and a copy
of a fact already approved.
"""

import pytest

from app.services.fact_verifier import KnownFact, Proposal, fold, verify

PAGES = {
    12: "Statement 27. Outstanding liabilities of the state\nAs at the end of March 2024 the outstanding liabilities "
        "stood at Rs. 4,85,490 crore, up from Rs. 4,42,442 crore in the audited accounts.",
    13: "Guarantees given by the state stood at Rs. 1,25,000 crore at the end of March 2024.",
}
QUOTE = "the outstanding liabilities stood at Rs. 4,85,490 crore"


def proposal(**over) -> Proposal:
    base = dict(indicator="outstanding_liabilities", value="4,85,490", period="2023-24", quote=QUOTE,
                source_url="https://example.test/rbi.pdf", page=12, unit="Rs. crore", stage="A")
    return Proposal(**(base | over))


def test_a_figure_the_paper_prints_on_the_named_page_passes_with_evidence():
    v = verify(proposal(), PAGES)
    assert v.ok and v.reasons == []
    assert "4,85,490" in v.evidence and "statement 27" in v.evidence.lower()
    assert v.page_found == 12


def test_spacing_case_and_quote_shapes_do_not_matter_because_pdf_text_changes_them():
    messy = "The  outstanding\nliabilities   STOOD at Rs. 4,85,490\u00a0crore"
    assert verify(proposal(quote=messy), PAGES).ok
    assert fold("It\u2019s \u201cfine\u201d \u2013 yes") == "it's \"fine\" - yes"


def test_a_quote_that_is_not_in_the_paper_is_rejected():
    v = verify(proposal(quote="the state owes about Rs. 4,85,490 crore in total"), PAGES)
    assert not v.ok and "not in the paper text" in v.reasons[0]


def test_a_quote_on_another_page_is_a_wrong_citation_and_says_which_page():
    v = verify(proposal(page=13), PAGES)
    assert not v.ok and "on page 12, not page 13" in v.reasons[0]
    assert v.page_found == 12


def test_a_page_that_is_not_in_the_stored_text_is_rejected():
    v = verify(proposal(page=99), PAGES)
    assert not v.ok and "page 99 is not in the stored text" in v.reasons[0]


def test_a_number_the_quote_does_not_print_is_rejected_so_no_sums_or_roundings_pass():
    for bad in ("4,85,000", "9,28,000", "4.85 lakh crore"):
        v = verify(proposal(value=bad), PAGES)
        assert not v.ok, bad
        assert "the quote does not print" in v.reasons[0]


def test_a_value_with_no_figure_is_rejected():
    v = verify(proposal(value="rose sharply"), PAGES)
    assert not v.ok and "no figure" in v.reasons[0]


def test_a_value_with_two_numbers_needs_both_in_the_quote():
    assert not verify(proposal(value="4,85,490 + 4,42,442"), PAGES).ok
    both = "Rs. 4,85,490 crore, up from Rs. 4,42,442 crore"
    assert verify(proposal(value="4,85,490", quote=both), PAGES).ok


def test_missing_fields_and_no_paper_text_never_pass_silently():
    assert "indicator is missing" in verify(proposal(indicator=""), PAGES).reasons
    assert "page is missing" in verify(proposal(page=None), PAGES).reasons
    assert not verify(proposal(), {}).ok
    assert "nothing could be checked" in verify(proposal(), {12: "   "}).reasons[0]


def test_a_quote_that_is_too_short_or_too_long_is_rejected():
    assert not verify(proposal(quote="4,85,490"), PAGES).ok
    assert not verify(proposal(quote="x" * 700), PAGES).ok


def test_a_copy_of_an_approved_fact_is_rejected_and_a_different_figure_is_flagged():
    same = KnownFact(7, "outstanding_liabilities", "2023-24", "A", "485490")
    v = verify(proposal(), PAGES, [same])
    assert not v.ok and "already approved as fact #7" in v.reasons[0]

    other = KnownFact(8, "outstanding_liabilities", "2023-24", "A", "4,42,442")
    v = verify(proposal(), PAGES, [other])
    assert v.ok and any("differs from approved fact #8" in f for f in v.flags)

    other_stage = KnownFact(9, "outstanding_liabilities", "2023-24", "RE", "4,85,490")
    assert verify(proposal(), PAGES, [other_stage]).ok            # a different stage is a different fact


def test_flags_ask_a_person_to_look_without_failing_the_proposal():
    v = verify(proposal(period="2019-20", unit="Rs. lakh", stage=""), PAGES)
    assert v.ok
    assert "the period's year is not on the quoted page" in v.flags
    assert "the unit is not on the quoted page" in v.flags
    assert any("no stage given" in f for f in v.flags)
    assert verify(proposal(), PAGES).flags == []
