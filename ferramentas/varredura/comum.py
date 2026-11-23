"""Coleta com cache em catalogo.med.br e doctoralia.com.br, e utilidades comuns.

Cache e saídas ficam em VARREDURA_DIR (padrão: .varredura/ na raiz do repo,
fora do git). Nada aqui grava dado de lead no repositório.
"""
import hashlib, html, json, math, os, re, subprocess, threading, time, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
S = os.environ.get("VARREDURA_DIR") or os.path.join(RAIZ, ".varredura")
CACHE = os.path.join(S, "cache")
os.makedirs(CACHE, exist_ok=True)


class Bloqueio(RuntimeError):
    """O site voltou a recusar (503/conexão): pare de consultar esse site nesta rodada."""
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_locks = {}
_last = {}
_FAILS = {}
DELAY = 0.6


def _host(url):
    return re.sub(r"^https?://(www\.)?", "", url).split("/")[0]


def get(url):
    if url.startswith("//"):
        url = "https:" + url
    key = hashlib.sha1(url.encode()).hexdigest()
    p = os.path.join(CACHE, key)
    if os.path.exists(p):
        return open(p, encoding="utf8").read()
    h = _host(url)
    lock = _locks.setdefault(h, threading.Lock())
    with lock:
        wait = _last.get(h, 0) + (2.0 if "catalogo" in h else DELAY) - time.time()
        if wait > 0:
            time.sleep(wait)
        raw = b""
        for attempt in range(5):
            r = subprocess.run(["curl", "-sSL", "--max-time", "40", "-A", UA, "-w", "\n__CODE__%{http_code}", url],
                               capture_output=True)
            raw = r.stdout
            code = raw.rsplit(b"__CODE__", 1)[-1].strip()
            raw = raw.rsplit(b"\n__CODE__", 1)[0]
            if code == b"200":
                break
            if code == b"404":
                raw = b""
                break
            time.sleep(20 * (attempt + 1) if code == b"503" else 3 * (attempt + 1))
        _last[h] = time.time()
    try:
        txt = raw.decode("utf8")
    except UnicodeDecodeError:
        txt = raw.decode("cp1252", errors="replace")
    if code not in (b"200", b"404"):
        _FAILS[h] = _FAILS.get(h, 0) + 1
        if _FAILS[h] >= 3:
            raise Bloqueio(f"{h} bloqueou (HTTP {code.decode() or '000'})")
        raise RuntimeError(f"HTTP {code.decode()} {url}")
    if txt or code == b"404":
        open(p, "w", encoding="utf8").write(txt)
    return txt


# --------------------------------------------------------------- telefone
def norm_phone(s):
    d = re.sub(r"\D", "", s or "")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if d.startswith("0") and len(d) in (11, 12):
        d = d[1:]
    if len(d) not in (10, 11):
        return None
    ddd, n = d[:2], d[2:]
    if len(n) == 9 and n[0] != "9":
        return None
    if len(n) == 8 and n[0] in "6789":  # celular antigo sem o 9
        n = "9" + n
    if len(n) == 9:
        return f"+55 {ddd} {n[:5]}-{n[5:]}"
    return f"+55 {ddd} {n[:4]}-{n[4:]}"


def is_mobile(p):
    return bool(p) and len(re.sub(r"\D", "", p)) == 13


# --------------------------------------------------------------- doctoralia
DOC = "https://www.doctoralia.com.br"


def _ascii(s):
    import unicodedata
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def doc_listing(spec, city, maxpages=30):
    out = []
    for pg in range(1, maxpages + 1):
        url = f"{DOC}/{spec}/{city}" + (f"?page={pg}" if pg > 1 else "")
        t = get(url)
        cs = [re.sub(r"[^a-z]", "", _ascii(c)) for c in re.findall(r'data-test-id="city-address" content="([^"]+)"', t)]
        if cs and re.sub(r"[^a-z]", "", city) not in cs:
            break  # a página já não traz ninguém da cidade (Doctoralia completa com outras)
        urls = re.findall(r'data-doctor-url="([^"]+)"', t)
        new = [u for u in dict.fromkeys(urls) if u not in out]
        out += new
        if not new or f"page={pg + 1}" not in t:
            break
    return out


