#!/usr/bin/env python3
"""Encrypted PostgreSQL backups; restore only into a different, empty database.

No source credentials, database rows, or native tool stderr are logged.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit, unquote
from zoneinfo import ZoneInfo

FORMAT = "eram-pgdump-age-v1"
REQUIRED_TABLES = {
    "users", "tables", "sessions", "cafe_menu", "invoices", "invoice_items",
    "session_cafe_orders", "debtors", "invoice_shares", "debts", "debtor_payments",
    "reservations", "settings", "activity_logs", "inventory_items", "inventory_logs",
    "customers", "customer_point_redemptions", "creditors", "creditor_transactions",
}


class BackupError(Exception):
    pass


def tool(name):
    return os.environ.get(name.upper() + "_BIN", name)


def run(label, arguments, *, extra_env=None):
    env = dict(os.environ, PGCONNECT_TIMEOUT="20")
    if extra_env:
        env.update(extra_env)
    try:
        result = subprocess.run(arguments, capture_output=True, env=env, timeout=660)
    except (OSError, subprocess.TimeoutExpired):
        raise BackupError(f"{label} could not complete; check the tool and connection.") from None
    if result.returncode:
        raise BackupError(f"{label} failed (exit {result.returncode}); sensitive diagnostics were withheld.")
    return result.stdout.decode("utf-8")


def connection(env_name):
    value = os.environ.get(env_name)
    if not value:
        raise BackupError(f"Required secure environment variable is missing: {env_name}")
    try:
        url = urlsplit(value)
        if url.scheme not in ("postgres", "postgresql") or not url.hostname or not url.path.strip("/"):
            raise ValueError()
        _ = url.port
        if url.hostname.endswith(".neon.tech") and "-pooler" in url.hostname:
            raise BackupError("Use a direct/unpooled Neon connection for backup and restore.")
    except BackupError:
        raise
    except ValueError:
        raise BackupError(f"Invalid connection configuration in {env_name}.") from None
    return value


def fingerprint(url):
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower().replace("-pooler.", ".")
    value = json.dumps([host, parsed.port or 5432, unquote(parsed.path.strip("/"))])
    return hashlib.sha256(value.encode()).hexdigest()


def query(url, statement):
    return run("Database validation", [tool("psql"), "--no-psqlrc", "--no-align", "--tuples-only",
               "--set=ON_ERROR_STOP=1", "--dbname", url, "--command", statement]).strip()


def server_major(url):
    return int(query(url, "SHOW server_version_num")) // 10000


def require_empty(url):
    objects = query(url, """
        SELECT count(*) FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp%'
          AND c.relkind IN ('r','p','v','m','f','S')
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
            WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    """)
    if objects != "0":
        raise BackupError("Destination is not empty. Nothing was erased or overwritten; use a NEW empty database.")


def validate_restored(url):
    names = set(query(url, """
        SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename
    """).splitlines())
    if not REQUIRED_TABLES.issubset(names):
        raise BackupError("Restore validation failed: required club tables are missing.")
    has_admin = query(url, "SELECT EXISTS(SELECT 1 FROM public.users WHERE role='admin' AND password_hash <> '')")
    if has_admin != "t":
        raise BackupError("Restore validation failed: an administrator login hash is missing.")
    return len(names)


def restore_plain(archive, url, source_fingerprint, source_major):
    if fingerprint(url) == source_fingerprint:
        raise BackupError("Refusing to restore into the original source database.")
    if server_major(url) < source_major:
        raise BackupError("Destination PostgreSQL is older than the source; use the same major version or newer.")
    require_empty(url)
    run("Database restore", [tool("pg_restore"), "--exit-on-error", "--single-transaction",
        "--no-owner", "--no-acl", "--dbname", url, str(archive)])
    return validate_restored(url)


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create(args):
    source = connection("BACKUP_DATABASE_URL")
    verify = connection("BACKUP_VERIFY_DATABASE_URL")
    if fingerprint(source) == fingerprint(verify):
        raise BackupError("Restore-verification database must be different from the source.")
    recipient = Path(args.recipient_file).read_text().strip()
    if not re.fullmatch(r"age1[0-9a-z]+", recipient):
        raise BackupError("A valid age public recipient key is required.")
    # Check the verification destination before starting a production read.
    require_empty(verify)
    major = server_major(source)
    now = datetime.now(timezone.utc)
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = now.strftime("%Y%m%dT%H%M%S%fZ")
    encrypted = output / f"eram-{stamp}.dump.age"
    manifest_path = output / f"eram-{stamp}.json"
    partial = output / f".eram-{stamp}.partial"
    try:
        with tempfile.TemporaryDirectory(prefix="eram-pgdump-") as directory:
            archive = Path(directory) / "database.dump"
            run("Database backup", [tool("pg_dump"), "--format=custom", "--no-owner", "--no-acl",
                "--lock-wait-timeout=10s", "--dbname", source, "--file", str(archive)],
                extra_env={"PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=600000"})
            if not archive.is_file() or not archive.stat().st_size:
                raise BackupError("Database backup is empty.")
            table_count = restore_plain(archive, verify, fingerprint(source), major)
            run("Backup encryption", [tool("age"), "--encrypt", "--recipient", recipient,
                "--output", str(partial), str(archive)])
            manifest = {
                "format": FORMAT, "created_at_utc": now.isoformat(),
                "created_at_tehran": now.astimezone(ZoneInfo("Asia/Tehran")).isoformat(),
                "file": encrypted.name, "sha256": checksum(partial),
                "encrypted_bytes": partial.stat().st_size, "postgresql_major": major,
                "source_fingerprint": fingerprint(source), "restore_verified": True,
                "verified_table_count": table_count,
                "source_commit": os.environ.get("GITHUB_SHA", "local"),
            }
            os.replace(partial, encrypted)
            temporary_manifest = manifest_path.with_suffix(".json.partial")
            temporary_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
            os.replace(temporary_manifest, manifest_path)
    finally:
        partial.unlink(missing_ok=True)
    print(json.dumps({"result": "backup_verified_and_encrypted", "file": encrypted.name,
                      "encrypted_bytes": manifest["encrypted_bytes"], "table_count": table_count}))


def restore(args):
    if not args.confirm_empty_target:
        raise BackupError("Explicit --confirm-empty-target is required; restore never cleans an existing database.")
    archive = Path(args.backup).resolve()
    manifest = json.loads(Path(args.manifest).read_text())
    if manifest.get("format") != FORMAT or manifest.get("restore_verified") is not True:
        raise BackupError("The backup manifest is unsupported or its restore verification is missing.")
    if manifest.get("file") != archive.name or checksum(archive) != manifest.get("sha256"):
        raise BackupError("Backup checksum or filename does not match; restore was not started.")
    target = connection("RESTORE_DATABASE_URL")
    if fingerprint(target) == manifest.get("source_fingerprint"):
        raise BackupError("Refusing to restore into the original source database.")
    require_empty(target)
    with tempfile.TemporaryDirectory(prefix="eram-restore-") as directory:
        plain = Path(directory) / "database.dump"
        run("Backup decryption", [tool("age"), "--decrypt", "--identity", str(Path(args.identity)),
                                 "--output", str(plain), str(archive)])
        count = restore_plain(plain, target, manifest["source_fingerprint"], int(manifest["postgresql_major"]))
    print(json.dumps({"result": "restore_verified", "table_count": count}))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    backup = commands.add_parser("create", help="Dump, test-restore, and encrypt a full backup")
    backup.add_argument("--recipient-file", required=True)
    backup.add_argument("--output-dir", required=True)
    recovery = commands.add_parser("restore", help="Decrypt and restore into a NEW empty database")
    recovery.add_argument("--backup", required=True)
    recovery.add_argument("--manifest", required=True)
    recovery.add_argument("--identity", required=True)
    recovery.add_argument("--confirm-empty-target", action="store_true")
    args = parser.parse_args()
    try:
        create(args) if args.operation == "create" else restore(args)
    except BackupError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        print("Backup operation failed; sensitive diagnostic details were withheld.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
