"""Uma rodada da varredura de leads da Lux Derma.

Uso (da raiz do repositório):
    python3 ferramentas/varredura/rodada.py                 # as 8 cidades da vez
    python3 ferramentas/varredura/rodada.py --cidades "Bauru,Marília"
    python3 ferramentas/varredura/rodada.py --base-json base.json   # base local

O que faz, em cada cidade, nos dois sites (catalogo.med.br e doctoralia.com.br),
para dermatologistas, oftalmologistas e cirurgiões plásticos:

  1. Médico que JÁ está no Radar (mesmo telefone, ou mesmo nome na mesma
     cidade) e cujo número não tem WhatsApp: se o perfil tem um celular, sai
     uma linha com Telefone = celular e "Telefone anterior" = o número do
     Radar. A importação troca o número do lead, sem criar outro.
  2. Médico do Radar sem link de perfil: sai uma linha com o telefone dele e
     Perfil/CRM/RQE, que a importação grava no lead.
  3. Médico novo, até 200 km de Penápolis, com telefone do DDD da cidade:
     lead novo. Central de hospital, Santa Casa e Unimed ficam de fora.

Saída em VARREDURA_DIR/saida (padrão .varredura/saida, fora do git):
  leads-lux-derma-AAAA-MM-DD-varredura.xlsx  (1ª aba = importar; as outras são consulta)
  celulares-novos-AAAA-MM-DD.vcf
  resumo-AAAA-MM-DD.json

O catálogo bloqueia depois de uns 20 minutos de consultas: no primeiro
bloqueio, ele é deixado de lado e a rodada segue só com o Doctoralia. O
resumo diz quais cidades ficaram sem o catálogo.
"""
import argparse, collections, datetime, json, os, re, subprocess, sys
import concurrent.futures as cf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comum as c  # noqa: E402

BASE_URL = "https://lux-derma.vercel.app/api/varredura/base"
POR_RODADA = 8
INICIO_RODIZIO = datetime.date(2026, 12, 1)  # 1ª rodada agendada (dias 1 e 15 de cada mês)
RAIO_KM = 200
DSPEC = {"dermatologista": "Dermatologista", "oftalmologista": "Oftalmologista", "cirurgiao-plastico": "Cirurgião Plástico"}
CSPEC = {"dermatologistas": "Dermatologista", "oftalmologistas": "Oftalmologista", "cirurgioes-plastica": "Cirurgião Plástico"}
COLS = ["Nome", "Clínica", "Telefone", "Telefone anterior", "Especialidade", "Cidade", "UF", "Instagram",
        "Perfil", "CRM", "RQE", "Endereço", "Observações"]

STOP = {"dr", "dra", "doutor", "doutora", "de", "da", "do", "das", "dos", "e", "clinica", "consultorio", "instituto",
        "centro", "medico", "medica", "em", "the", "jr", "junior", "filho", "neto", "sobrinho"}
SPEC = {"dermatologista", "dermatologia", "oftalmologista", "oftalmologia", "cirurgiao", "cirurgia", "plastico", "plastica",
        "plasticas", "clinica", "olhos", "hospital", "estetica", "especialista", "laser", "avancada", "medical", "center",
        "implante", "capilar", "palpebras", "blefaroplastia", "dermatologica", "oftalmologica", "saude", "integrada"}


def toks(s):
    s = re.split(r"\s+[-–|]\s+", s or "")[0]
    return [w for w in c.strip(s).split() if w not in STOP and w not in SPEC and len(w) > 1]


def mesmo_nome(nome_lead, cidade_lead, nome_perfil):
    """Regra das entregas de novembro: 1º nome do médico no lead e 3 nomes em
    comum, ou 2 incluindo o último sobrenome de um dos dois. Palavras da cidade
    não contam ("São Carlos" não é nome)."""
    cid = set(c.strip(str(cidade_lead or "").split("/")[0]).split())
    lt = [w for w in toks(nome_lead) if w not in cid]
    pt = toks(nome_perfil)
    if len(lt) < 2 or len(pt) < 2:
        return False
    com = set(lt) & set(pt)
    if pt[0] not in com:
        return False
    return len(com) >= 3 or (len(com) >= 2 and (pt[-1] in com or lt[-1] in com))


def fmt(p):
    """+55 18 99999-8888 a partir de E.164 ou de chave sem o 9."""
    d = re.sub(r"\D", "", p or "")
    if len(d) == 12 and d.startswith("55") and d[4] in "6789":
        d = d[:4] + "9" + d[4:]
    return c.norm_phone(d) or p


