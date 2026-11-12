#!/usr/bin/env python3
"""
indice_informes.py — Genera indice_informes.json a partir de la carpeta de valoraciones
("14. Valoraciones"), para cargarlo en la pestaña Informes de la app Mi Cartera.

Solo lee lo que ya dejó informes_anuales.py en cada carpeta "<Empresa> annual report":
    <Empresa>_10K_<AÑO>.pdf, <Empresa>_AR_<AÑO>.pdf, <Empresa>_ESEF_<AÑO>.pdf
    Resultados trimestrales/semestrales que dejes a mano en la carpeta (p. ej. presentation-3Q-2026.pdf, Q3_2026_results.pdf,
    9M_2026.pdf): se reconocen por Q1-4/T1-4/9M/H1/interim/results/presentation en el nombre, se indexan como «trimestrales»
    y NO cuentan como informe anual.
    <Empresa>_datos.csv       (cifras clave por ejercicio)
    <Empresa>_fuentes.md      (enlace a cada documento original)

Uso:
    python indice_informes.py                       (carpeta base = la de arriba de este script)
    python indice_informes.py --carpeta "D:/Mi Drive/14. Valoraciones"
    python indice_informes.py --salida otro.json

Solo biblioteca estándar. Es seguro ejecutarlo todas las veces que quieras: no toca los informes.
"""
from __future__ import annotations

import argparse
import sys
import csv
import datetime as dt
import json
import re
from pathlib import Path

CARPETA_BASE = Path(__file__).resolve().parent.parent
SUFIJO = " annual report"
EXT_DOC = {".pdf", ".htm", ".xhtml"}
# Cifras que se resumen en la app (el CSV completo sigue en tu carpeta)
METRICAS = ["Ventas", "Beneficio operativo (EBIT)", "Beneficio neto", "FCF (FCO − Capex)", "Margen operativo %",
            "Margen FCF %", "ROE %", "Deuda neta / EBITDA", "BPA diluido", "FCF / acción"]
ANIOS_RESUMEN = 6


def numero(txt: str):
    t = txt.strip().replace("\u2212", "-")
    if not t:
        return None
    try:
        return float(t.replace(".", "").replace(",", ".")) if re.search(r",\d", t) and "." in t else float(t.replace(",", "."))
    except ValueError:
        return None


def leer_csv(ruta: Path) -> dict:
    """{'divisa': 'USD', 'anios': [2019..], 'metricas': {nombre: [valor|None, ...]}}"""
    with ruta.open(encoding="utf-8-sig", newline="") as fh:
        filas = list(csv.reader(fh, delimiter=";"))
    if not filas:
        return {}
    cab = filas[0]
    m = re.search(r"\(([A-Z]{3})", cab[0])
    col_anios = [(i, int(c)) for i, c in enumerate(cab) if re.fullmatch(r"\d{4}", c.strip())]
    col_anios = col_anios[-ANIOS_RESUMEN:]
    out = {}
    for f in filas[1:]:
        nombre = f[0].strip() if f else ""
        if nombre in METRICAS:
            out[nombre] = [numero(f[i]) if i < len(f) else None for i, _ in col_anios]
    return {"divisa": m.group(1) if m else None, "anios": [a for _, a in col_anios], "metricas": out}


def leer_fuentes(ruta: Path) -> tuple[dict, str | None, str | None]:
    """Devuelve ({año: {'tipo','url'}}, ticker, identificador). Tabla: | Año | Tipo | Fecha | Documento / enlace |"""
    txt = ruta.read_text(encoding="utf-8")
    ticker = None
    m = re.search(r"ticker\s+([A-Za-z0-9.\-]+)", txt)
    if m and m.group(1) != "—":
        ticker = m.group(1).upper()
    ident = None
    m = re.search(r"^(?:CIK|LEI)\s+\S+\s+\((?:SEC|ESEF)\)", txt, re.M)
    if m:
        ident = m.group(0)
    por_anio = {}
    for linea in txt.splitlines():
        c = [x.strip() for x in linea.strip().strip("|").split("|")]
        if len(c) >= 4 and re.fullmatch(r"\d{4}", c[0]):
            urls = re.findall(r"\]\((https?://[^)\s]+)\)", c[3])
            por_anio[int(c[0])] = {"tipo": c[1], "url": urls[0] if urls else None}
    return por_anio, ticker, ident


# Documentos que NO son el informe anual: presentaciones y resultados trimestrales/semestrales (p. ej. «presentation-3Q-months-2026-revenues.pdf»)
RE_ANUAL = re.compile(r"annual|10-?k|20-?f|40-?f|esef|\bar\b|informe[_ -]?anual|memoria", re.I)
RE_TRIM = re.compile(r"(?<![a-z0-9])(?:[1-4]q|q[1-4]|[1-4]t|t[1-4]|h[12]|[12]h|[369]m|[369]-?months?|nine-?months?|interim|quarter\w*|trimest\w*|semest\w*|half-?year|results|presentation|earnings)(?![a-z])", re.I)


def periodo_trim(stem: str):
    """Devuelve (etiqueta, año) de un documento trimestral, p. ej. ('T3 2026', 2026); None si no parece trimestral."""
    if RE_ANUAL.search(stem) or not RE_TRIM.search(stem):
        return None
    ys = re.findall(r"(?<!\d)((?:19|20)\d{2})(?!\d)", stem)
    anio = int(max(ys)) if ys else None
    low = stem.lower()
    m = re.search(r"(?<![a-z0-9])(?:([1-4])q|q([1-4])|([1-4])t|t([1-4]))(?![a-z])", low)
    if m:
        etq = "T" + next(g for g in m.groups() if g)
    elif re.search(r"(?<![a-z0-9])(?:9m|9-?months?|nine-?months?)", low):
        etq = "9M"
    elif re.search(r"(?<![a-z0-9])(?:h1|1h|6m|6-?months?|half-?year|semest\w*)", low):
        etq = "S1"
    elif re.search(r"(?<![a-z0-9])(?:h2|2h)", low):
        etq = "S2"
    else:
        etq = "Trim."
    return (etq + (" " + str(anio) if anio else ""), anio)


