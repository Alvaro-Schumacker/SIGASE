"""Local SIGASE server with a SQLite database."""
from __future__ import annotations

import json
import hashlib
import hmac
import secrets
import sqlite3
import unicodedata
from datetime import date
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "sigase.sqlite3"
UNIT_RANKS = ("Cap", "1º Ten", "2º Ten", "STen", "1º Sgt", "2º Sgt", "3º Sgt", "Cb EP", "Sd EP", "Sd EV")
PASSWORD_ITERATIONS = 180_000


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"{salt.hex()}:{digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        salt_hex, digest_hex = encoded.split(":", 1)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PASSWORD_ITERATIONS)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _normalize_function(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _canonical_unit_rank(value: str) -> str | None:
    key = "".join(char for char in _normalize_function(value).replace("º", "o").replace("°", "o") if char.isalnum())
    aliases = {
        "cap": "Cap", "capitao": "Cap",
        "1oten": "1º Ten", "1otenente": "1º Ten", "tenente": "1º Ten",
        "2oten": "2º Ten", "2otenente": "2º Ten",
        "sten": "STen", "subten": "STen", "subtenente": "STen",
        "1osgt": "1º Sgt", "1osargento": "1º Sgt", "1sargento": "1º Sgt",
        "2osgt": "2º Sgt", "2osargento": "2º Sgt", "2sargento": "2º Sgt",
        "3osgt": "3º Sgt", "3osargento": "3º Sgt", "3sargento": "3º Sgt",
        "cbep": "Cb EP", "caboep": "Cb EP", "cb": "Cb EP", "cabo": "Cb EP",
        "sdep": "Sd EP", "soldadoep": "Sd EP", "sd": "Sd EP", "soldado": "Sd EP",
        "sdev": "Sd EV", "soldadoev": "Sd EV",
    }
    return aliases.get(key)