def cidades_da_vez(hoje):
    todas = [l.strip() for l in open(os.path.join(c.AQUI, "cidades.txt"), encoding="utf8") if l.strip() and not l.startswith("#")]
    # Uma rodada por quinzena (dia 1 e dia 15): rodar de novo na mesma
    # quinzena repete as mesmas cidades, em vez de pular para as próximas.
    def quinzena(d):
        return d.year * 24 + (d.month - 1) * 2 + (d.day >= 15)
    n = max(0, quinzena(hoje) - quinzena(INICIO_RODIZIO))
    i = (n * POR_RODADA) % len(todas)
    return (todas + todas)[i:i + POR_RODADA]


def carregar_base(caminho):
    if caminho:
        dados = json.load(open(caminho, encoding="utf8"))
    else:
        # O token vai pelo proxy da sessão (credencial salva para o host);
        # aqui não se lê nem se grava segredo nenhum.
        r = subprocess.run(["curl", "-sS", "--max-time", "60", "-w", "\n%{http_code}", BASE_URL], capture_output=True, text=True)
        corpo, _, code = r.stdout.rpartition("\n")
        if code.strip() != "200":
            sys.exit(f"Base do Radar indisponível (HTTP {code.strip()}): {corpo[:200]} {r.stderr[:200]}")
        dados = json.loads(corpo)
    return dados["leads"] if isinstance(dados, dict) else dados


def coletar(cidade, site, bloqueado):
    """Perfis de uma cidade num site. `bloqueado` é compartilhado: depois do
    primeiro bloqueio do catálogo, ele não é mais consultado nesta rodada."""
    nome, uf = (cidade.split("/") + ["SP"])[:2]
    urls = {}
    for s, lab in (DSPEC if site == "doc" else CSPEC).items():
        if site in bloqueado:
            return None
        try:
            lista = c.doc_listing(s, c.slug(nome)) if site == "doc" else c.cat_listing(s, f"{c.slug(nome)}-{uf.lower()}")
            for u in lista:
                urls.setdefault(u, lab)
        except c.Bloqueio as e:
            print("BLOQUEIO", e, flush=True)
            bloqueado.add(site)
            return None
        except Exception as e:  # lista que falha não derruba a cidade
            print("ERRO lista", cidade, s, e, flush=True)
    perfis = []
    for u, lab in urls.items():
        if site in bloqueado:
            return None
        try:
            p = c.profile(u)
        except c.Bloqueio as e:
            print("BLOQUEIO", e, flush=True)
            bloqueado.add(site)
            return None
        except Exception as e:
            print("ERRO perfil", u, e, flush=True)
            continue
        if p:
            p["spec_lista"], p["cidade_lista"] = lab, cidade
            perfis.append(p)
    return perfis


def cidade_do_perfil(p):
    for e in p["enderecos"]:
        if e.get("cidade"):
            return e["cidade"], (e.get("uf") or "SP").upper()
    n, uf = (p["cidade_lista"].split("/") + ["SP"])[:2]
    return n, uf


