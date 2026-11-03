import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { client, db, queries, createTestSchema } from "./database";
import { GET as invoicesGet } from "../src/app/api/invoices/route";
import { GET as debtorsGet } from "../src/app/api/debtors/route";
import { GET as customersGet } from "../src/app/api/customers/route";
import { GET as summaryGet } from "../src/app/api/navigation-summary/route";
import { GET as backupGet } from "../src/app/api/backup/route";
import { middleware } from "../src/middleware";
import { createSessionToken } from "../src/lib/auth";
import * as schema from "../src/db/schema";

const request = (path: string) => new NextRequest(`https://test.invalid${path}`);

before(async () => {
  await createTestSchema();
  await db.insert(schema.customers).values([{ id: 1, name: "TEST_A", phone: "TEST_PHONE_A" }, { id: 2, name: "TEST_B", phone: "TEST_PHONE_B" }]);
  await db.insert(schema.tables).values([
    { name: "TEST_ACTIVE", type: "snooker", isActive: true },
    { name: "TEST_ARCHIVED", type: "snooker", isActive: true, isArchived: true },
    { name: "TEST_FREE", type: "eightball" },
  ]);
  await db.insert(schema.debtors).values([
    { id: 1, name: "TEST_A", customerId: 1, totalDebt: "12500.50" },
    { id: 2, name: "TEST_B", totalDebt: "0" },
    { id: 3, name: "TEST_C", totalDebt: "-10" },
  ]);
  await db.insert(schema.invoices).values([
    { id: 1, invoiceNumber: "TEST_PAID", status: "paid", paymentMethod: "cash", totalAmount: "123.45" },
    { id: 2, invoiceNumber: "TEST_SPLIT_PENDING", status: "split", isSplit: true },
    { id: 3, invoiceNumber: "TEST_SPLIT_SETTLED", status: "split", isSplit: true },
    { id: 4, invoiceNumber: "TEST_DEBT", status: "debt", paymentMethod: "debt" },
    { id: 5, invoiceNumber: "TEST_PARTIAL_PENDING", status: "pending", isPartial: true, discountType: "fixed", discountAmount: "10.25", totalAmount: "20.75" },
    { id: 6, invoiceNumber: "TEST_SPLIT_FLAG_PENDING", status: "pending", isSplit: true },
  ]);
  await db.insert(schema.invoiceItems).values([
    { invoiceId: 1, name: "TEST_ITEM_A", quantity: 2, unitPrice: "1.25", totalPrice: "2.50" },
    { invoiceId: 2, name: "TEST_ITEM_B", quantity: 1, unitPrice: "3", totalPrice: "3" },
  ]);
  await db.insert(schema.invoiceShares).values([
    { invoiceId: 2, label: "TEST_SHARE_A", amount: "5", status: "pending" },
    { invoiceId: 2, label: "TEST_SHARE_B", amount: "5", status: "paid", paymentMethod: "card" },
    { invoiceId: 3, label: "TEST_SHARE_C", amount: "10", status: "paid", paymentMethod: "cash" },
    { invoiceId: 6, label: "TEST_SHARE_D", amount: "10", status: "pending" },
  ]);
  await db.insert(schema.debts).values([
    { debtorId: 1, invoiceId: 4, amount: "20000.75", createdAt: new Date("2026-01-02T00:00:00Z") },
    { debtorId: 1, amount: "100", isPaid: true, createdAt: new Date("2026-01-01T00:00:00Z") },
    { debtorId: 2, amount: "10", isPaid: true },
  ]);
  await db.insert(schema.debtorPayments).values([
    { debtorId: 1, amount: "7500.25" }, { debtorId: 2, amount: "10" },
  ]);
});
after(async () => { await client.close(); });

test("invoice batch reads keep money, items, split shares and pending semantics", async () => {
  queries.length = 0;
  const response = await invoicesGet(request("/api/invoices"));
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(queries.length, 3);
  const paid = rows.find((r: { id: number }) => r.id === 1);
  assert.equal(paid.totalAmount, "123.45");
  assert.equal(paid.items[0].totalPrice, "2.50");
  assert.equal(paid.shares.length, 0);
  const split = rows.find((r: { id: number }) => r.id === 2);
  assert.deepEqual(split.shares.map((s: { status: string }) => s.status).sort(), ["paid", "pending"]);
  assert.equal(split.items[0].name, "TEST_ITEM_B");
  const pending = await (await invoicesGet(request("/api/invoices?status=pending"))).json();
  assert.deepEqual(pending.map((r: { id: number }) => r.id).sort(), [2, 5, 6]);
  assert.equal(pending.find((r: { id: number }) => r.id === 5).discountAmount, "10.25");
});

