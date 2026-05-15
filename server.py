from __future__ import annotations

import json
import os
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
NOTES_DIR = ROOT / "notes"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class DiaryHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        relative = parsed.path.lstrip("/") or "index.html"
        return str((ROOT / relative).resolve())

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/notes/([^/]+)", parsed.path)
        if not match:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")
            return

        date_str = match.group(1)
        if not DATE_RE.fullmatch(date_str):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid date")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        note = self.rfile.read(content_length).decode("utf-8")

        NOTES_DIR.mkdir(exist_ok=True)
        (NOTES_DIR / f"{date_str}.txt").write_text(note, encoding="utf-8")

        payload = json.dumps({"ok": True, "path": f"notes/{date_str}.txt"}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/notes":
            payload = json.dumps(self.list_notes()).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        super().do_GET()

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/notes/([^/]+)", parsed.path)
        if not match:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")
            return

        date_str = match.group(1)
        if not DATE_RE.fullmatch(date_str):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid date")
            return

        note_path = NOTES_DIR / f"{date_str}.txt"
        if note_path.exists():
            note_path.unlink()

        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def list_notes(self) -> dict[str, str]:
        NOTES_DIR.mkdir(exist_ok=True)
        notes: dict[str, str] = {}
        for path in sorted(NOTES_DIR.glob("*.txt")):
            if not DATE_RE.fullmatch(path.stem):
                continue
            notes[path.stem] = path.read_text(encoding="utf-8")
        return notes


def main() -> None:
    port = int(os.environ.get("DIARY_PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), DiaryHandler)
    print(f"Serving diary at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