def indexar_empresa(carpeta: Path, avisos: list | None = None) -> dict | None:
    avisos = avisos if avisos is not None else []
    nombre = carpeta.name[: -len(SUFIJO)].strip()
    docs = {}
    trims = []
    for p in sorted(carpeta.iterdir()):
        # <Nombre>_<TIPO>_<AÑO>[_idioma]  o, sin tipo (descargado a mano), <Nombre>_<AÑO>[_idioma]
        m = re.fullmatch(rf"{re.escape(nombre)}_(?:(10K|20F|40F|AR|ESEF)_)?(\d{{4}})(?:_([a-z]{{2}}))?", p.stem)
        if p.suffix.lower() not in EXT_DOC:
            continue
        pt = None if m else periodo_trim(p.stem)
        if pt:  # trimestral / semestral: no cuenta como informe anual
            trims.append({"periodo": pt[0], "anio": pt[1], "archivo": p.name, "tipo": "TRIM", "kb": round(p.stat().st_size / 1024),
                          "modificado": dt.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d")})
            continue
        if m:
            tipo, anio, idioma = m.group(1) or "AR", int(m.group(2)), m.group(3)
        else:  # nombre libre (descargado a mano): se toma el año que aparezca en el nombre
            ys = re.findall(r"(?<!\d)((?:19|20)\d{2})(?!\d)", p.stem)
            if not ys:
                avisos.append(f"{carpeta.name}: «{p.name}» no tiene ningún año en el nombre y se ha ignorado (renómbralo, p. ej. {nombre}_2024.pdf)")
                continue
            tipo, anio, idioma = "AR", int(max(ys)), None
        kb = round(p.stat().st_size / 1024)
        if anio in docs and docs[anio].get("kb", 0) >= kb and docs[anio].get("archivo"):
            continue  # si hay dos documentos del mismo año, se queda el más grande
        docs[anio] = {"anio": anio, "archivo": p.name, "tipo": tipo, "idioma": idioma, "kb": kb}
    ticker = ident = None
    fuentes_f = next(iter(carpeta.glob("*_fuentes.md")), None)
    if fuentes_f:
        por_anio, ticker, ident = leer_fuentes(fuentes_f)
        for a, f in por_anio.items():
            docs.setdefault(a, {"anio": a, "archivo": None, "tipo": f["tipo"]})["url"] = f["url"]
    datos = None
    csv_f = next(iter(carpeta.glob("*_datos.csv")), None)
    if csv_f:
        try:
            datos = leer_csv(csv_f)
        except Exception as e:  # CSV raro: se indexa igualmente el resto
            datos = {"error": str(e)}
    if not docs and not datos and not trims:
        avisos.append(f"{carpeta.name}: no se ha reconocido ningún informe (¿PDF sin año en el nombre?) y no tiene _datos.csv; no aparece en la app")
        return None
    anios = sorted(docs)
    return {"nombre": nombre, "carpeta": carpeta.name, "ticker": ticker, "ident": ident,
            "ultimo_anio": anios[-1] if anios else None, "documentos": [docs[a] for a in anios],
            "trimestrales": sorted(trims, key=lambda t: (t["anio"] or 0, t["periodo"])),
            "datos": datos, "csv": csv_f.name if csv_f else None,
            "modificado": dt.datetime.fromtimestamp(max(p.stat().st_mtime for p in carpeta.iterdir())).strftime("%Y-%m-%d")}


def main():
    ap = argparse.ArgumentParser(description="Genera indice_informes.json para la app Mi Cartera.")
    ap.add_argument("--carpeta", type=Path, default=CARPETA_BASE, help="Carpeta de valoraciones")
    ap.add_argument("--salida", type=Path, help="Archivo de salida (por defecto, dentro de la carpeta)")
    ap.add_argument("--drive", action="store_true", help="Sube también el índice a tu Google Drive (ver subir_drive.py)")
    a = ap.parse_args()
    empresas, avisos = [], []
    for c in sorted(a.carpeta.iterdir(), key=lambda x: x.name.lower()):
        if not c.is_dir() or c.name.startswith(("_", ".")):
            continue
        if c.name.endswith(SUFIJO):
            e = indexar_empresa(c, avisos)
            if e:
                empresas.append(e)
        elif "annual report" in c.name.lower() or "informe" in c.name.lower():
            avisos.append(f"{c.name}: la carpeta debe llamarse «<Empresa>{SUFIJO}» (en minúsculas y con ese espacio) para que se indexe")
    salida = a.salida or (a.carpeta / "indice_informes.json")
    salida.write_text(json.dumps({"version": 1, "generado": dt.datetime.now().isoformat(timespec="seconds"),
                                  "empresas": empresas, "avisos": avisos}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(empresas)} empresas indexadas → {salida}")
    if avisos:
        print(f"\n⚠ {len(avisos)} aviso(s):")
        for av in avisos:
            print("   - " + av)
        print()
    if a.drive:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import subir_drive
        subir_drive.subir(salida)
    for e in empresas:
        tr = e.get("trimestrales") or []
        print(f"  {e['nombre']:<22} {len(e['documentos'])} informes · último {e['ultimo_anio']}" + ("  · con cifras" if e["datos"] else "") + (f"  · trimestral: {tr[-1]['periodo']}" if tr else ""))


if __name__ == "__main__":
    main()
