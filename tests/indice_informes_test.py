"""Prueba del indexador de informes: formatos de nombre válidos, avisos y carpetas mal nombradas."""
import json, subprocess, sys, tempfile
from pathlib import Path
raiz = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    def f(carpeta, *nombres):
        (t / carpeta).mkdir(exist_ok=True)
        for n in nombres:
            (t / carpeta / n).write_text("x")
    f("Alphabet annual report", "Alphabet_2019.pdf", "Alphabet_10K_2023.pdf", "Alphabet_2024.pdf")
    f("Airbus annual report", "AIRBUS FY2021 FINANCIAL STATEMENTS DS.pdf", "Airbus Financial Statements 2024 (1).pdf", "airbus_fy_2025_financial_statements_1.pdf", "informe_final.pdf")
    f("CATL annual report", "56073.ar.zh.2018.pdf", "2025.pdf")
    f("Vacia annual report", "notas.txt")
    f("Mal Annual Report", "Mal_2020.pdf")          # mayúsculas: no entra, debe avisar
    f("_herramientas", "x.py")                      # se ignora sin avisar
    r = subprocess.run([sys.executable, str(raiz / "herramientas" / "indice_informes.py"), "--carpeta", str(t)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    j = json.loads((t / "indice_informes.json").read_text(encoding="utf-8"))
    por = {e["nombre"]: [d["anio"] for d in e["documentos"]] for e in j["empresas"]}
    assert por["Alphabet"] == [2019, 2023, 2024], por
    assert por["Airbus"] == [2021, 2024, 2025], por
    assert por["CATL"] == [2018, 2025], por
    av = "\n".join(j["avisos"])
    assert "informe_final.pdf" in av and "Vacia annual report" in av and "Mal Annual Report" in av, av
    assert "_herramientas" not in av
print("indice_informes ok")
