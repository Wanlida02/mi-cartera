#!/usr/bin/env python3
"""
indice_informes.py — Genera indice_informes.json a partir de la carpeta de valoraciones
("14. Valoraciones"), para cargarlo en la pestaña Informes de la app Mi Cartera.

Solo lee lo que ya dejó informes_anuales.py en cada carpeta "<Empresa> annual report":
    <Empresa>_10K_<AÑO>.pdf, <Empresa>_AR_<AÑO>.pdf, <Empresa>_ESEF_<AÑO>.pdf
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


def indexar_empresa(carpeta: Path) -> dict | None:
    nombre = carpeta.name[: -len(SUFIJO)].strip()
    docs = {}
    for p in sorted(carpeta.iterdir()):
        m = re.fullmatch(rf"{re.escape(nombre)}_(10K|20F|40F|AR|ESEF)_(\d{{4}})(?:_([a-z]{{2}}))?", p.stem)
        if m and p.suffix.lower() in EXT_DOC:
            tipo, anio, idioma = m.group(1), int(m.group(2)), m.group(3)
            docs.setdefault(anio, {"anio": anio}).update(archivo=p.name, tipo=tipo, idioma=idioma, kb=round(p.stat().st_size / 1024))
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
    if not docs and not datos:
        return None
    anios = sorted(docs)
    return {"nombre": nombre, "carpeta": carpeta.name, "ticker": ticker, "ident": ident,
            "ultimo_anio": anios[-1] if anios else None, "documentos": [docs[a] for a in anios],
            "datos": datos, "csv": csv_f.name if csv_f else None,
            "modificado": dt.datetime.fromtimestamp(max(p.stat().st_mtime for p in carpeta.iterdir())).strftime("%Y-%m-%d")}


def main():
    ap = argparse.ArgumentParser(description="Genera indice_informes.json para la app Mi Cartera.")
    ap.add_argument("--carpeta", type=Path, default=CARPETA_BASE, help="Carpeta de valoraciones")
    ap.add_argument("--salida", type=Path, help="Archivo de salida (por defecto, dentro de la carpeta)")
    a = ap.parse_args()
    empresas = []
    for c in sorted(a.carpeta.iterdir(), key=lambda x: x.name.lower()):
        if c.is_dir() and c.name.endswith(SUFIJO):
            e = indexar_empresa(c)
            if e:
                empresas.append(e)
    salida = a.salida or (a.carpeta / "indice_informes.json")
    salida.write_text(json.dumps({"version": 1, "generado": dt.datetime.now().isoformat(timespec="seconds"),
                                  "empresas": empresas}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(empresas)} empresas indexadas → {salida}")
    for e in empresas:
        print(f"  {e['nombre']:<22} {len(e['documentos'])} informes · último {e['ultimo_anio']}" + ("  · con cifras" if e["datos"] else ""))


if __name__ == "__main__":
    main()
