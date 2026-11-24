"""
A portal that stops sending its intermediate certificate is fixed by supplying that one public intermediate,
never by turning certificate checks off.

aplegislature.org renewed its certificate on 17 Nov 2026 and from then served it without the RapidSSL
intermediate. The Legislature bills reader failed every morning from 22 Nov ("unable to get local issuer
certificate") while the site opened fine in a browser, because browsers fetch a missing intermediate and
Python does not. These tests pin the fix, offline:
  - the file in certs/ is the real RapidSSL TLS RSA CA G1, a CA certificate signed by DigiCert Global Root G2,
    and that root is in certifi's store, so the chain still ends at a trusted root
  - the intermediate is not near its end (2 Nov 2027): the test fails 60 days before, so it is replaced in time
  - partial chains stay off, so the added file can complete a chain but cannot be a trust anchor on its own
  - only the Legislature reader carries an extra intermediate, and every extra file exists and says why it is there
"""

import os
import re
import ssl
from datetime import datetime, timedelta, timezone
from pathlib import Path

import certifi
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

from app.scrapers.ap_legislature_bills import APLegislatureBillsScraper
from app.scrapers.base import CERTS_DIR, BaseScraper, _tls_context

PEM = Path(CERTS_DIR) / "RapidSSLTLSRSACAG1.pem"
SHA256 = "4422E963EE53CD58CC9F85CD40BF5FFEC0095FDF1A154535661C1C06BCADC69B"


def _cn(name: x509.Name) -> str:
    return name.get_attributes_for_oid(x509.NameOID.COMMON_NAME)[0].value


def test_the_file_is_the_rapidssl_intermediate_signed_by_a_root_certifi_trusts():
    cert = x509.load_pem_x509_certificate(PEM.read_bytes())
    assert cert.fingerprint(hashes.SHA256()).hex().upper() == SHA256
    assert _cn(cert.subject) == "RapidSSL TLS RSA CA G1"
    assert _cn(cert.issuer) == "DigiCert Global Root G2"
    assert cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca is True
    # Only the one root is parsed: some other roots in certifi's store have serials newer cryptography warns about.
    store = Path(certifi.where()).read_text(encoding="ascii")
    blocks = re.findall(r"# Subject: CN=DigiCert Global Root G2 .*?(-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----)", store, re.S)
    roots = [r for r in (x509.load_pem_x509_certificate(b.encode()) for b in blocks) if r.subject == cert.issuer]
    assert roots, "DigiCert Global Root G2 is not in certifi's store: the chain would end nowhere"
    roots[0].public_key().verify(cert.signature, cert.tbs_certificate_bytes, padding.PKCS1v15(), cert.signature_hash_algorithm)


def test_the_intermediate_is_replaced_before_it_runs_out():
    cert = x509.load_pem_x509_certificate(PEM.read_bytes())
    left = cert.not_valid_after_utc - datetime.now(timezone.utc)
    assert left > timedelta(days=60), f"RapidSSL TLS RSA CA G1 ends {cert.not_valid_after_utc:%d %b %Y}: fetch the current one"


def test_checks_stay_strict():
    ctx = _tls_context(APLegislatureBillsScraper.EXTRA_INTERMEDIATES)
    assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname
    if hasattr(ssl, "VERIFY_X509_PARTIAL_CHAIN"):
        assert not ctx.verify_flags & ssl.VERIFY_X509_PARTIAL_CHAIN


def test_only_the_portals_that_need_it_carry_an_intermediate():
    assert BaseScraper.EXTRA_INTERMEDIATES == ()
    assert APLegislatureBillsScraper.EXTRA_INTERMEDIATES == ("RapidSSLTLSRSACAG1.pem",)
    root = Path(__file__).resolve().parent.parent / "app"
    users = sorted(p.name for p in root.rglob("*.py") if re.search(r"^\s+EXTRA_INTERMEDIATES\s*=\s*\(\"", p.read_text(encoding="utf-8"), re.M))
    assert users == ["ap_legislature_bills.py"]
    for name in os.listdir(CERTS_DIR):
        text = (Path(CERTS_DIR) / name).read_text(encoding="utf-8")
        assert "Why it is here" in text and "Source:" in text, f"{name} does not say why it is there"
    assert "verify=False" not in (root / "scrapers" / "base.py").read_text(encoding="utf-8")