def connect_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def initialize_db() -> None:
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS personnel (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                rank TEXT NOT NULL,
                function TEXT NOT NULL,
                section TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Ativo',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS task_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.executemany("INSERT OR IGNORE INTO task_categories (name) VALUES (?)", [(name,) for name in ("Férias", "Aditamentos", "Pernoites")])
        db.execute("""
            CREATE TABLE IF NOT EXISTS app_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                login TEXT,
                password_hash TEXT,
                role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
                functions_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        user_columns = {row[1] for row in db.execute("PRAGMA table_info(app_users)").fetchall()}
        if "login" not in user_columns:
            db.execute("ALTER TABLE app_users ADD COLUMN login TEXT")
        if "password_hash" not in user_columns:
            db.execute("ALTER TABLE app_users ADD COLUMN password_hash TEXT")
        if db.execute("SELECT COUNT(*) FROM app_users").fetchone()[0] == 0:
            db.execute(
                "INSERT INTO app_users (display_name,login,password_hash,role,functions_json) VALUES (?,?,?,?,?)",
                ("Administrador", "0000", _password_hash("0000"), "admin", "[]"),
            )
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_login ON app_users(login COLLATE NOCASE)")
        db.execute("""CREATE TABLE IF NOT EXISTS user_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL
        )""")
        db.execute("""
            CREATE TABLE IF NOT EXISTS unit_personnel (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                war_name TEXT NOT NULL,
                birth_date TEXT NOT NULL,
                rank TEXT NOT NULL,
                qm TEXT NOT NULL,
                section TEXT NOT NULL,
                address TEXT NOT NULL,
                cpf TEXT NOT NULL,
                military_id TEXT NOT NULL,
                additional_data TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        for roster_row in db.execute("SELECT id,rank FROM unit_personnel").fetchall():
            canonical_rank = _canonical_unit_rank(roster_row["rank"])
            if canonical_rank and canonical_rank != roster_row["rank"]:
                db.execute("UPDATE unit_personnel SET rank=? WHERE id=?", (canonical_rank, roster_row["id"]))
        db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL CHECK(kind IN ('aditamento', 'pernoite', 'fatd')),
                bulletin_number TEXT NOT NULL,
                document_date TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        schema = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'").fetchone()[0]
        if "'fatd'" not in schema:
            db.execute("ALTER TABLE documents RENAME TO documents_legacy")
            db.execute("""
                CREATE TABLE documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL CHECK(kind IN ('aditamento', 'pernoite', 'fatd')),
                    bulletin_number TEXT NOT NULL,
                    document_date TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            db.execute("INSERT INTO documents SELECT * FROM documents_legacy")
            db.execute("DROP TABLE documents_legacy")
        db.execute("""
            CREATE TABLE IF NOT EXISTS force_maps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_date TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS vacation_plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id INTEGER NOT NULL REFERENCES unit_personnel(id),
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                travel_days INTEGER NOT NULL DEFAULT 0 CHECK(travel_days IN (0,1)),
                vacation_days INTEGER NOT NULL,
                presentation_date TEXT NOT NULL,
                period_number INTEGER NOT NULL CHECK(period_number BETWEEN 1 AND 3),
                period_total INTEGER NOT NULL CHECK(period_total BETWEEN 1 AND 3),
                task_added INTEGER NOT NULL DEFAULT 0 CHECK(task_added IN (0,1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS duty_scales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                mode TEXT NOT NULL CHECK(mode IN ('corrida','preta_vermelha','completa')),
                services_json TEXT NOT NULL,
                participants_json TEXT NOT NULL,
                assignments_json TEXT NOT NULL DEFAULT '{}',
                red_dates_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS notices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                subject TEXT NOT NULL,
                notice_date TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS notice_recipients (
                notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                acknowledged_at TEXT,
                PRIMARY KEY (notice_id, user_id)
            )
        """)
        notice_columns = {row[1] for row in db.execute("PRAGMA table_info(notices)").fetchall()}
        if "category" not in notice_columns:
            db.execute("ALTER TABLE notices ADD COLUMN category TEXT NOT NULL DEFAULT 'geral'")
        if "source_type" not in notice_columns:
            db.execute("ALTER TABLE notices ADD COLUMN source_type TEXT")
        if "source_id" not in notice_columns:
            db.execute("ALTER TABLE notices ADD COLUMN source_id INTEGER")

        vacation_recipient_ids = set()
        for user_row in db.execute("SELECT id, functions_json FROM app_users").fetchall():
            try:
                functions = json.loads(user_row["functions_json"])
            except (TypeError, json.JSONDecodeError):
                functions = []
            if any(_normalize_function(str(function)) == "ferias" for function in functions):
                vacation_recipient_ids.add(user_row["id"])
        auto_notice_ids = [row[0] for row in db.execute("SELECT id FROM notices WHERE category='ferias' AND source_type='vacation'").fetchall()]
        for notice_id in auto_notice_ids:
            current_recipients = [row[0] for row in db.execute("SELECT user_id FROM notice_recipients WHERE notice_id=?", (notice_id,)).fetchall()]
            for user_id in current_recipients:
                if user_id not in vacation_recipient_ids:
                    db.execute("DELETE FROM notice_recipients WHERE notice_id=? AND user_id=?", (notice_id, user_id))
            db.executemany("INSERT OR IGNORE INTO notice_recipients (notice_id,user_id) VALUES (?,?)", [(notice_id, user_id) for user_id in vacation_recipient_ids])


class SigaseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt, *args):
        # Log requests for local troubleshooting; request bodies are never logged.
        print(f"[SIGASE HTTP] {fmt % args}", flush=True)

    def end_headers(self):
        if not urlparse(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status: int, payload: dict, headers: dict | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        size = min(int(self.headers.get("Content-Length", "0")), 32_000)
        try:
            parsed = json.loads(self.rfile.read(size) or b"{}")
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def _current_user(self) -> str | None:
        record = self._current_user_record()
        return record["display_name"] if record else None

    def _current_user_record(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            session_cookie = cookie.get("sigase_session")
            if not session_cookie:
                return None
            token_hash = hashlib.sha256(session_cookie.value.encode("utf-8")).hexdigest()
            with connect_db() as db:
                return db.execute("SELECT u.* FROM app_users u JOIN user_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP", (token_hash,)).fetchone()
            return None
        except (AttributeError, KeyError, sqlite3.Error):
            return None

    def _require_user(self) -> str | None:
        user = self._current_user()
        if user is None:
            self._json(401, {"error": "Entre no SIGASE para continuar."})
        return user

    def _require_admin(self) -> str | None:
        user = self._require_user()
        record = self._current_user_record() if user else None
        if user and (not record or record["role"] != "admin"):
            self._json(403, {"error": "Esta ação exige o nível de permissão Administrador."})
            return None
        return user

    def _require_document_editor(self) -> str | None:
        user = self._require_user()
        record = self._current_user_record() if user else None
        if user and (not record or record["role"] not in ("admin", "editor")):
            self._json(403, {"error": "Seu nível de acesso permite somente visualizar documentos."})
            return None
        return user

    @staticmethod
    def _user_record(row: sqlite3.Row) -> dict:
        record = dict(row)
        record.pop("password_hash", None)
        record["functions"] = json.loads(record.pop("functions_json"))
        return record

    def _user_payload(self, record: sqlite3.Row) -> dict:
        return {
            "user": record["display_name"], "role": record["role"],
            "functions": json.loads(record["functions_json"]),
            "canEditPersonnel": record["role"] == "admin",
            "canEditDocuments": record["role"] in ("admin", "editor"),
            "canManageUsers": record["role"] == "admin",
            "canEditScales": record["role"] == "admin",
            "canManageNotices": record["role"] in ("admin", "editor"),
        }

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            try:
                with connect_db() as db:
                    db.execute("SELECT 1").fetchone()
                self._json(200, {"ok": True, "service": "SIGASE local"})
            except sqlite3.Error:
                self._json(503, {"ok": False, "error": "Banco local indisponível."})
            return
        if Path(path).name.startswith("sigase.sqlite3") or path.endswith(".db"):
            self._json(404, {"error": "Arquivo não encontrado."})
            return
        if path == "/api/demo-users":
            self._json(404, {"error": "Rota não encontrada."})
            return
        if path == "/api/me":
            record = self._current_user_record()
            if not record:
                self._require_user()
            else:
                self._json(200, self._user_payload(record))
            return
        if path == "/api/users":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT id,display_name,login,role,functions_json,created_at,updated_at FROM app_users ORDER BY display_name COLLATE NOCASE").fetchall()
            self._json(200, {"users": [self._user_record(row) for row in rows]})
            return
        if path == "/api/task-categories":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT id,name FROM task_categories ORDER BY name COLLATE NOCASE").fetchall()
            self._json(200, {"categories": [dict(row) for row in rows]})
            return
        if path == "/api/notices":
            current_user = self._current_user_record()
            if not current_user:
                self._require_user()
                return
            with connect_db() as db:
                rows = db.execute(
                    """SELECT n.*,
                              EXISTS(SELECT 1 FROM notice_recipients nr WHERE nr.notice_id=n.id AND nr.user_id=?) AS is_recipient,
                              (SELECT nr.acknowledged_at FROM notice_recipients nr WHERE nr.notice_id=n.id AND nr.user_id=?) AS acknowledged_at
                       FROM notices n
                       WHERE n.created_by=? COLLATE NOCASE
                          OR EXISTS(SELECT 1 FROM notice_recipients nr WHERE nr.notice_id=n.id AND nr.user_id=?)
                       ORDER BY n.notice_date DESC, n.id DESC""",
                    (current_user["id"], current_user["id"], current_user["display_name"], current_user["id"]),
                ).fetchall()
            self._json(200, {"notices": [self._notice_payload(row, current_user) for row in rows]})
            return
        if path == "/api/personnel":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT id, name, rank, function, section, status, created_at, updated_at FROM personnel ORDER BY rank, name COLLATE NOCASE").fetchall()
            self._json(200, {"personnel": [dict(row) for row in rows]})
            return
        if path == "/api/unit-personnel":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT * FROM unit_personnel ORDER BY full_name COLLATE NOCASE").fetchall()
            self._json(200, {"personnel": [self._unit_record(row) for row in rows]})
            return
        if path == "/api/documents":
            if not self._require_user():
                return
            kind = parse_qs(urlparse(self.path).query).get("kind", [None])[0]
            if kind not in ("aditamento", "pernoite", "fatd"):
                self._json(400, {"error": "Selecione a área documental."})
                return
            with connect_db() as db:
                rows = db.execute("SELECT * FROM documents WHERE kind=? ORDER BY document_date DESC, id DESC", (kind,)).fetchall()
            self._json(200, {"documents": [self._document_record(row) for row in rows]})
            return
        if path == "/api/force-maps":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT * FROM force_maps ORDER BY activity_date DESC, id DESC").fetchall()
            self._json(200, {"maps": [self._force_map_record(row) for row in rows]})
            return
        if path == "/api/vacation-plan":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT v.*, p.full_name, p.rank FROM vacation_plan v JOIN unit_personnel p ON p.id=v.person_id ORDER BY v.start_date, p.full_name COLLATE NOCASE").fetchall()
            self._json(200, {"periods": [dict(row) for row in rows]})
            return
        if path == "/api/service-scales":
            if not self._require_user():
                return
            with connect_db() as db:
                rows = db.execute("SELECT * FROM duty_scales ORDER BY name COLLATE NOCASE").fetchall()
                roster = {row["id"]: dict(row) for row in db.execute("SELECT id, full_name, war_name, rank FROM unit_personnel").fetchall()}
            scales = [self._scale_record(row, roster) for row in rows]
            self._json(200, {"scales": scales})
            return
        if path.startswith("/api/"):
            self._json(404, {"error": "Rota não encontrada."})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            body = self._body()
            login, password = body.get("login"), body.get("password")
            if not isinstance(login, str) or not isinstance(password, str):
                self._json(400, {"error": "Informe o login e a senha."})
                return
            with connect_db() as db:
                record = db.execute("SELECT * FROM app_users WHERE login=? COLLATE NOCASE", (login.strip(),)).fetchone()
                if not record or not _verify_password(password, record["password_hash"]):
                    self._json(401, {"error": "Login ou senha inválidos."})
                    return
                token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
                db.execute("INSERT INTO user_sessions (token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))", (token_hash, record["id"]))
            if not record:
                self._json(401, {"error": "Login ou senha inválidos."})
                return
            self._json(200, self._user_payload(record), {"Set-Cookie": f"sigase_session={token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict"})
            return
        if path == "/api/logout":
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
                session_cookie = cookie.get("sigase_session")
                if session_cookie:
                    token_hash = hashlib.sha256(session_cookie.value.encode("utf-8")).hexdigest()
                    with connect_db() as db:
                        db.execute("DELETE FROM user_sessions WHERE token_hash=?", (token_hash,))
            except (sqlite3.Error, AttributeError):
                pass
            self._json(200, {"ok": True}, {"Set-Cookie": "sigase_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"})
            return
        if path == "/api/notices":
            current_user = self._current_user_record()
            if not current_user:
                self._require_user()
                return
            if current_user["role"] not in ("admin", "editor"):
                self._json(403, {"error": "Seu nível de acesso não permite criar avisos."})
                return
            body = self._body()
            title = body.get("title")
            subject = body.get("subject")
            notice_date = body.get("notice_date")
            if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
                self._json(400, {"error": "Informe um título com até 120 caracteres."})
                return
            if not isinstance(subject, str) or not subject.strip() or len(subject.strip()) > 2000:
                self._json(400, {"error": "Informe o assunto do aviso (até 2.000 caracteres)."})
                return
            try:
                notice_date = date.fromisoformat(notice_date).isoformat()
            except (TypeError, ValueError):
                self._json(400, {"error": "Informe uma data válida para o aviso."})
                return
            with connect_db() as db:
                if body.get("all_users") is True:
                    recipient_ids = [row[0] for row in db.execute("SELECT id FROM app_users").fetchall()]
                else:
                    raw_ids = body.get("recipient_ids")
                    if not isinstance(raw_ids, list) or not raw_ids:
                        self._json(400, {"error": "Selecione ao menos um destinatário ou marque Avisar todos."})
                        return
                    try:
                        recipient_ids = list(dict.fromkeys(int(value) for value in raw_ids))
                    except (TypeError, ValueError):
                        self._json(400, {"error": "A lista de destinatários é inválida."})
                        return
                    valid_ids = {row[0] for row in db.execute(
                        f"SELECT id FROM app_users WHERE id IN ({','.join('?' for _ in recipient_ids)})", recipient_ids
                    ).fetchall()} if recipient_ids else set()
                    if len(valid_ids) != len(recipient_ids):
                        self._json(400, {"error": "Um ou mais destinatários não existem."})
                        return
                cur = db.execute(
                    "INSERT INTO notices (title,subject,notice_date,created_by) VALUES (?,?,?,?)",
                    (title.strip(), subject.strip(), notice_date, current_user["display_name"]),
                )
                db.executemany("INSERT INTO notice_recipients (notice_id,user_id) VALUES (?,?)", [(cur.lastrowid, uid) for uid in recipient_ids])
            self._json(201, {"ok": True, "id": cur.lastrowid})
            return
        if path.startswith("/api/notices/") and path.endswith("/ack"):
            current_user = self._current_user_record()
            if not current_user:
                self._require_user()
                return
            try:
                notice_id = int(path.split("/")[3])
            except (IndexError, ValueError):
                self._json(400, {"error": "Aviso inválido."})
                return
            with connect_db() as db:
                receipt = db.execute("SELECT 1 FROM notice_recipients WHERE notice_id=? AND user_id=?", (notice_id, current_user["id"])).fetchone()
                if not receipt:
                    self._json(404, {"error": "Este aviso não foi direcionado a você."})
                    return
                db.execute("UPDATE notice_recipients SET acknowledged_at=COALESCE(acknowledged_at,CURRENT_TIMESTAMP) WHERE notice_id=? AND user_id=?", (notice_id, current_user["id"]))
            self._json(200, {"ok": True})
            return
        if path == "/api/users":
            if not self._require_admin():
                return
            body = self._body()
            record, error = self._validate_app_user(body)
            if not error and not record["password"]:
                error = "Defina uma senha para o novo usuário."
            if error:
                self._json(400, {"error": error})
                return
            try:
                with connect_db() as db:
                    cur = db.execute("INSERT INTO app_users (display_name,login,password_hash,role,functions_json,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)", (record["display_name"], record["login"], _password_hash(record["password"]), record["role"], json.dumps(record["functions"], ensure_ascii=False)))
                    row = db.execute("SELECT id,display_name,login,role,functions_json,created_at,updated_at FROM app_users WHERE id=?", (cur.lastrowid,)).fetchone()
            except sqlite3.IntegrityError:
                self._json(400, {"error": "Já existe um usuário ou login com esses dados."})
                return
            self._json(201, {"user": self._user_record(row)})
            return
        if path == "/api/task-categories":
            if not self._require_admin():
                return
            name, error = self._validate_category(self._body().get("name"))
            if error:
                self._json(400, {"error": error})
                return
            try:
                with connect_db() as db:
                    cur = db.execute("INSERT INTO task_categories (name) VALUES (?)", (name,))
            except sqlite3.IntegrityError:
                self._json(400, {"error": "Essa classificação já existe."})
                return
            self._json(201, {"category": {"id": cur.lastrowid, "name": name}})
            return
        if path == "/api/personnel":
            if not self._require_admin():
                return
            record, error = self._validate_person(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("INSERT INTO personnel (name, rank, function, section, status, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", tuple(record.values()))
                row = db.execute("SELECT id, name, rank, function, section, status, created_at, updated_at FROM personnel WHERE id=?", (cur.lastrowid,)).fetchone()
            self._json(201, {"person": dict(row)})
            return
        if path == "/api/unit-personnel":
            if not self._require_admin():
                return
            record, error = self._validate_unit_person(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("""
                    INSERT INTO unit_personnel
                    (full_name, war_name, birth_date, rank, qm, section, address, cpf, military_id, additional_data, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, tuple(record.values()))
                row = db.execute("SELECT * FROM unit_personnel WHERE id=?", (cur.lastrowid,)).fetchone()
            self._json(201, {"person": self._unit_record(row)})
            return
        if path == "/api/documents":
            if not self._require_document_editor():
                return
            record, error = self._validate_document(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("INSERT INTO documents (kind, bulletin_number, document_date, data_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", (record["kind"], record["bulletin_number"], record["document_date"], json.dumps(record["data"], ensure_ascii=False)))
                row = db.execute("SELECT * FROM documents WHERE id=?", (cur.lastrowid,)).fetchone()
            self._json(201, {"document": self._document_record(row)})
            return
        if path == "/api/force-maps":
            if not self._require_document_editor():
                return
            record, error = self._validate_force_map(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("INSERT INTO force_maps (activity_date,data_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)", (record["activity_date"], json.dumps(record["data"], ensure_ascii=False)))
                row = db.execute("SELECT * FROM force_maps WHERE id=?", (cur.lastrowid,)).fetchone()
            self._json(201, {"map": self._force_map_record(row)})
            return
        if path == "/api/vacation-plan":
            created_by = self._require_admin()
            if not created_by:
                return
            record, error = self._validate_vacation(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                if not db.execute("SELECT 1 FROM unit_personnel WHERE id=?", (record["person_id"],)).fetchone():
                    self._json(400, {"error": "Selecione uma pessoa cadastrada no efetivo."})
                    return
                cur = db.execute("INSERT INTO vacation_plan (person_id,start_date,end_date,travel_days,vacation_days,presentation_date,period_number,period_total,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)", tuple(record.values()))
                row = db.execute("SELECT v.*, p.full_name, p.rank FROM vacation_plan v JOIN unit_personnel p ON p.id=v.person_id WHERE v.id=?", (cur.lastrowid,)).fetchone()
                self._sync_vacation_notices(db, row, created_by)
            self._json(201, {"period": dict(row)})
            return
        if path == "/api/service-scales":
            if not self._require_admin():
                return
            record, error = self._validate_scale(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                roster_ids = {r[0] for r in db.execute("SELECT id FROM unit_personnel WHERE id IN (%s)" % ",".join("?" for _ in record["participants"]), record["participants"]).fetchall()} if record["participants"] else set()
                if roster_ids != set(record["participants"]):
                    self._json(400, {"error": "Selecione somente pessoas existentes no efetivo."})
                    return
                cur = db.execute("INSERT INTO duty_scales (name,mode,services_json,participants_json,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)", (record["name"], record["mode"], json.dumps(record["services"], ensure_ascii=False), json.dumps(record["participants"])))
                row = db.execute("SELECT * FROM duty_scales WHERE id=?", (cur.lastrowid,)).fetchone()
                roster = {r["id"]: dict(r) for r in db.execute("SELECT id, full_name, war_name, rank FROM unit_personnel").fetchall()}
            self._json(201, {"scale": self._scale_record(row, roster)})
            return
        if path.startswith("/api/service-scales/") and path.endswith("/cell"):
            if not self._require_admin():
                return
            try:
                scale_id = int(path.split("/")[-2])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            body = self._body()
            try:
                person_id = int(body.get("person_id"))
                cell_date = date.fromisoformat(body.get("date", "")).isoformat()
            except (TypeError, ValueError):
                self._json(400, {"error": "Pessoa ou data inválida."})
                return
            service = body.get("service")
            if service is not None and (not isinstance(service, str) or len(service) > 40):
                self._json(400, {"error": "Serviço inválido."})
                return
            with connect_db() as db:
                row = db.execute("SELECT * FROM duty_scales WHERE id=?", (scale_id,)).fetchone()
                if not row or person_id not in json.loads(row["participants_json"]):
                    self._json(404, {"error": "Escala ou participante não encontrado."})
                    return
                assignments = json.loads(row["assignments_json"])
                key = f"{person_id}|{cell_date}"
                if service:
                    service_config = {item["name"]: item["daily_slots"] for item in json.loads(row["services_json"])}
                    if service not in service_config:
                        self._json(400, {"error": "Serviço não cadastrado nesta escala."})
                        return
                    occupied = sum(1 for assignment_key, assigned_service in assignments.items() if assignment_key.endswith(f"|{cell_date}") and assigned_service == service and assignment_key != key)
                    if occupied >= service_config[service]:
                        self._json(400, {"error": f"As {service_config[service]} vaga(s) de {service} para este dia já foram preenchidas."})
                        return
                    assignments[key] = service
                else:
                    assignments.pop(key, None)
                db.execute("UPDATE duty_scales SET assignments_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(assignments, ensure_ascii=False), scale_id))
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/service-scales/") and path.endswith("/date-type"):
            if not self._require_admin():
                return
            try:
                scale_id = int(path.split("/")[-2])
            except (TypeError, ValueError):
                self._json(400, {"error": "Identificador de escala inválido."})
                return
            body = self._body()
            try:
                cell_date = date.fromisoformat(body.get("date", "")).isoformat()
            except (TypeError, ValueError):
                self._json(400, {"error": "Data inválida."})
                return
            with connect_db() as db:
                row = db.execute("SELECT mode,red_dates_json FROM duty_scales WHERE id=?", (scale_id,)).fetchone()
                if not row:
                    self._json(404, {"error": "Escala não encontrada."})
                    return
                if row["mode"] == "corrida":
                    self._json(400, {"error": "A escala corrida não separa dias por cor."})
                    return
                red_dates = set(json.loads(row["red_dates_json"]))
                if body.get("is_red"):
                    red_dates.add(cell_date)
                else:
                    red_dates.discard(cell_date)
                db.execute("UPDATE duty_scales SET red_dates_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(sorted(red_dates)), scale_id))
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/vacation-plan/") and path.endswith("/task-added"):
            if not self._require_admin():
                return
            try:
                vacation_id = int(path.split("/")[-2])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                cur = db.execute("UPDATE vacation_plan SET task_added=1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (vacation_id,))
            if not cur.rowcount:
                self._json(404, {"error": "Período não encontrado."})
                return
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/"):
            self._json(404, {"error": "Rota não encontrada."})
            return
        self._json(405, {"error": "Método não permitido."})

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/users/"):
            if not self._require_admin():
                return
            try:
                user_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_app_user(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                target = db.execute("SELECT role FROM app_users WHERE id=?", (user_id,)).fetchone()
                admins = db.execute("SELECT COUNT(*) FROM app_users WHERE role='admin'").fetchone()[0]
                if not target:
                    self._json(404, {"error": "Usuário não encontrado."})
                    return
                if target["role"] == "admin" and record["role"] != "admin" and admins <= 1:
                    self._json(400, {"error": "O sistema precisa manter ao menos um administrador."})
                    return
                try:
                    if record["password"]:
                        db.execute("UPDATE app_users SET display_name=?,login=?,password_hash=?,role=?,functions_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (record["display_name"], record["login"], _password_hash(record["password"]), record["role"], json.dumps(record["functions"], ensure_ascii=False), user_id))
                    else:
                        db.execute("UPDATE app_users SET display_name=?,login=?,role=?,functions_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (record["display_name"], record["login"], record["role"], json.dumps(record["functions"], ensure_ascii=False), user_id))
                except sqlite3.IntegrityError:
                    self._json(400, {"error": "Já existe um usuário ou login com esses dados."})
                    return
                row = db.execute("SELECT id,display_name,login,role,functions_json,created_at,updated_at FROM app_users WHERE id=?", (user_id,)).fetchone()
            self._json(200, {"user": self._user_record(row)})
            return
        if path.startswith("/api/personnel/"):
            if not self._require_admin():
                return
            try:
                person_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_person(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("UPDATE personnel SET name=?, rank=?, function=?, section=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (record["name"], record["rank"], record["function"], record["section"], record["status"], person_id))
                row = db.execute("SELECT id, name, rank, function, section, status, created_at, updated_at FROM personnel WHERE id=?", (person_id,)).fetchone()
            if not cur.rowcount or row is None:
                self._json(404, {"error": "Cadastro não encontrado."})
                return
            self._json(200, {"person": dict(row)})
            return
        if path.startswith("/api/unit-personnel/"):
            if not self._require_admin():
                return
            try:
                person_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_unit_person(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("""
                    UPDATE unit_personnel SET full_name=?, war_name=?, birth_date=?, rank=?, qm=?, section=?, address=?, cpf=?, military_id=?, additional_data=?, updated_at=CURRENT_TIMESTAMP
                    WHERE id=?
                """, (*record.values(), person_id))
                row = db.execute("SELECT * FROM unit_personnel WHERE id=?", (person_id,)).fetchone()
            if not cur.rowcount or row is None:
                self._json(404, {"error": "Cadastro não encontrado."})
                return
            self._json(200, {"person": self._unit_record(row)})
            return
        if path.startswith("/api/documents/"):
            if not self._require_document_editor():
                return
            try:
                document_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_document(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("UPDATE documents SET kind=?, bulletin_number=?, document_date=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (record["kind"], record["bulletin_number"], record["document_date"], json.dumps(record["data"], ensure_ascii=False), document_id))
                row = db.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
            if not cur.rowcount or row is None:
                self._json(404, {"error": "Documento não encontrado."})
                return
            self._json(200, {"document": self._document_record(row)})
            return
        if path.startswith("/api/force-maps/"):
            if not self._require_document_editor():
                return
            try:
                map_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_force_map(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                cur = db.execute("UPDATE force_maps SET activity_date=?,data_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (record["activity_date"], json.dumps(record["data"], ensure_ascii=False), map_id))
                row = db.execute("SELECT * FROM force_maps WHERE id=?", (map_id,)).fetchone()
            if not cur.rowcount or not row:
                self._json(404, {"error": "Mapa da Força não encontrado."})
                return
            self._json(200, {"map": self._force_map_record(row)})
            return
        if path.startswith("/api/vacation-plan/"):
            updated_by = self._require_admin()
            if not updated_by:
                return
            try:
                vacation_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_vacation(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                exists = db.execute("SELECT id FROM vacation_plan WHERE id=?", (vacation_id,)).fetchone()
                person = db.execute("SELECT id FROM unit_personnel WHERE id=?", (record["person_id"],)).fetchone()
                if not exists or not person:
                    self._json(404, {"error": "Período ou ficha do efetivo não encontrado."})
                    return
                db.execute("UPDATE vacation_plan SET person_id=?,start_date=?,end_date=?,travel_days=?,vacation_days=?,presentation_date=?,period_number=?,period_total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (*record.values(), vacation_id))
                row = db.execute("SELECT v.*, p.full_name, p.rank FROM vacation_plan v JOIN unit_personnel p ON p.id=v.person_id WHERE v.id=?", (vacation_id,)).fetchone()
                self._sync_vacation_notices(db, row, updated_by)
            self._json(200, {"period": dict(row)})
            return
        if path.startswith("/api/service-scales/"):
            if not self._require_admin():
                return
            try:
                scale_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            record, error = self._validate_scale(self._body())
            if error:
                self._json(400, {"error": error})
                return
            with connect_db() as db:
                ids = {r[0] for r in db.execute("SELECT id FROM unit_personnel WHERE id IN (%s)" % ",".join("?" for _ in record["participants"]), record["participants"]).fetchall()} if record["participants"] else set()
                if ids != set(record["participants"]):
                    self._json(400, {"error": "Selecione somente pessoas existentes no efetivo."})
                    return
                existing = db.execute("SELECT assignments_json FROM duty_scales WHERE id=?", (scale_id,)).fetchone()
                valid_services = {item["name"] for item in record["services"]}
                valid_people = set(record["participants"])
                assignments = json.loads(existing["assignments_json"]) if existing else {}
                assignments = {key: value for key, value in assignments.items() if int(key.split("|", 1)[0]) in valid_people and value in valid_services}
                cur = db.execute("UPDATE duty_scales SET name=?,mode=?,services_json=?,participants_json=?,assignments_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (record["name"], record["mode"], json.dumps(record["services"], ensure_ascii=False), json.dumps(record["participants"]), json.dumps(assignments, ensure_ascii=False), scale_id))
                row = db.execute("SELECT * FROM duty_scales WHERE id=?", (scale_id,)).fetchone()
                roster = {r["id"]: dict(r) for r in db.execute("SELECT id, full_name, war_name, rank FROM unit_personnel").fetchall()}
            if not cur.rowcount or not row:
                self._json(404, {"error": "Escala não encontrada."})
                return
            self._json(200, {"scale": self._scale_record(row, roster)})
            return
        self._json(404, {"error": "Rota não encontrada."})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/force-maps/"):
            if not self._require_document_editor():
                return
            try:
                map_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                cur = db.execute("DELETE FROM force_maps WHERE id=?", (map_id,))
            if not cur.rowcount:
                self._json(404, {"error": "Mapa da Força não encontrado."})
                return
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/documents/"):
            if not self._require_document_editor():
                return
            try:
                item_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                cur = db.execute("DELETE FROM documents WHERE id=?", (item_id,))
            if not cur.rowcount:
                self._json(404, {"error": "Documento não encontrado."})
                return
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/service-scales/"):
            if not self._require_admin():
                return
            try:
                item_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                cur = db.execute("DELETE FROM duty_scales WHERE id=?", (item_id,))
            if not cur.rowcount:
                self._json(404, {"error": "Escala não encontrada."})
                return
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/vacation-plan/"):
            if not self._require_admin():
                return
            try:
                item_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                db.execute("DELETE FROM notices WHERE category='ferias' AND source_type='vacation' AND source_id=?", (item_id,))
                cur = db.execute("DELETE FROM vacation_plan WHERE id=?", (item_id,))
            if not cur.rowcount:
                self._json(404, {"error": "Período de férias não encontrado."})
                return
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/unit-personnel/"):
            if not self._require_admin():
                return
            try:
                person_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                person = db.execute("SELECT id FROM unit_personnel WHERE id=?", (person_id,)).fetchone()
                if not person:
                    self._json(404, {"error": "Cadastro do efetivo não encontrado."})
                    return
                db.execute("DELETE FROM notices WHERE category='ferias' AND source_type='vacation' AND source_id IN (SELECT id FROM vacation_plan WHERE person_id=?)", (person_id,))
                removed_periods = db.execute("DELETE FROM vacation_plan WHERE person_id=?", (person_id,)).rowcount
                updated_scales = 0
                for scale in db.execute("SELECT id,participants_json,assignments_json FROM duty_scales").fetchall():
                    participants = [int(value) for value in json.loads(scale["participants_json"] or "[]") if int(value) != person_id]
                    assignments = json.loads(scale["assignments_json"] or "{}")
                    assignments = {key: value for key, value in assignments.items() if int(key.split("|", 1)[0]) != person_id}
                    if len(participants) != len(json.loads(scale["participants_json"] or "[]")):
                        db.execute("UPDATE duty_scales SET participants_json=?,assignments_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(participants), json.dumps(assignments, ensure_ascii=False), scale["id"]))
                        updated_scales += 1
                db.execute("DELETE FROM unit_personnel WHERE id=?", (person_id,))
            self._json(200, {"ok": True, "removedVacationPeriods": removed_periods, "updatedScales": updated_scales})
            return
        if path.startswith("/api/personnel/"):
            if not self._require_admin():
                return
            try:
                item_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            with connect_db() as db:
                cur = db.execute("DELETE FROM personnel WHERE id=?", (item_id,))
            if not cur.rowcount:
                self._json(404, {"error": "Cadastro não encontrado."})
                return
            self._json(200, {"ok": True})
            return
        if path.startswith("/api/users/"):
            if not self._require_admin():
                return
            try:
                item_id = int(path.rsplit("/", 1)[1])
            except ValueError:
                self._json(400, {"error": "Identificador inválido."})
                return
            current = self._current_user_record()
            with connect_db() as db:
                target = db.execute("SELECT role FROM app_users WHERE id=?", (item_id,)).fetchone()
                if not target:
                    self._json(404, {"error": "Usuário não encontrado."})
                    return
                if current and current["id"] == item_id:
                    self._json(400, {"error": "Não é possível excluir o usuário que está conectado."})
                    return
                admins = db.execute("SELECT COUNT(*) FROM app_users WHERE role='admin'").fetchone()[0]
                if target["role"] == "admin" and admins <= 1:
                    self._json(400, {"error": "O sistema precisa manter ao menos um administrador."})
                    return
                db.execute("DELETE FROM app_users WHERE id=?", (item_id,))
            self._json(200, {"ok": True})
            return
        self._json(404, {"error": "Rota não encontrada."})

    @staticmethod
    def _validate_category(value: object) -> tuple[str | None, str | None]:
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > 40:
            return None, "Informe uma função/classificação de até 40 caracteres."
        return value.strip(), None

    @staticmethod
    def _validate_app_user(data: dict) -> tuple[dict, str | None]:
        display_name = data.get("display_name")
        login = data.get("login")
        password = data.get("password", "")
        role = data.get("role")
        functions = data.get("functions", [])
        if not isinstance(display_name, str) or not display_name.strip() or len(display_name.strip()) > 80:
            return {}, "Informe o nome do usuário (até 80 caracteres)."
        if not isinstance(login, str) or not login.strip() or len(login.strip()) < 4 or len(login.strip()) > 40 or any(char.isspace() for char in login.strip()):
            return {}, "Informe um login de 4 a 40 caracteres, sem espaços."
        if not isinstance(password, str) or (password and not 4 <= len(password) <= 128):
            return {}, "A senha deve ter de 4 a 128 caracteres."
        if role not in ("viewer", "editor", "admin"):
            return {}, "Selecione um nível de permissão válido."
        if not isinstance(functions, list) or any(not isinstance(item, str) for item in functions):
            return {}, "Selecione funções/classificações válidas."
        functions = list(dict.fromkeys(item.strip() for item in functions if item.strip()))
        with connect_db() as db:
            categories = {row[0] for row in db.execute("SELECT name FROM task_categories").fetchall()}
        if not set(functions).issubset(categories):
            return {}, "Uma das funções selecionadas não existe mais. Atualize a página."
        return {"display_name": display_name.strip(), "login": login.strip(), "password": password, "role": role, "functions": functions}, None

    @staticmethod
    def _validate_scale(data: dict) -> tuple[dict, str | None]:
        name = data.get("name")
        mode = data.get("mode")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
            return {}, "Informe um nome para a escala (até 80 caracteres)."
        if mode not in ("corrida", "preta_vermelha", "completa"):
            return {}, "Selecione uma divisão de escala válida."
        services = data.get("services")
        if not isinstance(services, list) or not services or len(services) > 12:
            return {}, "Cadastre de 1 a 12 tipos de serviço."
        cleaned_services = []
        names = set()
        for item in services:
            if not isinstance(item, dict):
                return {}, "Os serviços informados são inválidos."
            service_name = item.get("name")
            try:
                slots = int(item.get("daily_slots"))
            except (TypeError, ValueError):
                return {}, "Informe a quantidade diária de cada serviço."
            if not isinstance(service_name, str) or not service_name.strip() or len(service_name.strip()) > 40 or slots < 1 or slots > 100:
                return {}, "Cada serviço precisa de nome e quantidade diária válida (1 a 100)."
            service_name = service_name.strip()
            if service_name.casefold() in names:
                return {}, "Os nomes dos serviços devem ser únicos dentro da escala."
            names.add(service_name.casefold())
            cleaned_services.append({"name": service_name, "daily_slots": slots})
        participants = data.get("participants")
        if not isinstance(participants, list) or not participants:
            return {}, "Selecione ao menos um militar para concorrer à escala."
        try:
            participants = list(dict.fromkeys(int(pid) for pid in participants))
        except (TypeError, ValueError):
            return {}, "A lista de participantes é inválida."
        return {"name": name.strip(), "mode": mode, "services": cleaned_services, "participants": participants}, None

    @staticmethod
    def _scale_record(row: sqlite3.Row, roster: dict) -> dict:
        result = dict(row)
        result["services"] = json.loads(result.pop("services_json"))
        participant_ids = json.loads(result.pop("participants_json"))
        result["participants"] = [roster[pid] for pid in participant_ids if pid in roster]
        result["assignments"] = json.loads(result.pop("assignments_json"))
        result["red_dates"] = json.loads(result.pop("red_dates_json"))
        return result

    @staticmethod
    def _validate_vacation(data: dict) -> tuple[dict, str | None]:
        try:
            person_id = int(data.get("person_id"))
            start = date.fromisoformat(data.get("start_date", ""))
            end = date.fromisoformat(data.get("end_date", ""))
            period_number = int(data.get("period_number"))
            period_total = int(data.get("period_total"))
        except (TypeError, ValueError):
            return {}, "Preencha pessoa, período e datas válidas."
        if end < start:
            return {}, "A data de término deve ser igual ou posterior ao início."
        if period_total not in (1, 2, 3) or period_number < 1 or period_number > period_total:
            return {}, "Selecione um período válido (até 3 parcelas)."
        travel_days = data.get("travel_days")
        if travel_days not in (True, False, 0, 1):
            return {}, "Informe se há dias adicionais de deslocamento."
        days = (end - start).days + 1
        presentation = end.toordinal() + (2 if bool(travel_days) else 0) + 1
        return {"person_id": person_id, "start_date": start.isoformat(), "end_date": end.isoformat(), "travel_days": int(bool(travel_days)), "vacation_days": days, "presentation_date": date.fromordinal(presentation).isoformat(), "period_number": period_number, "period_total": period_total}, None

    @staticmethod
    def _validate_person(data: dict) -> tuple[dict, str | None]:
        fields = {
            "name": ("Nome", 80),
            "rank": ("Posto/graduação", 30),
            "function": ("Função", 100),
            "section": ("Seção", 100),
        }
        cleaned = {}
        for key, (label, max_length) in fields.items():
            value = data.get(key)
            if not isinstance(value, str) or not value.strip():
                return {}, f"Preencha o campo {label.lower()}."
            value = value.strip()
            if len(value) > max_length:
                return {}, f"O campo {label.lower()} excede o limite de {max_length} caracteres."
            cleaned[key] = value
        status = data.get("status", "Ativo")
        if status not in ("Ativo", "Inativo"):
            return {}, "Selecione uma situação válida."
        cleaned["status"] = status
        return cleaned, None

    @staticmethod
    def _validate_unit_person(data: dict) -> tuple[dict, str | None]:
        limits = {
            "full_name": ("Nome completo", 120),
            "war_name": ("Nome de guerra", 80),
            "rank": ("Posto/graduação", 40),
            "qm": ("QM", 40),
            "section": ("Seção", 100),
            "address": ("Endereço", 240),
            "cpf": ("CPF", 20),
            "military_id": ("Identidade militar", 40),
            "additional_data": ("Dados adicionais", 1000),
        }
        cleaned = {}
        for key, (label, max_length) in limits.items():
            value = data.get(key, "")
            if not isinstance(value, str):
                return {}, f"O campo {label.lower()} é inválido."
            value = value.strip()
            if key != "additional_data" and not value:
                return {}, f"Preencha o campo {label.lower()}."
            if len(value) > max_length:
                return {}, f"O campo {label.lower()} excede o limite de {max_length} caracteres."
            cleaned[key] = value
        if cleaned["rank"] not in UNIT_RANKS:
            return {}, "Selecione um posto/graduação da lista de antiguidade."
        birth_date = data.get("birth_date")
        try:
            parsed_date = date.fromisoformat(birth_date) if isinstance(birth_date, str) else None
        except ValueError:
            parsed_date = None
        if parsed_date is None or parsed_date > date.today():
            return {}, "Informe uma data de nascimento válida, que não seja futura."
        cleaned["birth_date"] = parsed_date.isoformat()
        if cleaned["cpf"] != "000.000.000-00" and not (len(cleaned["cpf"]) in (11, 14)):
            return {}, "Informe um CPF válido no formato 000.000.000-00."
        ordered = {
            "full_name": cleaned["full_name"],
            "war_name": cleaned["war_name"],
            "birth_date": cleaned["birth_date"],
            "rank": cleaned["rank"],
            "qm": cleaned["qm"],
            "section": cleaned["section"],
            "address": cleaned["address"],
            "cpf": cleaned["cpf"],
            "military_id": cleaned["military_id"],
            "additional_data": cleaned["additional_data"],
        }
        return ordered, None

    @staticmethod
    def _unit_record(row: sqlite3.Row) -> dict:
        result = dict(row)
        born = date.fromisoformat(result["birth_date"])
        now = date.today()
        result["age"] = now.year - born.year - ((now.month, now.day) < (born.month, born.day))
        return result

    @staticmethod
    def _validate_force_map(data: dict) -> tuple[dict, str | None]:
        activity_date = data.get("activity_date")
        try:
            parsed_date = date.fromisoformat(activity_date) if isinstance(activity_date, str) else None
        except ValueError:
            parsed_date = None
        if parsed_date is None:
            return {}, "Informe uma data válida para o Mapa da Força."
        rows = data.get("rows")
        if not isinstance(rows, list) or not rows:
            return {}, "O efetivo da unidade está vazio; cadastre pessoas antes de criar o mapa."
        if len(rows) > 150:
            return {}, "O mapa suporta até 150 militares por registro."
        allowed_observations = {"", "Férias", "Serviço", "PO", "Rancho", "HT", "Missão", "Dispensa médica", "Outros"}
        cleaned = []
        seen = set()
        with connect_db() as db:
            roster = {row["id"]: row for row in db.execute("SELECT id,rank,war_name FROM unit_personnel").fetchall()}
        for item in rows:
            if not isinstance(item, dict):
                return {}, "Há uma linha inválida no Mapa da Força."
            try:
                person_id = int(item.get("person_id"))
            except (TypeError, ValueError):
                return {}, "Há uma pessoa inválida no Mapa da Força."
            if person_id in seen:
                return {}, "Uma pessoa foi incluída mais de uma vez no Mapa da Força."
            seen.add(person_id)
            person = roster.get(person_id)
            rank = str(person["rank"] if person else item.get("rank", "")).strip()[:40]
            war_name = str(person["war_name"] if person else item.get("war_name", "")).strip()[:80]
            observation = item.get("observation", "")
            if observation not in allowed_observations:
                return {}, "Selecione uma observação válida."
            other_text = str(item.get("other_text", "")).strip()[:80] if observation == "Outros" else ""
            cleaned.append({"person_id": person_id, "rank": rank, "war_name": war_name, "observation": observation, "other_text": other_text})
        return {"activity_date": parsed_date.isoformat(), "data": {"activity_date": parsed_date.isoformat(), "rows": cleaned}}, None

    @staticmethod
    def _force_map_record(row: sqlite3.Row) -> dict:
        record = dict(row)
        record["data"] = json.loads(record.pop("data_json"))
        return record

    @staticmethod
    def _validate_document(data: dict) -> tuple[dict, str | None]:
        kind = data.get("kind")
        if kind not in ("aditamento", "pernoite", "fatd"):
            return {}, "Tipo documental inválido."
        number = data.get("bulletin_number")
        if not isinstance(number, str) or not number.strip() or len(number.strip()) > 30:
            return {}, "Informe o número do boletim (até 30 caracteres)."
        document_date = data.get("document_date")
        try:
            parsed_date = date.fromisoformat(document_date) if isinstance(document_date, str) else None
        except ValueError:
            parsed_date = None
        if parsed_date is None:
            return {}, "Informe uma data válida."
        content = data.get("data")
        if not isinstance(content, dict):
            return {}, "Os dados do documento estão inválidos."
        encoded = json.dumps(content, ensure_ascii=False)
        if len(encoded) > 50_000:
            return {}, "O documento excede o limite de conteúdo."
        return {"kind": kind, "bulletin_number": number.strip(), "document_date": parsed_date.isoformat(), "data": content}, None

    @staticmethod
    def _document_record(row: sqlite3.Row) -> dict:
        record = dict(row)
        record["data"] = json.loads(record.pop("data_json"))
        return record

    def _notice_payload(self, row: sqlite3.Row, current_user: sqlite3.Row) -> dict:
        notice = dict(row)
        with connect_db() as db:
            recipients = db.execute(
                """SELECT u.id, u.display_name, nr.acknowledged_at
                   FROM notice_recipients nr JOIN app_users u ON u.id=nr.user_id
                   WHERE nr.notice_id=? ORDER BY u.display_name COLLATE NOCASE""",
                (notice["id"],),
            ).fetchall()
        notice["recipients"] = [dict(item) for item in recipients]
        notice["is_recipient"] = bool(notice.pop("is_recipient"))
        notice["acknowledged"] = bool(notice.pop("acknowledged_at"))
        notice["all_acknowledged"] = bool(recipients) and all(item["acknowledged_at"] for item in recipients)
        notice["recipient_count"] = len(recipients)
        notice["acknowledged_count"] = sum(bool(item["acknowledged_at"]) for item in recipients)
        notice["can_manage"] = current_user["role"] == "admin" or (
            current_user["role"] == "editor" and notice["created_by"].casefold() == current_user["display_name"].casefold()
        )
        return notice

    @staticmethod
    def _sync_vacation_notices(db: sqlite3.Connection, period: sqlite3.Row, created_by: str) -> None:
        db.execute("DELETE FROM notices WHERE category='ferias' AND source_type='vacation' AND source_id=?", (period["id"],))
        rank_name = f"{period['rank']} {period['full_name']}".strip()
        start = date.fromisoformat(period["start_date"]).strftime("%d/%m/%Y")
        end = date.fromisoformat(period["end_date"]).strftime("%d/%m/%Y")
        presentation = date.fromisoformat(period["presentation_date"]).strftime("%d/%m/%Y")
        travel = "Os dois dias de deslocamento foram considerados." if period["travel_days"] else "Não há dias adicionais de deslocamento."
        records = [
            (f"Início das férias · {rank_name}", f"Início do período {period['period_number']}/{period['period_total']} de férias de {rank_name}. Período: {start} a {end}.", period["start_date"]),
            (f"Apresentação de férias · {rank_name}", f"Apresentação prevista de {rank_name} em {presentation}, após o período {period['period_number']}/{period['period_total']} (término em {end}). {travel}", period["presentation_date"]),
        ]
        recipients = []
        for user_row in db.execute("SELECT id, functions_json FROM app_users").fetchall():
            try:
                functions = json.loads(user_row["functions_json"])
            except (TypeError, json.JSONDecodeError):
                functions = []
            if any(_normalize_function(str(function)) == "ferias" for function in functions):
                recipients.append(user_row["id"])
        for title, subject, notice_date in records:
            cur = db.execute(
                "INSERT INTO notices (title,subject,notice_date,created_by,category,source_type,source_id) VALUES (?,?,?,?, 'ferias','vacation',?)",
                (title, subject, notice_date, created_by, period["id"]),
            )
            db.executemany("INSERT INTO notice_recipients (notice_id,user_id) VALUES (?,?)", [(cur.lastrowid, uid) for uid in recipients])


if __name__ == "__main__":
    import os

    port = int(os.environ.get("SIGASE_PORT", "8000"))
    initialize_db()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), SigaseHandler)
    except OSError as error:
        if getattr(error, "winerror", None) == 10048 or getattr(error, "errno", None) in (48, 98, 10048):
            print(f"A porta {port} já está em uso. Feche a outra janela do SIGASE ou inicie com SIGASE_PORT=8001.")
        else:
            print(f"Não foi possível iniciar o SIGASE em 127.0.0.1:{port}: {error}")
        raise SystemExit(1)
    print(f"SIGASE disponível em http://127.0.0.1:{port} (somente neste computador)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
