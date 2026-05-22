#!/usr/bin/env python3
"""fetch_news.py — Parse des flux RSS cybersécurité et génère data/news.json"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from hashlib import md5
from html import unescape
from xml.etree import ElementTree
from urllib.request import urlopen, Request
from urllib.error import URLError

NEWS_FILE = "data/news.json"
MAX_ITEMS = 30

FEEDS = [
    {
        "name": "CERT-FR",
        "url": "https://www.cert.ssi.gouv.fr/feed/",
        "source_label": "CERT-FR",
        "source_url": "https://www.cert.ssi.gouv.fr",
        "lang": "fr"
    },
    {
        "name": "The Hacker News",
        "url": "https://thehackernews.com/feeds/posts/default",
        "source_label": "The Hacker News",
        "source_url": "https://thehackernews.com",
        "lang": "en"
    },
    {
        "name": "Bleeping Computer",
        "url": "https://www.bleepingcomputer.com/feed/",
        "source_label": "Bleeping Computer",
        "source_url": "https://www.bleepingcomputer.com",
        "lang": "en"
    },
    {
        "name": "Krebs on Security",
        "url": "https://krebsonsecurity.com/feed/",
        "source_label": "Krebs on Security",
        "source_url": "https://krebsonsecurity.com",
        "lang": "en"
    }
]

SEVERITY_KEYWORDS = {
    "critical": [
        r"\bcritical\b", r"\bcritique\b", r"\bzero.day\b", r"\bCVE-\d{4}-\d{4,}\b",
        r"\brescale\b", r"\bprivilege escalation\b", r"\broot\b", r"\bRCE\b",
        r"\barbitrary code\b", r"\bremote code\b", r"\bCVSS\s*(9|10)[\.\d]",
        r"\bdata breach\b", r"\bransomware\b"
    ],
    "high": [
        r"\bhigh\b", r"\bimportant\b", r"\bsql injection\b", r"\bpatch\b",
        r"\bvulnerability\b", r"\bexploit\b", r"\bmalware\b", r"\bbackdoor\b",
        r"\bCVE-\d{4}-\d{4,}\b"
    ],
    "medium": [
        r"\bmedium\b", r"\bdenial of service\b", r"\bDOS\b", r"\bXSS\b",
        r"\bcross.site\b", r"\bCSRF\b", r"\binfo\b", r"\badvisory\b"
    ]
}

CONTEXT_TEMPLATES = {
    "linux": "Pourquoi ça compte pour toi : Cette actualité touche directement Linux — les techniques et vulnérabilités abordées sont applicables aux systèmes que tu apprends à sécuriser dans ce parcours.",
    "windows": "Pourquoi ça compte pour toi : Même sous Linux, comprendre les écosystèmes mixtes Windows/Linux est essentiel pour la gestion de correctifs en entreprise.",
    "web": "Pourquoi ça compte pour toi : La sécurisation des applications web est une compétence clé — les failles présentées ici sont celles que les administrateurs Linux doivent savoir anticiper.",
    "network": "Pourquoi ça compte pour toi : Les attaques réseau et les techniques de détection abordées ici complètent directement tes compétences en sécurité réseau (modules 9-11).",
    "default": "Pourquoi ça compte pour toi : Cette actualité t'aide à développer une culture de cybersécurité essentielle pour tout administrateur Linux."
}


def fetch_url(url, timeout=15):
    """Télécharge le contenu d'une URL avec timeout."""
    try:
        req = Request(url, headers={"User-Agent": "LinuxPath-NewsBot/1.0"})
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except URLError as e:
        print(f"  [WARN] Échec téléchargement {url}: {e}", file=sys.stderr)
        return None


