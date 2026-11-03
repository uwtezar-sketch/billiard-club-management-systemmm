#!/usr/bin/env python3
"""Daily local backup runner. Configuration and keys stay outside the Git repository."""

import argparse
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
import fcntl
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import backup_database as backup

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / ".backup-config" / "source.json"
KEYS = ROOT / ".backup-keys"
TOOLS = ROOT / ".backup-tools"
OUTPUT = ROOT / "backups"
STATUS = OUTPUT / "status.json"
TEHRAN = ZoneInfo("Asia/Tehran")


def prepare():
    os.umask(0o077)
    for folder in (CONFIG.parent, KEYS, OUTPUT):
        if not folder.exists():
            folder.mkdir(mode=0o700, parents=True)
    for name in ("age", "age-keygen"):
        path = TOOLS / name
        if path.exists():
            os.environ[name.upper().replace("-", "_") + "_BIN"] = str(path)
    # launchd has a minimal PATH. Keep tool locations explicit and stable.
    os.environ["PATH"] = "/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.chmod(0o600)
    os.replace(temporary, path)


def setup():
    if not sys.stdin.isatty():
        raise backup.BackupError("Setup requires the local interactive terminal; never send credentials in chat.")
    print("تنظیم بک‌آپ محلی باشگاه ارم؛ آدرس اتصال در خروجی نمایش داده نمی‌شود.")
    print("اتصال مستقیم شاخه Production را از Neon وارد کنید (Connection pooling خاموش باشد).")
    source = getpass.getpass("آدرس اتصال دیتابیس، با ورودی مخفی: ").strip()
    os.environ["BACKUP_DATABASE_URL"] = source
    backup.connection("BACKUP_DATABASE_URL")
    major = backup.server_major(source)
    if major > 18:
        raise backup.BackupError("Install PostgreSQL client tools matching the source server before setup.")
    identity = KEYS / "eram-recovery.agekey"
    if not identity.exists():
        backup.run("Recovery-key generation", [os.environ.get("AGE_KEYGEN_BIN", "age-keygen"), "-o", str(identity)])
        identity.chmod(0o600)
    public = backup.run("Public-key extraction", [os.environ.get("AGE_KEYGEN_BIN", "age-keygen"), "-y", str(identity)]).strip()
    (KEYS / "recipient.txt").write_text(public + "\n")
    atomic_json(CONFIG, {"database_url": source})
    print("اتصال امن محلی تنظیم شد. رمز در سورس، گزارش یا GitHub قرار نگرفت.")
    print("کلید بازیابی:", identity)
    print("اکنون فرمان run --force را برای اولین بک‌آپ واقعی اجرا کنید.")


def valid_manifests():
    records = []
    for path in OUTPUT.glob("*/*.json"):
        try:
            metadata = json.loads(path.read_text())
            encrypted = path.parent / metadata["file"]
            if metadata.get("format") != backup.FORMAT or metadata.get("restore_verified") is not True:
                continue
            if encrypted.name != metadata["file"] or not encrypted.is_file():
                continue
            created = datetime.fromisoformat(metadata["created_at_utc"])
            if created.tzinfo is None:
                continue
            records.append((created, path, metadata))
        except (OSError, ValueError, KeyError, TypeError):
            continue
    # Check the newest candidate first; do not reread years of archives every hour.
    for record in sorted(records, key=lambda record: record[0], reverse=True):
        try:
            if backup.checksum(record[1].parent / record[2]["file"]) == record[2]["sha256"]:
                return [record]
        except OSError:
            continue
    return []


def cutoff(now):
    local = now.astimezone(TEHRAN)
    due = datetime.combine(local.date(), time(6), tzinfo=TEHRAN)
    return due if local >= due else due - timedelta(days=1)


@contextmanager
def verification_database():
    with tempfile.TemporaryDirectory(prefix="eram-local-verify-") as directory:
        base = Path(directory)
        password = secrets.token_urlsafe(32)
        password_file = base / "password"
        password_file.write_text(password + "\n")
        password_file.chmod(0o600)
        data = base / "data"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        pg_ctl = shutil.which("pg_ctl")
        if not pg_ctl or not shutil.which("initdb"):
            raise backup.BackupError("Local PostgreSQL 18 verification tools are missing.")
        backup.run("Verification-cluster initialization", ["initdb", "-D", str(data), "-U", "backup_verify",
            "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--pwfile", str(password_file),
            "--no-locale", "--encoding=UTF8"])
        try:
            backup.run("Verification-cluster startup", [pg_ctl, "-D", str(data), "-l", str(base / "server.log"),
                "-o", f"-h 127.0.0.1 -p {port} -k {base}", "-w", "start"])
            yield f"postgresql://backup_verify:{password}@127.0.0.1:{port}/postgres"
        finally:
            if (data / "postmaster.pid").exists():
                backup.run("Verification-cluster shutdown", [pg_ctl, "-D", str(data), "-m", "fast", "-w", "stop"])


