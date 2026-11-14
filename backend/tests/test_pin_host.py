"""
scripts/pin_host.py: a flaky government name server must not cost a day of tenders,
and a wrong address must never be used quietly.

No network: each route (system resolver, the two DNS-over-HTTPS resolvers, the
certificate check) is handed in, so every order of failure is tested.
"""

from scripts.pin_host import choose

HOST = "crda.ap.gov.in"
GOOD = "103.129.75.59"


def run(*, system=False, cloudflare=None, google=None, valid=(GOOD,), last_known=GOOD):
    def doh(url):
        return cloudflare if "cloudflare" in url else google
    return choose(HOST, last_known, resolve=lambda h: system, doh=doh,
                  verify=lambda ip, h: ip in valid, log=lambda m: None)


def test_a_working_system_resolver_needs_no_pin():
    assert run(system=True) == ("system", None)


def test_cloudflare_is_used_when_the_system_resolver_fails():
    assert run(cloudflare=GOOD) == ("cloudflare", GOOD)


def test_google_is_tried_when_cloudflare_has_no_answer():
    assert run(cloudflare=None, google=GOOD) == ("google", GOOD)


def test_the_last_known_address_is_the_last_resort():
    assert run() == ("last-known", GOOD)


def test_an_address_without_a_valid_certificate_is_never_used():
    # Cloudflare answers with an address that does not serve the host: skipped, Google's is used.
    assert run(cloudflare="10.0.0.9", google=GOOD) == ("google", GOOD)
    # The last known address moved away and nothing else answers: no pin, and the run fails loudly.
    assert run(last_known="10.0.0.9") == ("none", None)


def test_no_last_known_and_no_answer_means_no_pin():
    assert run(last_known=None) == ("none", None)
