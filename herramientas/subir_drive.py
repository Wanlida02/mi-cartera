#!/usr/bin/env python3
"""Sube el índice de informes (indice_informes.json) a tu Google Drive para que la app Mi Cartera lo lea sola.

Solo usa la biblioteca estándar de Python. Permiso mínimo (drive.file): este script solo ve el archivo que él mismo crea.
Usa el MISMO cliente de Google que la app (así la app puede leer el archivo).

Primera vez (una sola vez):
  1) En Google Cloud → Clientes → tu cliente web → «URI de redireccionamiento autorizados» → añade  http://localhost:8765
  2) Copia el «Secreto del cliente» de ese mismo cliente y pégalo en  ~/.mi-cartera/cliente_secreto.txt  (solo el texto)
  3) Ejecuta:  python indice_informes.py --drive   (se abre el navegador para que des permiso; no hace falta repetirlo)
"""
import base64, hashlib, http.server, json, os, secrets, sys, threading, urllib.parse, urllib.request, webbrowser
from pathlib import Path

CLIENT_ID = "480691248279-u661oqhnte0qa5ffna3dkr6vf6c1q4gr.apps.googleusercontent.com"
SCOPE = "https://www.googleapis.com/auth/drive.file"
NOMBRE = "mi-cartera-informes.json"
PUERTO = 8765
REDIR = f"http://localhost:{PUERTO}"
DIR = Path.home() / ".mi-cartera"
TOKEN = DIR / "drive_token.json"
SECRETO = DIR / "cliente_secreto.txt"


def _post(url, datos):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(datos).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _secreto():
    if not SECRETO.exists():
        sys.exit(f"Falta el secreto del cliente. Pégalo en {SECRETO} (ver las instrucciones al inicio de este archivo).")
    return SECRETO.read_text().strip()


def _autorizar():
    """Abre el navegador una vez y guarda un permiso renovable."""
    verif = secrets.token_urlsafe(64)
    reto = base64.urlsafe_b64encode(hashlib.sha256(verif.encode()).digest()).rstrip(b"=").decode()
    estado = secrets.token_urlsafe(16)
    resp = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            resp.update({k: v[0] for k, v in q.items()})
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write("<h3>Listo. Ya puedes cerrar esta pestaña.</h3>".encode())

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("localhost", PUERTO), H)
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": CLIENT_ID, "redirect_uri": REDIR, "response_type": "code", "scope": SCOPE, "access_type": "offline",
        "prompt": "consent", "state": estado, "code_challenge": reto, "code_challenge_method": "S256"})
    print("Abriendo el navegador para dar permiso…"); webbrowser.open(url)
    srv.timeout = 180
    while "code" not in resp and "error" not in resp:
        srv.handle_request()
        if not resp:
            sys.exit("No se recibió respuesta de Google (tiempo agotado).")
    srv.server_close()
    if resp.get("error") or resp.get("state") != estado:
        sys.exit("Permiso denegado o respuesta no válida: " + str(resp.get("error")))
    t = _post("https://oauth2.googleapis.com/token", {"code": resp["code"], "client_id": CLIENT_ID, "client_secret": _secreto(),
                                                       "redirect_uri": REDIR, "grant_type": "authorization_code", "code_verifier": verif})
    DIR.mkdir(exist_ok=True)
    TOKEN.write_text(json.dumps({"refresh_token": t["refresh_token"]}))
    try:
        os.chmod(TOKEN, 0o600)
    except OSError:
        pass
    return t["access_token"]


def _acceso():
    if TOKEN.exists():
        try:
            rt = json.loads(TOKEN.read_text())["refresh_token"]
            return _post("https://oauth2.googleapis.com/token", {"refresh_token": rt, "client_id": CLIENT_ID,
                                                                  "client_secret": _secreto(), "grant_type": "refresh_token"})["access_token"]
        except Exception as e:
            print("El permiso guardado ya no vale (" + str(e) + "); se pide de nuevo.")
    return _autorizar()


def _api(url, tok, metodo="GET", cuerpo=None, ct=None):
    h = {"Authorization": "Bearer " + tok}
    if ct:
        h["Content-Type"] = ct
    with urllib.request.urlopen(urllib.request.Request(url, data=cuerpo, headers=h, method=metodo), timeout=60) as r:
        return json.load(r)


def subir(ruta):
    texto = Path(ruta).read_bytes()
    json.loads(texto)  # comprueba que es JSON válido
    tok = _acceso()
    q = urllib.parse.quote(f"name='{NOMBRE}' and trashed=false")
    fs = _api(f"https://www.googleapis.com/drive/v3/files?q={q}&fields=files(id,modifiedTime)&spaces=drive", tok).get("files", [])
    if fs:
        fid = sorted(fs, key=lambda f: f["modifiedTime"])[-1]["id"]
        _api(f"https://www.googleapis.com/upload/drive/v3/files/{fid}?uploadType=media", tok, "PATCH", texto, "application/json")
        print("Índice actualizado en tu Drive:", NOMBRE)
    else:
        b = "----informes" + secrets.token_hex(8)
        cuerpo = (f"--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + json.dumps({"name": NOMBRE, "mimeType": "application/json"}) +
                  f"\r\n--{b}\r\nContent-Type: application/json\r\n\r\n").encode() + texto + f"\r\n--{b}--".encode()
        _api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", tok, "POST", cuerpo, f"multipart/related; boundary={b}")
        print("Índice subido a tu Drive:", NOMBRE)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python subir_drive.py ruta/a/indice_informes.json")
    subir(sys.argv[1])
