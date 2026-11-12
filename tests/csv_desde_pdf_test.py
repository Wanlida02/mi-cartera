"""csv_desde_pdf: cada cifra se acepta solo si el año anterior del PDF cuadra con el CSV. Texto inventado con el estilo de un informe real."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "herramientas"))
import csv_desde_pdf as c

filas = [
    ["Métrica (EUR millones salvo indicado)", "2023", "2024", "Concepto XBRL"],
    ["Ventas", "1530", "1645", "Revenue"],
    ["Beneficio operativo (EBIT)", "227", "237", "x"],
    ["Beneficio neto", "146", "148", "x"],
    ["Dividendos pagados", "34", "38", "x"],
    ["Fondo de comercio", "246", "264", "x"],
    ["Capex", "190", "220", "x"],
]
texto = """
Revenues from sales and services          1      1,776,086        100.0%      1,610,444       100.0%
Revenues                                         1,810,090        101.9%      1,644,608       102.1%
Operating result                                   270,028         15.2%        237,177        14.7%
Net Profit/(Loss)                                  166,993          9.4%        147,698         9.2%
Earnings per share                                   1.841                       1.628
Dividends paid                                 20       (38,321)       (37,776)
Dividend distribution       -   -   -   (35,373)   (35,373)   (2,948)   (38,321)
Goodwill                                        9     266,810      264,395
Acquisition of tangible fixed assets          9      (215,991)      (202,329)
Increases in intangible assets                       (18,375)       (17,262)
"""
ok, no, prev = c.extraer(texto, filas, [2023, 2024], 2025)
v = {k: round(x[0]) for k, x in ok.items()}
assert v["Ventas"] == 1810, v                     # «Revenues», no «Revenues from sales…» (su comparativo no cuadra con el CSV)
assert v["Beneficio operativo (EBIT)"] == 270 and v["Beneficio neto"] == 167, v
assert v["Dividendos pagados"] == 38, v           # no coge la nota «20» ni la línea del estado de patrimonio
assert v["Fondo de comercio"] == 267, v           # la nota «9» no es una columna
assert v["Capex"] == 234, v                       # suma de las dos líneas
assert abs(ok["BPA diluido"][0] - 1.841) < 1e-9 and abs(prev["BPA diluido"] - 1.628) < 1e-9
# un PDF cuyo comparativo NO cuadra con el CSV no se acepta
ok2, no2, _ = c.extraer(texto.replace("1,644,608", "1,244,608"), filas, [2023, 2024], 2025)
assert "Ventas" not in ok2 and any(x.startswith("Ventas") for x in no2)
assert c.a_numero("(1,234)") == -1234 and c.a_numero("1.234,5") == 1234.5 and c.a_numero("12,5") == 12.5
print("csv_desde_pdf ok")
