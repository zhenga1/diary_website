from __future__ import annotations

import json
import os
import re
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
NOTES_DIR = ROOT / "notes"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AUDIO_EXTS = ("mp3", "m4a", "wav", "ogg", "webm")
TRANSCRIBE_MODEL = os.environ.get("DIARY_TRANSCRIBE_MODEL", "distil-small.en")
TRANSCRIBE_LANGUAGE = os.environ.get("DIARY_TRANSCRIBE_LANGUAGE", "en").strip() or None
TRANSCRIBE_DEVICE = os.environ.get("DIARY_TRANSCRIBE_DEVICE", "auto")
TRANSCRIBE_COMPUTE_TYPE = os.environ.get("DIARY_TRANSCRIBE_COMPUTE_TYPE", "int8")

_transcriber = None
_transcriber_lock = threading.Lock()


def find_audio_path(date_str: str) -> Path | None:
    for ext in AUDIO_EXTS:
        candidate = AUDIO_DIR / f"{date_str}.{ext}"
        if candidate.exists():
            return candidate
    return None


def get_transcriber():
    global _transcriber
    if _transcriber is not None:
        return _transcriber

    with _transcriber_lock:
        if _transcriber is not None:
            return _transcriber

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed. Run `python -m pip install --user faster-whisper` first."
            ) from exc

        _transcriber = WhisperModel(
            TRANSCRIBE_MODEL,
            device=TRANSCRIBE_DEVICE,
            compute_type=TRANSCRIBE_COMPUTE_TYPE,
        )
        return _transcriber


def transcribe_audio(date_str: str) -> dict[str, str]:
    audio_path = find_audio_path(date_str)
    if audio_path is None:
        raise FileNotFoundError(f"No audio file found for {date_str}")

    model = get_transcriber()
    segments, info = model.transcribe(
        str(audio_path),
        language=TRANSCRIBE_LANGUAGE,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    transcript = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()

    return {
        "date": date_str,
        "audio_path": str(audio_path.relative_to(ROOT)).replace("\\", "/"),
        "transcript": transcript,
        "model": TRANSCRIBE_MODEL,
        "language": getattr(info, "language", TRANSCRIBE_LANGUAGE) or "",
    }


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

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/transcriptions/([^/]+)", parsed.path)
        if not match:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")
            return

        date_str = match.group(1)
        if not DATE_RE.fullmatch(date_str):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid date")
            return

        try:
            payload = transcribe_audio(date_str)
        except FileNotFoundError as exc:
            self.send_error(HTTPStatus.NOT_FOUND, str(exc))
            return
        except RuntimeError as exc:
            self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, str(exc))
            return
        except Exception as exc:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Transcription failed: {exc}")
            return

        body = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