test("empty invoice search avoids item/share reads", async () => {
  queries.length = 0;
  assert.deepEqual(await (await invoicesGet(request("/api/invoices?search=NO_MATCH"))).json(), []);
  assert.equal(queries.length, 1);
});

test("debtor batch reads preserve ownership, order, payments and stored balances", async () => {
  queries.length = 0;
  const response = await debtorsGet(request("/api/debtors"));
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(queries.length, 4);
  const debtor = rows.find((r: { id: number }) => r.id === 1);
  assert.equal(debtor.customerName, "TEST_A");
  assert.equal(debtor.totalDebt, "12500.50");
  assert.deepEqual(debtor.debts.map((d: { amount: string }) => d.amount), ["20000.75", "100.00"]);
  assert.deepEqual(debtor.payments.map((p: { amount: string }) => p.amount), ["7500.25"]);
  const filtered = await (await debtorsGet(request("/api/debtors?search=TEST_B"))).json();
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].payments[0].amount, "10.00");
  assert.equal(filtered[0].debts.length, 1);
});

test("customer directory runs one identity-only query with no loyalty/history scans", async () => {
  queries.length = 0;
  const response = await customersGet(request("/api/customers?directory=1"));
  const rows = await response.json();
  assert.equal(response.status, 200);
  assert.equal(queries.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["id", "name", "phone"]);
  assert.equal(rows[0].name, "TEST_A");
  assert.equal(rows[1].phone, "TEST_PHONE_B");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("summary counts pending invoices beyond the old 200-row list cap", async () => {
  await db.insert(schema.invoices).values(Array.from({ length: 205 }, (_, i) => ({
    id: 1000 + i, invoiceNumber: `TEST_EXTRA_${i}`, status: "pending",
  })));
  queries.length = 0;
  const response = await summaryGet();
  assert.deepEqual(await response.json(), { activeTablesCount: 1, unpaidDebtorsCount: 1, pendingInvoicesCount: 208 });
  assert.equal(queries.length, 1);
});

test("summary remains authenticated and only GET is allowed to employees", () => {
  assert.equal(middleware(request("/api/navigation-summary")).status, 401);
  const token = createSessionToken({ uid: 1, username: "TEST_EMPLOYEE", role: "employee", exp: Date.now() + 60_000 });
  const get = new NextRequest("https://test.invalid/api/navigation-summary", { headers: { cookie: `session=${token}` } });
  assert.equal(middleware(get).status, 200);
  const post = new NextRequest("https://test.invalid/api/navigation-summary", { method: "POST", headers: { cookie: `session=${token}` } });
  assert.equal(middleware(post).status, 403);
});

test("manual JSON export includes all 20 tables in a read-only snapshot and omits login hashes", async () => {
  await db.insert(schema.users).values({ username: "TEST_BACKUP_USER", passwordHash: "TEST_HASH_NOT_A_REAL_CREDENTIAL", role: "admin" });
  await db.insert(schema.creditors).values({ id: 1, name: "TEST_CREDITOR", totalCredit: "99.25" });
  await db.insert(schema.creditorTransactions).values({ creditorId: 1, type: "credit", amount: "99.25" });
  await db.insert(schema.customerPointRedemptions).values({ customerId: 1, points: 5, note: "TEST_REDEMPTION" });
  await db.insert(schema.activityLogs).values({ action: "TEST_BACKUP", entityType: "test" });
  queries.length = 0;
  const response = await backupGet();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const backup = await response.json();
  assert.equal(backup.version, 3);
  assert.equal(Object.keys(backup.data).length, 20);
  assert.equal(backup.data.creditors[0].totalCredit, "99.25");
  assert.equal(backup.data.creditorTransactions[0].amount, "99.25");
  assert.equal(backup.data.customerPointRedemptions[0].points, 5);
  assert.equal(backup.data.activityLogs[0].action, "TEST_BACKUP");
  assert.equal("passwordHash" in backup.data.users[0], false);
  assert.equal(JSON.stringify(backup).includes("TEST_HASH_NOT_A_REAL_CREDENTIAL"), false);
  assert.ok(queries.some((query) => /repeatable read.*read only/i.test(query)));
  const token = createSessionToken({ uid: 1, username: "TEST_EMPLOYEE", role: "employee", exp: Date.now() + 60_000 });
  const employeeRequest = new NextRequest("https://test.invalid/api/backup", { headers: { cookie: `session=${token}` } });
  assert.equal(middleware(employeeRequest).status, 403);
  assert.equal(middleware(request("/api/backup")).status, 401);
});