def parse_rss(xml_data, feed):
    """Parse un flux RSS et extrait les articles."""
    articles = []
    try:
        root = ElementTree.fromstring(xml_data)
    except ElementTree.ParseError as e:
        print(f"  [WARN] Parse error pour {feed['name']}: {e}", file=sys.stderr)
        return articles

    ns = {"content": "http://purl.org/rss/1.0/modules/content/"}
    items = root.findall(".//item")

    for item in items:
        title = _get_text(item, "title")
        link = _get_text(item, "link")
        desc = _get_text(item, "description") or ""
        content = _get_text(item, "content:encoded", ns) or desc
        pub_date_str = _get_text(item, "pubDate")
        categories = [c.text for c in item.findall("category") if c.text]

        if not title or not link:
            continue

        pub_date = _parse_date(pub_date_str)

        # Extract CVE
        cve_match = re.search(r"CVE-\d{4}-\d{4,}", content + " " + title)
        cve = cve_match.group(0) if cve_match else None

        # Determine severity and score
        severity, cvss = _classify_severity(title + " " + desc + " " + content, categories)

        # Generate summary (first 200-500 chars of cleaned content)
        clean = _clean_html(content or desc)
        summary = _truncate(clean, 400)

        # Generate tags
        tags = _generate_tags(title, desc, categories, cve)

        # Generate context
        context = _generate_context(title, desc, tags)

        articles.append({
            "id": "news-" + md5((title + link).encode()).hexdigest()[:8],
            "date": pub_date,
            "title": _clean_title(title),
            "summary": summary,
            "context": context,
            "severity": severity,
            "tags": tags,
            "cve": cve,
            "cvss": cvss,
            "source_label": feed["source_label"],
            "source_url": link
        })

    return articles


def parse_nvd_xml(xml_data):
    """Parse le flux NVD CVE XML."""
    articles = []
    try:
        root = ElementTree.fromstring(xml_data)
    except ElementTree.ParseError as e:
        print(f"  [WARN] Parse error NVD: {e}", file=sys.stderr)
        return articles

    ns = {
        "ns": "http://scap.nist.gov/schema/feed/vulnerability/2.0",
        "cve": "http://scap.nist.gov/schema/cve/2.0",
        "cvss": "http://scap.nist.gov/schema/cvss/2.0"
    }

    for entry in root.findall(".//ns:entry", ns):
        cve_id = entry.get("id", "")
        if not cve_id:
            continue

        summary_el = entry.find(".//cve:summary", ns)
        summary = summary_el.text if summary_el is not None else ""

        cvss_el = entry.find(".//cvss:base_score", ns)
        cvss = float(cvss_el.text) if cvss_el is not None and cvss_el.text else None

        pub_date_str = entry.get("published", "") or entry.get("modified", "")
        pub_date = _parse_date(pub_date_str)

        severity = "info"
        if cvss is not None:
            if cvss >= 9.0:
                severity = "critical"
            elif cvss >= 7.0:
                severity = "high"
            elif cvss >= 4.0:
                severity = "medium"

        title = f"Nouveau CVE : {cve_id}"
        clean_summary = _clean_html(summary)
        short_summary = _truncate(clean_summary, 300)

        tags = ["CVE", "Vulnérabilité"]
        context = _generate_context(title, clean_summary, tags)

        articles.append({
            "id": "news-cve-" + cve_id.lower().replace("-", ""),
            "date": pub_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "title": f"{cve_id} — {_truncate(clean_summary, 120)}",
            "summary": short_summary,
            "context": context,
            "severity": severity,
            "tags": tags,
            "cve": cve_id,
            "cvss": cvss,
            "source_label": "NVD / NIST",
            "source_url": f"https://nvd.nist.gov/vuln/detail/{cve_id}"
        })

    return articles


def _get_text(element, tag, ns=None):
    el = element.find(tag, ns) if ns else element.find(tag)
    return el.text.strip() if el is not None and el.text else ""


def _parse_date(date_str):
    if not date_str:
        today = datetime.now(timezone.utc)
        return today.strftime("%Y-%m-%d")
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _clean_html(text):
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _clean_title(title):
    title = _clean_html(title)
    title = re.sub(r"\s*\(mise à jour\)", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s*\[MAJ\]", "", title, flags=re.IGNORECASE)
    if len(title) > 150:
        title = title[:147] + "..."
    return title


def _truncate(text, max_len):
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(" ", 1)[0] + "…"


def _classify_severity(text, categories):
    text_lower = text.lower()
    cat_lower = " ".join(c.lower() for c in categories)

    # Check for CVSS score
    cvss_match = re.search(r"CVSS\s*(\d+[\.\d]*)", text)
    if cvss_match:
        score = float(cvss_match.group(1))
        if score >= 9.0:
            return "critical", score
        elif score >= 7.0:
            return "high", score
        elif score >= 4.0:
            return "medium", score
        else:
            return "info", score

    # Check by keywords
    for sev, patterns in SEVERITY_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower) or re.search(pattern, cat_lower):
                return sev, None

    return "info", None


