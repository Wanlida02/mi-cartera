#!/usr/bin/env python3
"""
csv_desde_pdf.py — Añade al <Empresa>_datos.csv los ejercicios que tienes en PDF pero que la fuente automática (SEC / registro
europeo) todavía no publica con datos estructurados. Por ejemplo, bajas a mano SOL_AR_2025.pdf y el CSV solo llega a 2024.

Cómo se evita meter cifras equivocadas
    Un informe anual enseña dos columnas: el ejercicio y el anterior. Para cada cifra se buscan en el PDF las líneas candidatas
    (Revenue, Operating profit, Net income…) y solo se acepta aquella cuya columna del AÑO ANTERIOR coincide con la que YA tienes
    en el CSV (tolerando miles/millones y redondeos). Eso confirma que la línea y las unidades son las correctas.
    Lo que no se puede verificar NO se escribe y se lista al final (para completarlo con IA en la app o a mano).

Uso:
    python csv_desde_pdf.py SOL                  (carpeta «SOL annual report» junto a este script; sube un nivel si hace falta)
    python csv_desde_pdf.py --todas              (todas las carpetas con un informe más nuevo que el último año del CSV)
    python csv_desde_pdf.py SOL --simular        (no escribe: solo enseña lo que haría)

Requisitos: pip install pypdf   (o tener pdftotext en el PATH). Se guarda una copia <Empresa>_datos.csv.bak antes de modificar.
Es seguro repetirlo: si el año ya está en el CSV no hace nada.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

CARPETA_BASE = Path(__file__).resolve().parent.parent
SUFIJO = " annual report"

# métrica del CSV → (patrón de la etiqueta al inicio de la línea, ¿suma de varias líneas?)
ETQ = {
    "Ventas": [r"(total )?(net )?(revenues?|sales|net sales|turnover)( from (sales|contracts).*)?", r"ventas|ingresos|cifra de negocios|importe neto de la cifra"],
    "Beneficio operativo (EBIT)": [r"(net )?(operating (profit|income|result)|ebit|profit from operations|operating profit \(ebit\)|income from operations)", r"resultado de explotaci[oó]n|beneficio operativo|resultado operativo"],
    "Gastos financieros (brutos)": [r"(financ(e|ial) (costs?|expenses?)|interest expenses?)", r"gastos financieros"],
    "Beneficio neto": [r"(net (profit|income|result|earnings)|profit for the (year|period)|profit attributable to (the )?(owners|shareholders|equity holders)).*", r"(resultado|beneficio) (neto|del ejercicio|atribuible).*"],
    "Amortizaciones (D&A)": [r"(depreciation|amorti[sz]ation).*", r"amortizaci[oó]n.*"],
    "Flujo de caja operativo": [r"(?!.*before)(net )?cash( flows?| inflows?| generated| provided)?.{0,40}(from|by|in) (operating|operations).*", r"flujos? de efectivo de las actividades de explotaci[oó]n.*"],
    "Capex": [r"(purchases? of|investments? in|acquisitions? of|additions to|increases? in|capital expenditures?).*(property|plant|tangible|intangible|equipment|fixed assets).*", r"(inversiones?|adquisici[oó]n).*(inmovilizado|inmaterial|material).*"],
    "Dividendos pagados": [r"dividends?( paid)?.*", r"dividendos.*"],
    "Caja y equivalentes": [r"cash and cash equivalents.*", r"efectivo y (otros )?(activos l[ií]quidos|equivalentes).*"],
    "Fondo de comercio": [r"goodwill.*", r"fondo de comercio.*"],
    "Activo total": [r"total assets.*", r"total activo.*"],
    "Patrimonio neto (dominante)": [r"(total )?shareholders'? equity ?[-–]? ?(group|of the group|of the parent|attributable.*)", r"(total )?(equity|shareholders'? equity|stockholders'? equity) attributable to (the )?(owners|shareholders|equity holders|parent).*|shareholders'? equity|equity attributable.*", r"patrimonio neto (atribuido|de la sociedad).*"],
}
ETQ_BPA = [r"(basic and diluted |diluted |basic )?(earnings|profit|income)( \(loss\))? per (ordinary )?share( - diluted| \(diluted\))?.*", r"(diluted |basic )?eps.*", r"beneficio por acci[oó]n.*|resultado por acci[oó]n.*"]
SALDOS = {"Caja y equivalentes", "Fondo de comercio", "Activo total", "Patrimonio neto (dominante)"}
ABS = {"Capex", "Dividendos pagados", "Gastos financieros (brutos)"}   # salidas: el signo varía según la empresa
SIN_ESCALA = set()


def texto_pdf(ruta: Path) -> str:
    """Texto de todo el PDF, conservando columnas (pdftotext si está; si no, pypdf)."""
    exe = shutil.which("pdftotext")
    if exe:
        r = subprocess.run([exe, "-layout", str(ruta), "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("Falta una librería para leer PDF: ejecuta  pip install pypdf")
    rd, out = PdfReader(str(ruta)), []
    for p in rd.pages:
        try:
            out.append(p.extract_text(extraction_mode="layout") or "")
        except TypeError:
            out.append(p.extract_text() or "")
        except Exception:
            out.append("")
    return "\n".join(out)


NUM = re.compile(r"\(?[-−–]?\d[\d.,]*\)?%?")


def a_numero(tok: str, decimal: bool = False):
    t = tok.strip()
    if t.endswith("%"):
        return None
    neg = t.startswith("(") or t.startswith(("-", "−", "–")) or t.endswith(")")
    t = re.sub(r"[()\-−–\s ]", "", t)
    if not t or not re.search(r"\d", t):
        return None
    if decimal and re.fullmatch(r"\d+[.,]\d+", t):    # importes por acción: 1.841 es 1,841
        t = t.replace(",", ".")
    elif "," in t and "." in t:
        dec = "," if t.rfind(",") > t.rfind(".") else "."
        t = t.replace("," if dec == "." else ".", "").replace(dec, ".")
    elif "," in t or "." in t:
        s = "," if "," in t else "."
        partes = t.split(s)
        t = t.replace(s, "") if (len(partes) > 2 or len(partes[-1]) == 3) else t.replace(s, ".")
    try:
        v = float(t)
    except ValueError:
        return None
    return -v if neg else v


def numeros_linea(resto: str, decimal: bool = False) -> list[float]:
    out = []
    for m in NUM.finditer(resto):
        tok = m.group(0)
        if tok.endswith("%"):
            continue
        # «12.31.2025» y otras fechas: no son importes
        if re.fullmatch(r"\d{1,2}[./]\d{1,2}[./]\d{2,4}", tok.strip()):
            continue
        v = a_numero(tok, decimal)
        if v is not None:
            out.append(v)
    return out


TOK_NUM = re.compile(r"\(?[-−–]?\d[\d.,]*\)?%?")


def partir_linea(ln: str):
    """(etiqueta, [tokens numéricos finales]) — sin expresiones regulares costosas."""
    toks = ln.split()
    k = len(toks)
    while k > 0 and TOK_NUM.fullmatch(toks[k - 1]):
        k -= 1
    if k == 0 or k == len(toks):
        return None
    return " ".join(toks[:k]), toks[k:]


def candidatas(texto: str, patrones: list[str], decimal: bool = False):
    """[(etiqueta, [números de la línea])] para las líneas cuya etiqueta coincide con alguno de los patrones."""
    rx = [re.compile(r"^(?:" + p + r")$", re.I) for p in patrones]
    res = []
    for ln in texto.splitlines():
        if len(ln) > 400 or not ln.strip():
            continue
        pl = partir_linea(ln)
        if not pl:
            continue
        etq = re.sub(r"[’ʹˊ`´]", "'", re.sub(r"^[-•*]\s*", "", pl[0])).strip()
        if len(etq) > 90:
            continue
        if any(r.match(etq) for r in rx):
            nums = numeros_linea(" ".join(pl[1]), decimal)
            if len(nums) >= 2:
                res.append((etq[:60], nums))
    return res


def cerca(a: float, b: float, tol_abs: float) -> bool:
    return abs(a - b) <= max(tol_abs, 0.003 * abs(b))


def leer_csv(ruta: Path):
    with ruta.open(encoding="utf-8-sig", newline="") as fh:
        filas = list(csv.reader(fh, delimiter=";"))
    cab = filas[0]
    anios = [int(c) for c in cab if re.fullmatch(r"\d{4}", c.strip())]
    return filas, cab, anios


def num_csv(txt: str):
    t = (txt or "").strip().replace(",", ".")
    try:
        return float(t) if t else None
    except ValueError:
        return None


def extraer(texto: str, filas: list, anios: list[int], anio: int, aviso=print):
    """Devuelve ({métrica: valor en millones}, [métricas no verificadas])."""
    previo = anio - 1
    if previo not in anios:
        return {}, list(ETQ), {}
    col_prev = 1 + anios.index(previo)
    en_csv = {f[0].strip(): num_csv(f[col_prev]) if col_prev < len(f) else None for f in filas[1:] if f}
    ok, no = {}, []
    for met, patrones in ETQ.items():
        ref = en_csv.get(met)
        if ref is None:
            no.append(met + " (el CSV no tiene el año anterior para verificar)")
            continue
        cand = candidatas(texto, patrones)
        hallado, mejor = None, None
        for et, nums in cand:
            for j in range(1, len(nums)):
                prev = nums[j]
                cur = next((nums[k] for k in range(j - 1, -1, -1) if prev and 0.05 <= abs(nums[k]) / abs(prev) <= 20), None)   # columna anterior del mismo orden de magnitud (salta notas y %)
                if cur is None:
                    continue
                if met in ABS:
                    cur, prev = abs(cur), abs(prev)
                for esc in (1e-6, 1e-3, 1.0):          # unidades → millones
                    err = abs(prev * esc - ref)
                    if abs(prev * esc) >= 0.5 and cerca(prev * esc, ref, 1.0) and (mejor is None or err < mejor):
                        mejor, hallado = err, (cur * esc, et)   # entre varias líneas/pares, el que mejor cuadra (a igualdad, el primero)
        if not hallado and met == "Capex":             # inmovilizado material + intangible en dos líneas
            for x in range(len(cand)):
                for y in range(x + 1, len(cand)):
                    (ex, nx), (ey, ny) = cand[x], cand[y]
                    for esc in (1e-6, 1e-3, 1.0):
                        p = (abs(nx[-1]) + abs(ny[-1])) * esc
                        if cerca(p, ref, 1.0) and (mejor is None or abs(p - ref) < mejor):
                            mejor, hallado = abs(p - ref), ((abs(nx[-2]) + abs(ny[-2])) * esc, ex + " + " + ey)
        if hallado:
            ok[met] = hallado
        else:
            no.append(met + " (ninguna línea del PDF cuadra con tu CSV del año anterior)")
    # BPA: el CSV suele traerlo vacío, así que no hay año anterior con el que cuadrarlo; se valida por coherencia con el beneficio neto
    # (BPA actual / BPA anterior ≈ beneficio neto actual / anterior, con margen por variación del nº de acciones)
    ni_prev, ni_cur = en_csv.get("Beneficio neto"), (ok.get("Beneficio neto") or (None,))[0]
    bpa_prev_fill = {}
    if ni_prev and ni_cur:
        mejor = None
        for et, nums in candidatas(texto, ETQ_BPA, True):
            for j in range(1, len(nums)):
                cur, prev = nums[j - 1], nums[j]
                if not prev or cur is None or abs(prev) > 1000 or abs(cur) > 1000:
                    continue
                err = abs(cur / prev - ni_cur / ni_prev) / abs(ni_cur / ni_prev)
                if err < 0.10 and (mejor is None or err < mejor[0]):
                    mejor = (err, cur, prev, et)
        if mejor:
            ok["BPA diluido"] = (mejor[1], mejor[3] + " (coherente con el beneficio neto; sin XBRL para cuadrarlo)")
            bpa_prev_fill["BPA diluido"] = mejor[2]
        else:
            no.append("BPA diluido (no he encontrado una línea de BPA coherente con el beneficio neto)")
    else:
        no.append("BPA diluido (falta el beneficio neto para validarlo)")
    return ok, no, bpa_prev_fill


def fmt(met: str, v: float) -> str:
    if met.endswith("%") or met in ("BPA diluido", "FCF / acción", "Deuda neta / EBITDA"):
        return f"{v:.2f}".replace(".", ",")
    return f"{v:.0f}"


def actualizar(carpeta: Path, anio: int | None = None, simular: bool = False) -> bool:
    nombre = carpeta.name[: -len(SUFIJO)].strip() if carpeta.name.endswith(SUFIJO) else carpeta.name
    ruta_csv = next(iter(carpeta.glob("*_datos.csv")), None)
    if not ruta_csv:
        print(f"{carpeta.name}: no tiene _datos.csv; ejecuta antes informes_anuales.py")
        return False
    filas, cab, anios = leer_csv(ruta_csv)
    pdfs = {}
    for p in carpeta.iterdir():
        m = re.fullmatch(rf"{re.escape(nombre)}_(?:(?:10K|20F|40F|AR|ESEF)_)?(\d{{4}})(?:_[a-z]{{2}})?", p.stem)
        if m and p.suffix.lower() == ".pdf":
            pdfs[int(m.group(1))] = p
    nuevos = [a for a in sorted(pdfs) if a > max(anios)] if anio is None else [anio]
    if not nuevos:
        print(f"{nombre}: el CSV ya llega a {max(anios)} (no hay informes más nuevos)")
        return False
    hecho = False
    for y in nuevos:
        if y not in pdfs:
            print(f"{nombre}: no encuentro el PDF de {y}")
            continue
        if y != max(anios) + 1:
            print(f"{nombre}: falta el ejercicio {max(anios) + 1} antes de {y}; añade primero el que falta")
            break
        print(f"{nombre} {y}: leyendo {pdfs[y].name}…")
        ok, no, prev_fill = extraer(texto_pdf(pdfs[y]), filas, anios, y)
        if not ok:
            print("  No he podido verificar ninguna cifra; no escribo nada. Usa «Completar con IA» en la app.")
            break
        # nueva columna antes de «Concepto XBRL»
        pos = len(anios) + 1
        nuevas = [list(f) for f in filas]
        nuevas[0] = cab[:pos] + [str(y)] + cab[pos:]
        idx = {f[0].strip(): i for i, f in enumerate(nuevas) if i > 0 and f}
        for i, f in enumerate(nuevas):
            if i == 0 or not f:
                continue
            f[pos:pos] = [""]
        for met, (v, et) in ok.items():
            nuevas[idx[met]][pos] = fmt(met, v)
        for met, v in prev_fill.items():   # el año anterior estaba vacío: se rellena con el comparativo del propio informe
            if met in idx and not (nuevas[idx[met]][pos - 1] or "").strip():
                nuevas[idx[met]][pos - 1] = fmt(met, v)
        g = lambda m: num_csv(nuevas[idx[m]][pos]) if m in idx else None
        def put(m, v):
            if m in idx and v is not None:
                nuevas[idx[m]][pos] = fmt(m, v)
        ebit, da, ventas, ni, fco, cap, eq = (g("Beneficio operativo (EBIT)"), g("Amortizaciones (D&A)"), g("Ventas"), g("Beneficio neto"), g("Flujo de caja operativo"), g("Capex"), g("Patrimonio neto (dominante)"))
        if fco is not None and cap is not None: put("FCF (FCO − Capex)", fco - cap)
        if ebit is not None and da is not None: put("EBITDA (EBIT + D&A)", ebit + da)
        if ventas:
            if ebit is not None: put("Margen operativo %", 100 * ebit / ventas)
            if ni is not None: put("Margen neto %", 100 * ni / ventas)
            if fco is not None and cap is not None: put("Margen FCF %", 100 * (fco - cap) / ventas)
        if ni is not None and eq: put("ROE %", 100 * ni / eq)
        print(f"  Verificadas ({len(ok)}):")
        for met, (v, et) in ok.items():
            print(f"    {met}: {fmt(met, v)}   ← «{et}»")
        if no:
            print(f"  Sin verificar, NO escritas ({len(no)}):")
            for x in no:
                print("    - " + x)
        if simular:
            print("  (simulación: no se ha escrito nada)")
            return False
        shutil.copyfile(ruta_csv, ruta_csv.with_suffix(".csv.bak"))
        with ruta_csv.open("w", newline="", encoding="utf-8-sig") as fh:
            csv.writer(fh, delimiter=";").writerows(nuevas)
        fu = next(iter(carpeta.glob("*_fuentes.md")), None)
        if fu:
            fu.write_text(fu.read_text(encoding="utf-8").rstrip("\n") + f"\n\nNota {dt.date.today()}: el ejercicio {y} del CSV se ha extraído del PDF {pdfs[y].name} (verificado con el comparativo {y - 1}); no hay XBRL oficial todavía.\n", encoding="utf-8")
        filas, cab, anios = nuevas, nuevas[0], anios + [y]
        hecho = True
        print(f"  CSV actualizado: {ruta_csv.name} (ahora hasta {y}; copia en .bak)")
    return hecho


def main():
    ap = argparse.ArgumentParser(description="Añade al CSV los ejercicios que solo tienes en PDF (verificando con el comparativo).")
    ap.add_argument("empresa", nargs="?", help="Nombre de la carpeta sin « annual report» (p. ej. SOL)")
    ap.add_argument("--todas", action="store_true")
    ap.add_argument("--simular", action="store_true")
    ap.add_argument("--carpeta", type=Path, default=CARPETA_BASE)
    a = ap.parse_args()
    if a.todas:
        n = 0
        for c in sorted(a.carpeta.iterdir()):
            if c.is_dir() and c.name.endswith(SUFIJO) and not c.name.startswith(("_", ".")):
                n += bool(actualizar(c, simular=a.simular))
        print(f"{n} CSV actualizado(s)")
        return
    if not a.empresa:
        ap.error("Indica la empresa (p. ej. SOL) o --todas")
    c = a.carpeta / (a.empresa + SUFIJO)
    if not c.is_dir():
        sys.exit(f"No existe {c}")
    actualizar(c, simular=a.simular)


if __name__ == "__main__":
    main()
