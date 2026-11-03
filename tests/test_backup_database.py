"""Integration tests use a private disposable local PostgreSQL 18 cluster, never Neon."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
import importlib.util
import io

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "backup_database.py"


class BackupIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="eram-backup-integration-")
        cls.base = Path(cls.directory.name)
        cls.data = cls.base / "pgdata"
        cls.logs = cls.base / "postgres.log"
        cls.pg_ctl = os.environ.get("PG_CTL_BIN", "pg_ctl")
        cls.psql = os.environ.get("PSQL_BIN", "psql")
        cls.age = os.environ.get("AGE_BIN", "age")
        cls.keygen = os.environ.get("AGE_KEYGEN_BIN", "age-keygen")
        cls.addClassCleanup(cls.cleanup)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        subprocess.run([os.environ.get("INITDB_BIN", "initdb"), "-D", str(cls.data), "-A", "trust", "-U", "backup_test", "--no-locale", "--encoding=UTF8"], check=True, capture_output=True)
        subprocess.run([cls.pg_ctl, "-D", str(cls.data), "-l", str(cls.logs), "-o", f"-h 127.0.0.1 -p {cls.port} -k {cls.base}", "-w", "start"], check=True, capture_output=True)
        cls.admin = f"postgresql://backup_test@127.0.0.1:{cls.port}/postgres"
        for database in ["source", "verify", "recovered", "blocked", "wrongkey", "tampered"]:
            cls.sql(cls.admin, f"CREATE DATABASE {database}")
        cls.source = cls.url("source")
        cls.sql(cls.source, (ROOT / "tests" / "backup-fixture.sql").read_text())
        cls.sql(cls.source, """
          INSERT INTO users(username,password_hash,role) VALUES ('TEST_ADMIN','TEST_HASH_ONLY','admin');
          INSERT INTO tables(name,type,is_active) VALUES ('TEST_TABLE','snooker',true);
          INSERT INTO sessions(table_id,start_time,price_per_hour) VALUES (1,'2026-01-02 23:59:00',125000.50);
          INSERT INTO cafe_menu(name,price) VALUES ('TEST_CAFE',12500.25);
          INSERT INTO invoices(invoice_number,session_id,table_id,game_price,cafe_total,subtotal,discount_amount,total_amount,status,is_split,jalaali_date)
            VALUES ('TEST_INVOICE',1,1,125000.50,12500.25,137500.75,10000.25,127500.50,'split',true,'1404/10/12');
          INSERT INTO invoice_items(invoice_id,name,quantity,unit_price,total_price) VALUES (1,'TEST_CAFE',1,12500.25,12500.25);
          INSERT INTO session_cafe_orders(session_id,name,quantity,unit_price,total_price) VALUES (1,'TEST_CAFE',1,12500.25,12500.25);
          INSERT INTO customers(name,phone) VALUES ('TEST_CUSTOMER','TEST_PHONE');
          INSERT INTO debtors(name,total_debt,customer_id) VALUES ('TEST_DEBTOR',63750.25,1);
          INSERT INTO invoice_shares(invoice_id,label,amount,status,debtor_id) VALUES (1,'TEST_SHARE',63750.25,'debt',1);
          INSERT INTO debts(debtor_id,invoice_id,share_id,amount) VALUES (1,1,1,63750.25);
          INSERT INTO debtor_payments(debtor_id,amount) VALUES (1,1250.25);
          INSERT INTO reservations(customer_name,table_type,reservation_date,start_time) VALUES ('TEST_CUSTOMER','snooker','1404/10/12','23:59');
          INSERT INTO settings(key,value) VALUES ('snooker_price','125000.50');
          INSERT INTO activity_logs(action,entity_type) VALUES ('TEST_ACTION','test');
          INSERT INTO inventory_items(name,category,unit,current_quantity) VALUES ('TEST_INVENTORY','test','test',9.25);
          INSERT INTO inventory_logs(item_id,previous_quantity,new_quantity) VALUES (1,10.25,9.25);
          INSERT INTO customer_point_redemptions(customer_id,points,note) VALUES (1,12,'TEST_POINTS');
          INSERT INTO creditors(name,total_credit) VALUES ('TEST_CREDITOR',55000.75);
          INSERT INTO creditor_transactions(creditor_id,type,amount) VALUES (1,'credit',55000.75);
        """)
        cls.identity = cls.base / "test.agekey"
        subprocess.run([cls.keygen, "-o", str(cls.identity)], check=True, capture_output=True)
        public = subprocess.run([cls.keygen, "-y", str(cls.identity)], check=True, capture_output=True, text=True).stdout.strip()
        cls.recipient = cls.base / "recipient.txt"
        cls.recipient.write_text(public + "\n")
        cls.output = cls.base / "encrypted"
        environment = dict(os.environ, BACKUP_DATABASE_URL=cls.source, BACKUP_VERIFY_DATABASE_URL=cls.url("verify"), AGE_BIN=cls.age)
        result = subprocess.run([sys.executable, str(SCRIPT), "create", "--recipient-file", str(cls.recipient), "--output-dir", str(cls.output)], env=environment, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        cls.backup = next(cls.output.glob("*.dump.age"))
        cls.manifest = next(cls.output.glob("*.json"))

    @classmethod
    def cleanup(cls):
        if hasattr(cls, "data") and (cls.data / "postmaster.pid").exists():
            subprocess.run([cls.pg_ctl, "-D", str(cls.data), "-m", "fast", "-w", "stop"], capture_output=True)
        if hasattr(cls, "directory"):
            cls.directory.cleanup()

    @classmethod
    def url(cls, database):
        return f"postgresql://backup_test@127.0.0.1:{cls.port}/{database}"

    @classmethod
    def sql(cls, url, statement):
        return subprocess.run([cls.psql, "-XAt", "--set=ON_ERROR_STOP=1", "--dbname", url, "--command", statement], check=True, capture_output=True, text=True).stdout.strip()

    def recover(self, database, *, backup=None, manifest=None, identity=None, confirmed=True):
        arguments = [sys.executable, str(SCRIPT), "restore", "--backup", str(backup or self.backup), "--manifest", str(manifest or self.manifest), "--identity", str(identity or self.identity)]
        if confirmed:
            arguments.append("--confirm-empty-target")
        return subprocess.run(arguments, env=dict(os.environ, RESTORE_DATABASE_URL=self.url(database), AGE_BIN=self.age), capture_output=True, text=True)

    def test_01_encrypted_package_has_no_plaintext_or_private_key(self):
        manifest = json.loads(self.manifest.read_text())
        self.assertTrue(manifest["restore_verified"])
        self.assertEqual(manifest["verified_table_count"], 20)
        self.assertEqual(manifest["sha256"], hashlib.sha256(self.backup.read_bytes()).hexdigest())
        self.assertEqual(set(p.suffix for p in self.output.iterdir()), {".age", ".json"})
        self.assertNotIn(b"TEST_CUSTOMER", self.backup.read_bytes())
        self.assertNotIn(b"AGE-SECRET-KEY", self.backup.read_bytes())

    def test_02_restore_preserves_all_rows_money_hashes_relations_and_sequences(self):
        result = self.recover("recovered")
        self.assertEqual(result.returncode, 0, result.stderr)
        names = self.sql(self.source, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
        self.assertEqual(len(names), 20)
        for table in names:
            statement = f'SELECT json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM "{table}" t'
            self.assertEqual(self.sql(self.source, statement), self.sql(self.url("recovered"), statement), table)
        self.assertEqual(self.sql(self.url("recovered"), "SELECT nextval('invoices_id_seq')"), "2")
        count_sql = "SELECT count(*) FROM pg_constraint WHERE contype='f'"
        self.assertEqual(self.sql(self.source, count_sql), self.sql(self.url("recovered"), count_sql))

    def test_03_nonempty_destination_is_never_erased(self):
        target = self.url("blocked")
        self.sql(target, "CREATE TABLE sentinel(value text); INSERT INTO sentinel VALUES ('KEEP_ME')")
        result = self.recover("blocked")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not empty", result.stderr)
        self.assertEqual(self.sql(target, "SELECT value FROM sentinel"), "KEEP_ME")

    def test_04_original_source_is_rejected(self):
        result = self.recover("source")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("original source", result.stderr)
        self.assertEqual(self.sql(self.source, "SELECT count(*) FROM invoices"), "1")

    def test_05_wrong_key_does_not_write_any_tables(self):
        identity = self.base / "wrong.agekey"
        subprocess.run([self.keygen, "-o", str(identity)], check=True, capture_output=True)
        result = self.recover("wrongkey", identity=identity)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("decryption", result.stderr.lower())
        self.assertEqual(self.sql(self.url("wrongkey"), "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0")

    def test_06_corrupted_ciphertext_is_rejected_before_restore(self):
        folder = self.base / "corrupt"
        folder.mkdir()
        corrupt = folder / self.backup.name
        content = bytearray(self.backup.read_bytes())
        content[-1] ^= 1
        corrupt.write_bytes(content)
        result = self.recover("tampered", backup=corrupt)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum", result.stderr)
        self.assertEqual(self.sql(self.url("tampered"), "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0")

    def test_07_restore_requires_explicit_empty_target_acknowledgment(self):
        result = self.recover("tampered", confirmed=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("confirm-empty-target", result.stderr)

    def test_08_local_daily_runner_verifies_restore_and_skips_a_second_source_read(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        spec = importlib.util.spec_from_file_location("local_backup_under_test", ROOT / "scripts/local_backup.py")
        local = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(local)
        local.ROOT = self.base / "local-runner"
        local.CONFIG = local.ROOT / ".backup-config/source.json"
        local.KEYS = local.ROOT / ".backup-keys"
        local.OUTPUT = local.ROOT / "backups"
        local.STATUS = local.OUTPUT / "status.json"
        local.TOOLS = local.ROOT / ".backup-tools"
        local.prepare()
        shutil.copy2(self.identity, local.KEYS / "eram-recovery.agekey")
        shutil.copy2(self.recipient, local.KEYS / "recipient.txt")
        local.atomic_json(local.CONFIG, {"database_url": self.source})
        with redirect_stdout(io.StringIO()):
            local.run(force=True)
        self.assertEqual(json.loads(local.STATUS.read_text())["state"], "ok")
        self.assertEqual(len(list(local.OUTPUT.glob("*/*.dump.age"))), 1)
        with patch.object(local.backup, "query", side_effect=AssertionError("unexpected database read")), redirect_stdout(io.StringIO()):
            local.run()
        self.assertEqual(len(list(local.OUTPUT.glob("*/*.dump.age"))), 1)
        self.assertEqual(local.CONFIG.stat().st_mode & 0o777, 0o600)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(local.status(), 0)

    def test_09_invalid_connection_errors_never_echo_the_secret_input(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import backup_database as module
        with patch.dict(os.environ, {"INVALID_TEST_URL": "postgresql://user:PRIVATE_TEST_MARKER@localhost:BAD_PORT/db"}):
            with self.assertRaises(module.BackupError) as raised:
                module.connection("INVALID_TEST_URL")
        self.assertNotIn("PRIVATE_TEST_MARKER", str(raised.exception))

    def test_10_local_day_cutoff_uses_tehran_at_six_am(self):
        from datetime import datetime
        sys.path.insert(0, str(ROOT / "scripts"))
        import local_backup
        before = local_backup.cutoff(datetime.fromisoformat("2026-11-02T02:29:00+00:00"))
        after = local_backup.cutoff(datetime.fromisoformat("2026-11-02T02:30:00+00:00"))
        self.assertEqual(before.isoformat(), "2026-11-01T06:00:00+03:30")
        self.assertEqual(after.isoformat(), "2026-11-02T06:00:00+03:30")


if __name__ == "__main__":
    unittest.main(verbosity=2)