def _generate_tags(title, desc, categories, cve):
    tags = []
    text = (title + " " + desc).lower()

    # Skip generic feedburner/category junk tags
    skip_tags = {"security", "a little sunshine", "latest warnings", "the coming storm",
                 "data breaches", "featured", "cybersecurity", "threats", "vulnerabilities"}
    clean_cats = [c for c in categories if c.lower() not in skip_tags]

    if cve:
        tags.append("CVE")
    if re.search(r"\bpatch\b", text):
        tags.append("Patch")
    if re.search(r"\bransomware\b|\bdata breach\b|\bincident\b|\bviolation\b", text):
        tags.append("Incident")
    if re.search(r"\btool\b|\bframework\b|\blogiciel\b|\brelease\b|\bversion\b", text):
        tags.append("Outil")
    if re.search(r"\blinux\b|\bkernel\b|\bubuntu\b|\bdebian\b|\bred hat\b|\bcentos\b|\bunix\b", text):
        tags.append("Linux")
    if re.search(r"\bwindows\b|\bmicrosoft\b", text):
        tags.append("Windows")
    if re.search(r"\bnoyau\b|\bkernel\b", text):
        tags.append("Noyau Linux")

    # Add clean categories from feed (not already in tags)
    for cat in clean_cats:
        if cat not in tags:
            tags.append(cat)

    return tags[:5]


def _generate_context(title, desc, tags):
    tag_text = " ".join(t.lower() for t in tags)
    text = (title + " " + desc).lower()

    if "linux" in tag_text or "kernel" in tag_text or "noyau" in tag_text:
        return CONTEXT_TEMPLATES["linux"]
    if "web" in tag_text or "xss" in text or "csrf" in text or "sql" in text:
        return CONTEXT_TEMPLATES["web"]
    if "network" in tag_text or "dns" in text or "tcp" in text or "port" in text:
        return CONTEXT_TEMPLATES["network"]
    if "windows" in tag_text or "microsoft" in tag_text:
        return CONTEXT_TEMPLATES["windows"]

    return CONTEXT_TEMPLATES["default"]


def load_existing_news():
    """Charge les news existantes pour déduplication."""
    if not os.path.exists(NEWS_FILE):
        return []
    try:
        with open(NEWS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("news", [])
    except (json.JSONDecodeError, KeyError):
        return []


def merge_articles(existing, new_articles):
    """Fusionne les articles en évitant les doublons (basé sur l'URL)."""
    seen_urls = set()
    for article in existing:
        seen_urls.add(article.get("source_url", ""))

    merged = list(existing)
    for article in new_articles:
        url = article.get("source_url", "")
        if url and url not in seen_urls:
            # Insert at beginning (newest first)
            merged.insert(0, article)
            seen_urls.add(url)

    # Sort by date descending
    merged.sort(key=lambda x: x.get("date", ""), reverse=True)
    # Limit
    return merged[:MAX_ITEMS]


def write_news(articles):
    """Écrit les articles dans le fichier news.json."""
    today = datetime.now(timezone.utc)
    mois = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]
    edition_week = f"Semaine du {today.day} {mois[today.month-1]} {today.year}"

    data = {
        "last_updated": today.strftime("%Y-%m-%d"),
        "edition": edition_week,
        "news": articles
    }

    with open(NEWS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  ✓ {len(articles)} articles écrits dans {NEWS_FILE}")


def main():
    print("🔍 Démarrage de la collecte d'actualités cyber...")

    existing = load_existing_news()
    print(f"  ✓ {len(existing)} articles existants chargés")

    all_new = []

    for feed in FEEDS:
        print(f"\n📡 {feed['name']} — {feed['url']}")
        data = fetch_url(feed["url"])
        if data is None:
            continue

        articles = parse_rss(data, feed)
        print(f"  → {len(articles)} articles extraits")
        all_new.extend(articles)

    # Filter out items with too-short summaries (likely parsing errors)
    all_new = [a for a in all_new if len(a["summary"]) > 40]

    # Merge with existing
    merged = merge_articles(existing, all_new)

    write_news(merged)

    # Log changes
    changed = len(merged) - len(existing)
    if changed > 0:
        print(f"\n✅ {changed} nouveaux articles ajoutés !")
    else:
        print(f"\nℹ️ Aucun nouvel article.")

    return 0


if __name__ == "__main__":
    sys.exit(main())