def _social(t):
    soc = {}
    for u in re.findall(r'href="(?://)?(https?://[^"]+)"', t):
        u = html.unescape(u)
        lu = u.lower()
        if "doctoralia" in lu or "docplanner" in lu:
            continue
        if "instagram.com/" in lu:
            soc.setdefault("instagram", u)
        elif "facebook.com/" in lu and "sharer" not in lu:
            soc.setdefault("facebook", u)
        elif "wa.me/" in lu or "whatsapp.com/send" in lu:
            soc.setdefault("whatsapp", u)
    return soc


def doc_profile(url):
    t = get(url)
    if not t:
        return None
    d = {"url": url, "fonte": "doctoralia"}
    m = re.search(r'"@type":"Physician","name":"([^"]+)"', t)
    d["nome"] = json.loads('"%s"' % m.group(1)) if m else None
    m = re.search(r"<title>(.*?)</title>", t, re.S)
    d["titulo"] = html.unescape(m.group(1).strip()) if m else ""
    if not d["nome"]:
        m = re.search(r'"position":4,"name":"([^"]+)"', t)
        d["nome"] = json.loads('"%s"' % m.group(1)) if m else re.split(r" opini| - ", d["titulo"])[0]
    d["crm"] = ", ".join(sorted(set(re.findall(r"CRM\s+[A-Z]{2}\s+\d+", t))))
    rqe = re.findall(r"RQE\s*(?:N[ºo°]\s*)?:?\s*(\d{3,6})", t)
    d["rqe"] = ", ".join(sorted(set(rqe)))
    # endereços, cada um com seus telefones
    cards = []
    parts = re.split(r'data-test-id="address-info-name"', t)
    for chunk in parts[1:]:
        nm = re.search(r">\s*([^<]+?)\s*</span>", chunk)
        st = re.search(r'data-test-id="address-info-street">([^<]*)<', chunk)
        ci = re.search(r'class="city" content="([^"]*)"', chunk)
        nxt = chunk[:60000]
        tels = [norm_phone(x) for x in re.findall(r'href="tel:([^"]+)"', nxt)]
        cards.append({"local": html.unescape(nm.group(1)) if nm else "",
                      "rua": html.unescape(st.group(1)).strip(" ,") if st else "",
                      "cidade": html.unescape(ci.group(1)) if ci else "",
                      "tels": [x for x in dict.fromkeys(tels) if x]})
    seen, uniq = set(), []
    for c in cards:
        k = (c["local"], c["rua"])
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    d["enderecos"] = uniq
    d["tels"] = [x for x in dict.fromkeys(norm_phone(x) for x in re.findall(r'href="tel:([^"]+)"', t)) if x]
    d.update(_social(t))
    # site próprio (link "Site")
    sites = [html.unescape(u) for u in re.findall(r'href="(?://)?(https?://[^"]+)"[^>]*>\s*(?:Site|Website|Página)', t)]
    d["site"] = sites[0] if sites else None
    bc = re.findall(r'"ListItem","position":2,"name":"([^"]+)"', t)
    d["especialidade"] = json.loads('"%s"' % bc[0]) if bc else ""
    return d


# --------------------------------------------------------------- catálogo
CAT = "https://www.catalogo.med.br"


def cat_listing(spec, city_uf, maxpages=30):
    out = []
    for pg in range(1, maxpages + 1):
        url = f"{CAT}/medicos/{spec}/em-{city_uf}/" + (f"pagina-{pg}/" if pg > 1 else "")
        t = get(url)
        if pg == 1 and "mais indicad" not in (re.findall(r"<title>(.*?)</title>", t) or [""])[0]:
            return []  # cidade sem resultado: o site cai numa lista nacional
        urls = [u if u.startswith("http") else CAT + u for u in re.findall(r'href="((?:https://www\.catalogo\.med\.br)?/doutor/[^"]+)"', t)]
        new = [u for u in dict.fromkeys(urls) if u not in out]
        out += new
        if not new or f"pagina-{pg + 1}/" not in t:
            break
    return out


