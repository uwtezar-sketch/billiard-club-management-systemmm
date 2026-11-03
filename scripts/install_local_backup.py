#!/usr/bin/env python3
"""Install the club's deterministic macOS backup job; no credentials enter this file."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = Path.home() / "Library/Application Support/Eram Billiard Backup"
LABEL = "local.eram.billiard.daily-backup"


def configuration():
    return {
        "Label": LABEL,
        "ProgramArguments": [shutil.which("python3") or sys.executable, str(RUNTIME / "app/scripts/local_backup.py"), "run"],
        "WorkingDirectory": str(RUNTIME),
        "RunAtLoad": True,
        "StartCalendarInterval": {"Hour": 6, "Minute": 0},
        # Idempotent hourly catch-up: a valid backup for the due day prevents another DB read.
        "StartInterval": 3600,
        "ProcessType": "Background",
        "LowPriorityIO": True,
        "ThrottleInterval": 300,
        "StandardOutPath": str(RUNTIME / "backups/backup-runner.log"),
        "StandardErrorPath": str(RUNTIME / "backups/backup-errors.log"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--prepare-runtime", action="store_true")
    args = parser.parse_args()
    generated = ROOT / ".backup-config" / (LABEL + ".plist")
    generated.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    generated.write_bytes(plistlib.dumps(configuration()))
    generated.chmod(0o600)
    subprocess.run(["plutil", "-lint", str(generated)], check=True)
    if args.prepare_runtime or args.install:
        for name in ["app/scripts", ".backup-tools", ".backup-config", ".backup-keys", "backups"]:
            (RUNTIME / name).mkdir(parents=True, exist_ok=True, mode=0o700)
        for name in ["local_backup.py", "backup_database.py"]:
            shutil.copy2(ROOT / "app/scripts" / name, RUNTIME / "app/scripts" / name)
        for name in ["age", "age-keygen"]:
            destination = RUNTIME / ".backup-tools" / name
            shutil.copy2(ROOT / ".backup-tools" / name, destination)
            destination.chmod(0o700)
    if not args.install:
        print("Reviewed local scheduler configuration:", generated)
        return 0
    private_config = RUNTIME / ".backup-config/source.json"
    if not private_config.is_file():
        raise SystemExit("Complete local_backup.py setup before enabling the daily job.")
    health = subprocess.run([sys.executable, str(RUNTIME / "app/scripts/local_backup.py"), "status"], capture_output=True)
    if health.returncode:
        raise SystemExit("Create and verify the first local backup before enabling the daily job.")
    destination = Path.home() / "Library/LaunchAgents" / generated.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(generated, destination)
    destination.chmod(0o600)
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], capture_output=True)
    result = subprocess.run(["launchctl", "bootstrap", domain, str(destination)], capture_output=True)
    if result.returncode:
        raise SystemExit("Local scheduler could not load. No database records were changed.")
    print("Daily local backup job installed. Previous backup files are retained.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
