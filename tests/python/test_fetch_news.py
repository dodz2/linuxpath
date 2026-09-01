"""Tests du classificateur pur du collecteur d'actualités."""

import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = (
    Path(__file__).resolve().parents[2] / ".github" / "scripts" / "fetch_news.py"
)
SPEC = importlib.util.spec_from_file_location("fetch_news", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Impossible de charger {MODULE_PATH}")
FETCH_NEWS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FETCH_NEWS)


class NewsClassifierTests(unittest.TestCase):
    def test_security_acronyms_map_to_their_modules_case_insensitively(self):
        cases = (
            ("PAM", {"m3", "m14"}),
            ("SSH", {"m3", "m9"}),
            ("DNS", {"m4"}),
            ("TCP", {"m4"}),
            ("UDP", {"m4"}),
            ("OSINT", {"m7"}),
            ("SCP", {"m9"}),
            ("SFTP", {"m9"}),
            ("VPN", {"m9"}),
            ("WireGuard", {"m9"}),
            ("Apache", {"m10"}),
            ("Nginx", {"m10"}),
            ("HTTP", {"m10"}),
            ("HTTPS", {"m10"}),
            ("TLS", {"m10"}),
            ("SSL", {"m10"}),
            ("CMS", {"m10", "m11"}),
            ("PHP", {"m10", "m11"}),
            ("WAF", {"m11"}),
            ("IDS", {"m11"}),
            ("IPS", {"m11"}),
            ("MITM", {"m11"}),
            ("DDoS", {"m11"}),
            ("DoS", {"m11"}),
            ("XSS", {"m11", "m13"}),
            ("CSRF", {"m11", "m13"}),
            ("SQL injection", {"m11", "m13"}),
            ("CVE", {"m13"}),
            ("CVSS", {"m13"}),
            ("RCE", {"m14"}),
            ("RAT", {"m14"}),
            ("IOC", {"m14"}),
        )

        for keyword, expected_modules in cases:
            for spelling in (keyword, keyword.lower(), keyword.title()):
                with self.subTest(keyword=keyword, spelling=spelling):
                    _, modules = FETCH_NEWS._generate_context(spelling, "", [])
                    self.assertEqual(set(modules), expected_modules)

    def test_keywords_without_cvss_never_invent_severity(self):
        for keyword in ("RCE", "critical", "high severity", "CVE-2026-1234"):
            with self.subTest(keyword=keyword):
                self.assertEqual(
                    FETCH_NEWS._classify_severity(keyword, []),
                    ("unevaluated", None),
                )


if __name__ == "__main__":
    unittest.main()
