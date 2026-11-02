"""
The address every per-client rule keys on.

The rule under test: X-Forwarded-For is read from the right, where proxies
append, and never from the left, where the client writes. A forged leftmost
entry must not change the key; a request through the CDN edge must resolve to
the reader behind it; a request straight to the service must resolve to the
caller itself.
"""

import pytest
from starlette.requests import Request

from app import client_address as ca
from app.rate_limit import limiter

EDGE = "23.235.32.10"          # inside Fastly's published 23.235.32.0/20
READER = "49.205.10.77"        # a reader on an Indian mobile network
ATTACKER = "203.0.113.9"


def req(xff: str | None, peer: str = "10.0.0.1") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    scope = {"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (peer, 1234),
             "query_string": b"", "scheme": "https", "server": ("api", 443)}
    return Request(scope)


def test_behind_the_edge_the_reader_is_the_second_from_the_right():
    assert ca.client_address(req(f"{READER}, {EDGE}")) == READER


def test_a_forged_leftmost_entry_changes_nothing():
    forged = req(f"1.1.1.1, {READER}, {EDGE}")
    assert ca.client_address(forged) == READER
    many = req(f"8.8.8.8, 9.9.9.9, 1.1.1.1, {READER}, {EDGE}")
    assert ca.client_address(many) == READER


def test_a_direct_caller_is_the_rightmost_entry():
    """Straight to the run.app address: the only machine that appended is Google's front end, which wrote the caller."""
    assert ca.client_address(req(f"{READER}, {ATTACKER}")) == ATTACKER
    assert ca.client_address(req(ATTACKER)) == ATTACKER


def test_a_direct_caller_cannot_borrow_the_edge_by_writing_it():
    """A caller who writes an edge address on the left is still the rightmost, real entry."""
    assert ca.client_address(req(f"{EDGE}, {ATTACKER}")) == ATTACKER


def test_an_edge_with_nothing_behind_it_is_itself():
    assert ca.client_address(req(EDGE)) == EDGE


def test_a_malformed_header_falls_back_to_the_socket_peer():
    assert ca.client_address(req("not-an-address", peer="10.9.8.7")) == "10.9.8.7"
    assert ca.client_address(req(None, peer="10.9.8.7")) == "10.9.8.7"


def test_ipv6_edges_are_recognised_too():
    nets = ca.edge_networks()
    assert any(n.version == 6 for n in nets) and any(n.version == 4 for n in nets)


def test_the_limiter_and_the_board_use_this_rule():
    assert limiter._key_func is ca.client_address
    from app.routers import community
    a = community._ip_hash(req(f"1.1.1.1, {READER}, {EDGE}"))
    b = community._ip_hash(req(f"2.2.2.2, {READER}, {EDGE}"))
    c = community._ip_hash(req(f"1.1.1.1, {ATTACKER}, {EDGE}"))
    assert a == b and a != c


def test_explain_names_the_rule_it_used():
    e = ca.explain(req(f"1.1.1.1, {READER}, {EDGE}"))
    assert e["chosen"] == READER and e["rightmost_is_edge"] and "second from the right" in e["rule"]