def run(force=False):
    with (OUTPUT / ".runner.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({"result": "already_running"}))
            return
        now = datetime.now(timezone.utc)
        records = valid_manifests()
        if not force and records and records[-1][0] >= cutoff(now):
            print(json.dumps({"result": "daily_backup_already_verified", "last_success": records[-1][0].isoformat()}))
            return
        if not CONFIG.is_file():
            raise backup.BackupError("Local database connection is not configured. Run local_backup.py setup in the local terminal.")
        configuration = json.loads(CONFIG.read_text())
        os.environ["BACKUP_DATABASE_URL"] = configuration["database_url"]
        backup.connection("BACKUP_DATABASE_URL")
        if not (KEYS / "recipient.txt").is_file() or not (KEYS / "eram-recovery.agekey").is_file():
            raise backup.BackupError("Local recovery key is missing; do not replace it if older backups need it.")
        if shutil.disk_usage(OUTPUT).free < 500 * 1024 * 1024:
            raise backup.BackupError("At least 500 MB of free disk space is needed before taking another backup.")
        with verification_database() as verify:
            os.environ["BACKUP_VERIFY_DATABASE_URL"] = verify
            backup.create(SimpleNamespace(recipient_file=str(KEYS / "recipient.txt"),
                output_dir=str(OUTPUT / now.astimezone(TEHRAN).strftime("%Y-%m-%d"))))
        records = valid_manifests()
        latest = records[-1]
        atomic_json(STATUS, {"state": "ok", "last_success": latest[0].isoformat(),
            "manifest": str(latest[1].relative_to(ROOT)), "encrypted_bytes": latest[2]["encrypted_bytes"],
            "verified_table_count": latest[2]["verified_table_count"]})


def status():
    records = valid_manifests()
    if not records:
        print(json.dumps({"state": "no_verified_backup", "configured": CONFIG.is_file()}))
        return 2
    latest = records[-1]
    now = datetime.now(timezone.utc)
    age_hours = (now - latest[0]).total_seconds() / 3600
    print(json.dumps({"state": "ok" if age_hours <= 27 else "stale", "age_hours": round(age_hours, 2),
        "last_success": latest[0].isoformat(), "manifest": str(latest[1].relative_to(ROOT)),
        "encrypted_bytes": latest[2]["encrypted_bytes"], "verified_table_count": latest[2]["verified_table_count"]}))
    return 0 if age_hours <= 27 else 2


def restore_interactive():
    if not sys.stdin.isatty():
        raise backup.BackupError("Restore requires the owner's interactive local terminal.")
    records = valid_manifests()
    if not records:
        raise backup.BackupError("No verified local backup is available.")
    created, manifest_path, metadata = records[-1]
    print("نسخه انتخاب‌شده:", created.astimezone(TEHRAN).strftime("%Y-%m-%d %H:%M"))
    print("فقط به دیتابیس کاملاً تازه و خالی منتقل می‌شود. هیچ داده‌ای پاک نمی‌شود.")
    target = getpass.getpass("اتصال مستقیم دیتابیس تازه، با ورودی مخفی: ").strip()
    os.environ["RESTORE_DATABASE_URL"] = target
    backup.connection("RESTORE_DATABASE_URL")
    if input("برای شروع بازیابی در مقصد تازه، عبارت «بازیابی» را وارد کنید: ").strip() != "بازیابی":
        print("بازیابی انجام نشد.")
        return
    backup.restore(SimpleNamespace(backup=str(manifest_path.parent / metadata["file"]),
        manifest=str(manifest_path), identity=str(KEYS / "eram-recovery.agekey"), confirm_empty_target=True))
    print("بازیابی تأیید شد؛ اکنون اتصال اپ در Vercel باید توسط مالک به مقصد تازه تغییر کند.")


def main():
    prepare()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["setup", "run", "status", "restore"])
    parser.add_argument("--force", action="store_true")
    arguments = parser.parse_args()
    try:
        if arguments.operation == "setup":
            setup()
        elif arguments.operation == "run":
            run(arguments.force)
        elif arguments.operation == "restore":
            restore_interactive()
        else:
            return status()
    except backup.BackupError as error:
        if arguments.operation == "run":
            atomic_json(STATUS, {"state": "failed", "at": datetime.now(timezone.utc).isoformat(), "reason": str(error)})
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        print("Local backup failed; sensitive diagnostic details were withheld.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