def cat_profile(url):
    t = get(url)
    if not t:
        return None
    d = {"url": url, "fonte": "catalogo.med.br"}
    lds = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
        try:
            lds.append(json.loads(m.group(1)))
        except Exception:
            pass
    phys = next((x for x in lds if x.get("@type") == "Physician"), {})
    d["nome"] = phys.get("name")
    d["especialidade"] = ", ".join(phys.get("MedicalSpecialty") or [])
    m = re.search(r"CRM:\s*(\d+)\s*/\s*([A-Z]{2})", t)
    d["crm"] = f"CRM {m.group(2)} {m.group(1)}" if m else ""
    m = re.search(r"RQE:\s*([\d ,]+)", re.sub(r"<[^>]+>", " ", t))
    d["rqe"] = m.group(1).strip() if m else ""
    d["enderecos"] = []
    tels = []
    for x in lds:
        if x.get("@type") == "LocalBusiness":
            a = x.get("address") or {}
            ts = []
            for p in x.get("telephone") or []:
                dg = re.sub(r"\D", "", p)
                if len(dg) in (8, 9):
                    dd = ddd_of(a.get("addressLocality"), a.get("addressRegion"))
                    dg = (dd or "") + dg
                ts.append(norm_phone(dg))
            ts = [p for p in ts if p]
            tels += ts
            d["enderecos"].append({"local": x.get("name", ""), "rua": a.get("streetAddress", "").replace(" - - ", " - "),
                                   "cidade": a.get("addressLocality", ""), "uf": a.get("addressRegion", ""), "tels": ts})
    d["tels"] = list(dict.fromkeys(tels))
    d.update(_social(t))
    return d


_DDD = None


def ddd_of(city, uf):
    global _DDD
    if _DDD is None:
        import unicodedata
        _DDD = {}
        for n, u, la, lo, d in municipios():
            k = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower()
            _DDD[(k, u)] = d
    import unicodedata
    k = unicodedata.normalize("NFKD", city or "").encode("ascii", "ignore").decode().lower()
    return _DDD.get((k, (uf or "SP").upper()))


def profile(url):
    return doc_profile(url) if "doctoralia" in url else cat_profile(url)


# --------------------------------------------------------------- municípios
_MUN = None


def municipios():
    """(nome, UF, lat, lon, DDD) da tabela do próprio app, src/lib/geo/municipios-dados.ts."""
    global _MUN
    if _MUN is None:
        t = open(os.path.join(RAIZ, "src/lib/geo/municipios-dados.ts"), encoding="utf8").read()
        # O comentário do arquivo também tem crases: pegar o literal pelo nome.
        corpo = re.search(r"MUNICIPIOS\s*=\s*`([^`]*)`", t).group(1)
        _MUN = [l.split("|") for l in corpo.strip().splitlines() if l.count("|") == 4]
    return _MUN


def strip(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s)


def slug(s):
    return re.sub(r"\s+", "-", strip(s).strip())


_COORD = None


def km(cidade):
    """Distância em linha reta de Penápolis; cidade como "Nome" (SP) ou "Nome/UF"."""
    global _COORD
    if _COORD is None:
        _COORD = {(strip(n).strip(), u): (float(la), float(lo)) for n, u, la, lo, d in municipios()}
    n, uf = (str(cidade).split("/") + ["SP"])[:2]
    a, b = _COORD.get(("penapolis", "SP")), _COORD.get((strip(n).strip(), uf.strip().upper()))
    if not a or not b:
        return None
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    return round(2 * 6371 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)))


def digits8(p):
    return re.sub(r"\D", "", p or "")[-8:]