def ig_handle(u):
    m = re.search(r"instagram\.com/([A-Za-z0-9._]+)", u or "")
    if not m or m.group(1).lower() in ("p", "reel", "explore", "accounts", "stories"):
        return None
    return "@" + m.group(1).rstrip(".").lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cidades", help="lista separada por vírgula; padrão: as da vez em cidades.txt")
    ap.add_argument("--base-json", help="base já baixada (JSON da rota /api/varredura/base)")
    args = ap.parse_args()

    hoje = datetime.date.today()
    cidades = [x.strip() for x in args.cidades.split(",")] if args.cidades else cidades_da_vez(hoje)
    print("Cidades:", ", ".join(cidades), flush=True)

    base = carregar_base(args.base_json)
    ativos = [l for l in base if not l.get("archived")]
    por_tel = {}
    for l in base:  # arquivado também: telefone dele não volta como lead novo
        for k in [l["phone_key"]] + list(l.get("telefones_anteriores") or []):
            por_tel.setdefault(c.digits8(k), []).append(l)
    print(f"Base: {len(base)} leads ({len(ativos)} ativos)", flush=True)

    # ---------------------------------------------------------------- coleta
    bloqueado, perfis, sem_catalogo = set(), [], []
    with cf.ThreadPoolExecutor(2) as ex:
        for cidade in cidades:
            fd, fc = ex.submit(coletar, cidade, "doc", bloqueado), ex.submit(coletar, cidade, "cat", bloqueado)
            d, k = fd.result(), fc.result()
            if k is None:
                sem_catalogo.append(cidade)
            perfis += (d or []) + (k or [])
            print(f"{cidade}: {len(d or [])} Doctoralia, {'bloqueado' if k is None else len(k)} catálogo", flush=True)

    uso = collections.Counter()
    vistos = {}
    for p in perfis:
        vistos.setdefault(p["url"], p)
    perfis = list(vistos.values())
    for p in perfis:
        for t in set(c.digits8(x) for x in p["tels"]):
            uso[t] += 1

    # O mesmo médico nos dois sites vira um grupo só.
    grupos = []
    for p in perfis:
        pc, puf = cidade_do_perfil(p)
        for g in grupos:
            q = g[0]
            # Só pelo nome: telefone igual costuma ser a recepção da clínica,
            # e juntaria médicos diferentes.
            if c.strip(cidade_do_perfil(q)[0]) == c.strip(pc) and mesmo_nome(q.get("nome"), pc, p.get("nome")):
                g.append(p)
                break
        else:
            grupos.append([p])

    linhas, sem_tel, vcf = [], [], []
    rel = collections.Counter()
    usados = set(por_tel)
    leads_feitos = set()  # um lead do Radar gera no máximo uma linha

    for g in grupos:
        g.sort(key=lambda p: p["fonte"] != "catalogo.med.br")  # catálogo tem endereço melhor
        p = g[0]
        pc, puf = cidade_do_perfil(p)
        cidade_fmt = pc if puf == "SP" else f"{pc}/{puf}"
        ddd = c.ddd_of(pc, puf)
        tels = list(dict.fromkeys(t for q in g for t in q["tels"]))
        tels = [t for t in tels if not ddd or re.sub(r"\D", "", t)[2:4] == ddd]
        perfil_url = next((q["url"] for q in g if q["fonte"] == "catalogo.med.br"), p["url"])
        crm = next((q.get("crm") for q in g if q.get("crm")), "")
        rqe = next((q.get("rqe") for q in g if q.get("rqe")), "")
        ig = next((ig_handle(q.get("instagram")) for q in g if ig_handle(q.get("instagram"))), None)
        rua = next((e["rua"] for q in g for e in q["enderecos"] if e.get("rua")), "")
        local = next((e["local"].strip() for q in g for e in q["enderecos"] if e.get("local")), "")
        fontes = ", ".join(dict.fromkeys(q["url"] for q in g))

        # Perfil sem nome de gente (às vezes o site devolve só a cidade).
        cid_words = set(c.strip(pc).split())
        if not [w for w in toks(p.get("nome")) if w not in cid_words]:
            rel["pagina_de_clinica_ou_sem_nome"] += 1
            if os.environ.get("VARREDURA_DEBUG"):
                print("SEM NOME", repr(p.get("nome")), p["url"], flush=True)
            continue

        # ---- já está no Radar?
        lead, por = None, None
        for t in tels:
            for l in por_tel.get(c.digits8(t), []):
                if not l.get("archived") and not lead:
                    lead, por = l, "pelo telefone"
        if not lead:
            for l in ativos:
                if l.get("city") and c.strip(str(l["city"]).split("/")[0]).strip() == c.strip(pc).strip() and \
                        mesmo_nome(l.get("sheet_name") or l.get("display_name"), l.get("city"), p.get("nome")):
                    lead, por = l, "pelo nome e cidade"
                    break

        if lead:
            if lead["id"] in leads_feitos:
                continue
            leads_feitos.add(lead["id"])
            nome_lead = lead.get("sheet_name") or lead.get("display_name") or p.get("nome")
            celulares = [t for t in tels if c.is_mobile(t) and c.digits8(t) not in usados and uso[c.digits8(t)] <= 2]
            if lead.get("whatsapp_existe") is False and celulares:
                t = celulares[0]
                usados.add(c.digits8(t))
                linhas.append({"Nome": nome_lead, "Clínica": lead.get("clinic_name"), "Telefone": t,
                               "Telefone anterior": fmt(lead.get("phone_e164") or lead["phone_key"]),
                               "Especialidade": lead.get("specialty") or p["spec_lista"], "Cidade": lead.get("city"), "UF": lead.get("uf"),
                               "Instagram": None, "Perfil": perfil_url, "CRM": crm, "RQE": rqe, "Endereço": rua or None,
                               "Observações": f"Celular achado no perfil de {p.get('nome')} ({fontes}), reconhecido {por}; o número do Radar não tem WhatsApp. Confiança média (diretório)."
                               + (" O lead é a clínica: o celular pode ser de um médico dela." if por == "pelo telefone" and not mesmo_nome(nome_lead, lead.get("city"), p.get("nome")) else ""),
                               "_tipo": "troca"})
                vcf.append((nome_lead, t))
                rel["celular_para_lead_do_radar"] += 1
            elif not lead.get("perfil_url") and (crm or perfil_url):
                linhas.append({"Nome": nome_lead, "Telefone": fmt(lead.get("phone_e164") or lead["phone_key"]),
                               "Perfil": perfil_url, "CRM": crm, "RQE": rqe,
                               "Observações": f"Perfil de {p.get('nome')}, reconhecido {por} ({fontes}).", "_tipo": "perfil"})
                rel["perfil_para_lead_do_radar"] += 1
            else:
                rel["ja_no_radar"] += 1
            continue

        # ---- médico novo
        if p["spec_lista"] not in DSPEC.values():
            continue
        dist = c.km(cidade_fmt)
        if dist is None or dist > RAIO_KM:
            rel["novo_fora_do_raio"] += 1
            continue
        livres = [t for t in tels if c.digits8(t) not in usados]
        livres.sort(key=lambda t: (not c.is_mobile(t), uso[c.digits8(t)]))
        lk = c.strip(local)
        if "santa casa" in lk or "unimed" in lk or ("hospital" in lk and "olho" not in lk):
            rel["novo_central_de_hospital"] += 1
            continue
        if not livres:
            sem_tel.append({"Nome": p.get("nome"), "Especialidade": p["spec_lista"], "Cidade": cidade_fmt, "Endereço": rua,
                            "Local": local, "CRM": crm, "Perfil": fontes})
            rel["novo_sem_telefone"] += 1
            continue
        t = livres[0]
        usados.add(c.digits8(t))
        obs = [f"Varredura {p['spec_lista']} em {pc} ({dist} km de Penápolis).",
               ("Celular" if c.is_mobile(t) else "Fixo") + " do diretório, confiança média; WhatsApp não confirmado."]
        if re.search(r"2441-0\d\d\d$", t):
            obs.append("Parece número de encaminhamento do Doctoralia (2441-0xxx): serve para ligar, não para WhatsApp.")
        if uso[c.digits8(t)] > 2:
            obs.append(f"Número compartilhado por {uso[c.digits8(t)]} perfis (central de clínica).")
        linhas.append({"Nome": p.get("nome"), "Clínica": local or None, "Telefone": t, "Especialidade": p["spec_lista"],
                       "Cidade": cidade_fmt, "UF": puf, "Instagram": ig, "Perfil": perfil_url, "CRM": crm, "RQE": rqe,
                       "Endereço": rua or None, "Observações": " ".join(obs), "_tipo": "novo"})
        if c.is_mobile(t):
            vcf.append((p.get("nome"), t))
        rel["novo"] += 1
        rel["novo_celular" if c.is_mobile(t) else "novo_fixo"] += 1

    # ---------------------------------------------------------------- saída
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    out = os.path.join(c.S, "saida")
    os.makedirs(out, exist_ok=True)
    dia = hoje.isoformat()
    H, F = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F4E78")

    def aba(ws, cols, rows):
        ws.append(cols)
        for cel in ws[1]:
            cel.font, cel.fill, cel.alignment = H, F, Alignment(vertical="center")
        for r in rows:
            ws.append([r.get(k) for k in cols])
        for i, k in enumerate(cols, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = min(60, max(10, max((len(str(r.get(k) or "")) for r in rows), default=8) + 2))
        ws.freeze_panes = "A2"

    ordem = {"troca": 0, "perfil": 1, "novo": 2}
    linhas.sort(key=lambda r: ordem[r["_tipo"]])
    wb = openpyxl.Workbook()
    wb.active.title = "Importar"
    aba(wb.active, COLS, linhas)
    aba(wb.create_sheet("Sem telefone"), ["Nome", "Especialidade", "Cidade", "Endereço", "Local", "CRM", "Perfil"], sem_tel)
    resumo = {"dia": dia, "cidades": cidades, "sem_catalogo": sem_catalogo, **rel, "linhas_importar": len(linhas), "celulares_vcf": len(vcf)}
    ws = wb.create_sheet("Resumo")
    for k, v in resumo.items():
        ws.append([k, ", ".join(v) if isinstance(v, list) else v])
    xlsx = os.path.join(out, f"leads-lux-derma-{dia}-varredura.xlsx")
    wb.save(xlsx)
    with open(os.path.join(out, f"celulares-novos-{dia}.vcf"), "w", encoding="utf8") as f:
        for n, t in vcf:
            f.write(f"BEGIN:VCARD\r\nVERSION:3.0\r\nFN:{n}\r\nN:{n};;;;\r\nTEL;TYPE=CELL:{t}\r\nNOTE:Lux Derma - varredura {dia}\r\nEND:VCARD\r\n")
    json.dump(resumo, open(os.path.join(out, f"resumo-{dia}.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    print("Arquivos em", out)


if __name__ == "__main__":
    main()
