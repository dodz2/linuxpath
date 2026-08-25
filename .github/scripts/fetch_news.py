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

CONTEXT_MESSAGES = {
    "linux_system": "Touche directement les systèmes Linux que tu apprends à administrer.",
    "filesystem":   "Concerne la gestion des fichiers et permissions Unix.",
    "permissions":  "En lien avec la gestion des droits et des accès système.",
    "processes":    "Concerne les processus et services système.",
    "network":      "Implique des concepts réseau fondamentaux.",
    "scripting":    "Technique liée au scripting et à l'automatisation.",
    "admin":        "Concerne l'administration et le maintien sécurisé des systèmes.",
    "services":     "Touche les services réseau et leur sécurisation.",
    "firewall":     "En rapport avec le filtrage réseau et la protection périmétrique.",
    "net_security": "Concerne la sécurité des communications et des réseaux.",
    "recon":        "Illustre des techniques de reconnaissance et d'énumération.",
    "vulnerability":"Alerte sur des vulnérabilités à connaître et analyser.",
    "exploit":      "Montre des techniques d'exploitation ou de post-exploitation.",
    "web":          "Concerne la sécurité des applications et services web.",
    "windows":      "Utile pour comprendre les enjeux en environnement mixte Windows/Linux.",
    "default":      "Renforce ta culture de cybersécurité."
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

        # Generate context + related modules
        context, related_modules = _generate_context(title, desc, tags)

        articles.append({
            "id": "news-" + md5((title + link).encode()).hexdigest()[:8],
            "date": pub_date,
            "title": _clean_title(title),
            "summary": summary,
            "context": context,
            "related_modules": related_modules,
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
        context, related_modules = _generate_context(title, clean_summary, tags)

        articles.append({
            "id": "news-cve-" + cve_id.lower().replace("-", ""),
            "date": pub_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "title": f"{cve_id} — {_truncate(clean_summary, 120)}",
            "summary": short_summary,
            "context": context,
            "related_modules": related_modules,
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

    # Check for CVSS score — handles "CVSS 7.8", "CVSS:7.8", "CVSS score: 7.8"
    cvss_match = re.search(r"CVSS\s*(?:score\s*)?[:\s]*(\d+[.\d]*)", text, re.IGNORECASE)
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
    if re.search(r"\bpatch\b|\bcorrectif\b|\bmise à jour\b|\bfix\b", text):
        tags.append("Patch")
    if re.search(r"\bransomware\b|\bdata breach\b|\bincident\b|\bviolation\b|\bfuite\b|\bfuite de données\b|\bcompromis\b", text):
        tags.append("Incident")
    if re.search(r"\btool\b|\bframework\b|\blogiciel\b|\brelease\b|\bversion\b|\boutil\b|\bexploit\b", text):
        tags.append("Outil")
    if re.search(r"\blinux\b|\bkernel\b|\bubuntu\b|\bdebian\b|\bred.hat\b|\bcentos\b|\bunix\b|\bsuse\b|\bcifs\b", text):
        tags.append("Linux")
    if re.search(r"\bwindows\b|\bmicrosoft\b", text):
        tags.append("Windows")
    if re.search(r"\bnoyau\b|\bkernel\b", text):
        tags.append("Noyau Linux")
    if re.search(r"\bréseau\b|\bnetwork\b|\bbotnet\b|\bddos\b|\bvpn\b|\bdns\b|\bfirewall\b", text):
        tags.append("Réseau")
    if re.search(r"\bphishing\b|\barnaque\b|\bscam\b|\bvol\b|\bsteal\b|\bstolen\b", text):
        tags.append("Fraude")

    # Add clean categories from feed (not already in tags)
    for cat in clean_cats:
        if cat not in tags:
            tags.append(cat)

    return tags[:5]


def _generate_context(title, desc, tags):
    """Génère un contexte court et identifie les modules LinuxPath liés."""
    tag_text = " ".join(t.lower() for t in tags)
    text = (title + " " + desc).lower()
    combined = tag_text + " " + text

    related = set()
    context_type = "default"

    # --- Détection par mots-clés → modules et catégorie de contexte ---

    # Linux / kernel → m1 (bases), m8 (admin)
    if re.search(r"\bkernel\b|\bnoyau\b", combined):
        related.update(["m1", "m8"])
        context_type = "linux_system"
    if re.search(r"\blinux\b|\bubuntu\b|\bdebian\b|\bred.?hat\b|\bcentos\b|\bsuse\b|\bfedora\b|\balma\b|\brocky\b|\bunix\b", combined):
        related.add("m1")
        if context_type == "default":
            context_type = "linux_system"

    # Fichiers & permissions → m2
    if re.search(r"\bchmod\b|\bchown\b|\bsetuid\b|\bsuid\b|\bsetgid\b|\bsgid\b", combined):
        related.add("m2")
        if context_type == "default":
            context_type = "filesystem"

    # Utilisateurs, droits, auth → m3, m9
    if re.search(r"\bprivilege\b|\bescalation\b|\bsudo\b|\broot access\b|\bPAM\b|\baccess.?control\b", combined):
        related.update(["m3", "m14"])
        if context_type == "default":
            context_type = "permissions"
    if re.search(r"\bSSH\b|\bcredential\b|\bpassword\b|\bbrute.?force\b|\bauthenticat\b", combined):
        related.update(["m3", "m9"])
        if context_type == "default":
            context_type = "permissions"

    # Réseau fondamental → m4
    if re.search(r"\bDNS\b|\bTCP\b|\bUDP\b|\broutage\b|\brouting\b|\bprotocol[e]?\b", combined):
        related.add("m4")
        if context_type == "default":
            context_type = "network"

    # Scripting → m5
    if re.search(r"\bbash\b|\bshell\b|\bcommand.?injection\b", combined):
        related.add("m5")
        if context_type == "default":
            context_type = "scripting"

    # Administration → m6
    if re.search(r"\bsystemd\b|\bcron\b|\bdaemon\b|\bcontainer\b|\bdocker\b|\bkubernetes\b", combined):
        related.add("m6")
        if context_type == "default":
            context_type = "admin"
    if re.search(r"\bpatch\b|\bmise à jour\b|\bhardening\b|\baudit\b|\bcompliance\b", combined):
        related.add("m6")
        if context_type == "default":
            context_type = "admin"

    # Sécurité & OSINT → m7
    if re.search(r"\bOSINT\b|\breconnaissance\b|\bfootprint\b|\bnmap\b|\bshodan\b|\bdiscovery\b|\bscan\b", combined):
        related.add("m7")
        if context_type == "default":
            context_type = "recon"

    # Git & Docker → m8
    if re.search(r"\bgit\b|\bsupply.?chain\b|\bdocker\b|\bcontainer\b", combined):
        related.add("m8")

    # SSH & accès distant → m9
    if re.search(r"\bSSH\b|\btunnel\b|\bSCP\b|\bSFTP\b|\brsync\b|\bVPN\b|\bWireGuard\b", combined):
        related.add("m9")
        if context_type == "default":
            context_type = "services"

    # Serveurs web & DNS → m10
    if re.search(r"\bApache\b|\bNginx\b|\bHTTPS?\b|\bTLS\b|\bSSL\b|\bcertificat\b|\bweb.?server\b|\bserveur web\b", combined):
        related.add("m10")
        if context_type == "default":
            context_type = "services"
    if re.search(r"\bwordpress\b|\bCMS\b|\bweb.?app\b|\bPHP\b", combined):
        related.update(["m10", "m11"])
        if context_type == "default":
            context_type = "web"

    # Sécurité réseau → m11
    if re.search(r"\bfirewall\b|\bpare.?feu\b|\biptables\b|\bnftables\b|\bWAF\b|\bIDS\b|\bIPS\b", combined):
        related.add("m11")
        if context_type == "default":
            context_type = "firewall"
    if re.search(r"\bchiffrement\b|\bencrypt\b|\bMITM\b|\bman.?in.?the.?middle\b|\binterception\b", combined):
        related.add("m11")
        if context_type == "default":
            context_type = "net_security"
    if re.search(r"\bDDoS\b|\bDoS\b|\bbotnet\b|\btcpdump\b", combined):
        related.add("m11")
        if context_type == "default":
            context_type = "net_security"
    if re.search(r"\bXSS\b|\bCSRF\b|\bSQL.?injection\b|\binjection\b", combined):
        related.update(["m11", "m13"])
        if context_type == "default":
            context_type = "web"

    # Audit & Durcissement → m12
    if re.search(r"\baudit[de]?\b|\blynis\b|\bopenscap\b|\bdurcissement\b|\bharden\b|\bcis.?bench\b", combined):
        related.add("m12")
        if context_type == "default":
            context_type = "admin"

    # Pentest & Outils → m13
    if re.search(r"\bvulnerab\b|\bvulnérab\b|\bCVE\b|\bCVSS\b|\bfaille\b|\b0.?day\b|\bzero.?day\b", combined):
        related.add("m13")
        if context_type == "default":
            context_type = "vulnerability"
    if re.search(r"\bmetasploit\b|\bburp\b|\bpentest\b", combined):
        related.add("m13")
        if context_type == "default":
            context_type = "exploit"

    # Forensic & Malwares → m14
    if re.search(r"\bexploit\b|\bRCE\b|\bremote.?code\b|\barbitrary.?code\b|\bshellcode\b", combined):
        related.add("m14")
        if context_type == "default":
            context_type = "exploit"
    if re.search(r"\bbackdoor\b|\btrojan\b|\bmalware\b|\bransomware\b|\bRAT\b|\bc[2&]c?\b|\bcommand.?and.?control\b", combined):
        related.add("m14")
        if context_type == "default":
            context_type = "exploit"
    if re.search(r"\bforensic\b|\binvestigation\b|\bincident.?response\b|\bIOC\b|\bindicator\b", combined):
        related.add("m14")
        if context_type == "default":
            context_type = "exploit"

    # Windows (pas de module directement lié)
    if re.search(r"\bwindows\b|\bmicrosoft\b|\bazure\b", combined):
        if context_type == "default":
            context_type = "windows"

    # Texte du contexte
    context = CONTEXT_MESSAGES.get(context_type, CONTEXT_MESSAGES["default"])

    # Trier les modules par ordre numérique, limiter à 3
    sorted_modules = sorted(related, key=lambda m: int(m[1:]))[:3]

    return context, sorted_modules


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


def _title_words(title):
    """Extrait les mots significatifs (>3 chars) d'un titre pour comparaison."""
    stop = {"that", "this", "with", "from", "have", "been", "were", "their", "about",
            "more", "into", "dans", "pour", "les", "des", "une", "the", "and", "for",
            "2026", "2025", "29", "30", "31", "mai", "juin", "mai"}
    words = set(re.findall(r'\w{4,}', title.lower()))
    return words - stop


def _is_duplicate(new_title, existing_titles, threshold=0.4):
    """Vérifie si un titre est un doublon d'un titre existant (Jaccard)."""
    new_words = _title_words(new_title)
    if not new_words:
        return False
    for existing_title in existing_titles:
        existing_words = _title_words(existing_title)
        if not existing_words:
            continue
        overlap = new_words & existing_words
        jaccard = len(overlap) / len(new_words | existing_words)
        if jaccard >= threshold:
            return True
    return False


def merge_articles(existing, new_articles):
    """Fusionne les articles en évitant les doublons (URL + similarité titre)."""
    seen_urls = set()
    seen_titles = []
    for article in existing:
        seen_urls.add(article.get("source_url", ""))
        seen_titles.append(article.get("title", ""))

    severity_order = {"critical": 0, "high": 1, "medium": 2, "info": 3}

    merged = list(existing)
    for article in new_articles:
        url = article.get("source_url", "")
        title = article.get("title", "")

        # Skip if same URL already exists
        if url and url in seen_urls:
            continue

        # Skip if similar title already exists (same story, different source)
        if _is_duplicate(title, seen_titles):
            # But if new article has higher severity, upgrade the existing one
            for existing_article in merged:
                existing_words = _title_words(existing_article.get("title", ""))
                new_words = _title_words(title)
                if existing_words and new_words:
                    overlap = existing_words & new_words
                    jaccard = len(overlap) / len(existing_words | new_words)
                    if jaccard >= 0.4:
                        new_sev = severity_order.get(article.get("severity", "info"), 3)
                        old_sev = severity_order.get(existing_article.get("severity", "info"), 3)
                        if new_sev < old_sev:
                            existing_article["severity"] = article["severity"]
                            # Merge tags
                            for tag in article.get("tags", []):
                                if tag not in existing_article.get("tags", []):
                                    existing_article.setdefault("tags", []).append(tag)
                            # Merge CVSS if missing
                            if not existing_article.get("cvss") and article.get("cvss"):
                                existing_article["cvss"] = article["cvss"]
                        break
            continue

        merged.append(article)
        seen_urls.add(url)
        seen_titles.append(title)

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