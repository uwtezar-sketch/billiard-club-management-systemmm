import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  tables,
  sessions,
  cafeMenu,
  invoices,
  invoiceItems,
  invoiceShares,
  sessionCafeOrders,
  debtors,
  debts,
  debtorPayments,
  reservations,
  settings,
  customers,
  inventoryItems,
  inventoryLogs,
} from "@/db/schema";

export async function GET() {
  try {
    const [
      usersRows,
      tablesRows,
      sessionsRows,
      cafeMenuRows,
      invoicesRows,
      invoiceItemsRows,
      invoiceSharesRows,
      sessionCafeOrdersRows,
      debtorsRows,
      debtsRows,
      debtorPaymentsRows,
      reservationsRows,
      settingsRows,
      customersRows,
      inventoryItemsRows,
      inventoryLogsRows,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(tables),
      db.select().from(sessions),
      db.select().from(cafeMenu),
      db.select().from(invoices),
      db.select().from(invoiceItems),
      db.select().from(invoiceShares),
      db.select().from(sessionCafeOrders),
      db.select().from(debtors),
      db.select().from(debts),
      db.select().from(debtorPayments),
      db.select().from(reservations),
      db.select().from(settings),
      db.select().from(customers),
      db.select().from(inventoryItems),
      db.select().from(inventoryLogs),
    ]);

    const safeUsers = usersRows.map((u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));

    const backup = {
      generatedAt: new Date().toISOString(),
      version: 2,
      data: {
        users: safeUsers,
        tables: tablesRows,
        sessions: sessionsRows,
        cafeMenu: cafeMenuRows,
        invoices: invoicesRows,
        invoiceItems: invoiceItemsRows,
        invoiceShares: invoiceSharesRows,
        sessionCafeOrders: sessionCafeOrdersRows,
        debtors: debtorsRows,
        debts: debtsRows,
        debtorPayments: debtorPaymentsRows,
        reservations: reservationsRows,
        settings: settingsRows,
        customers: customersRows,
        inventoryItems: inventoryItemsRows,
        inventoryLogs: inventoryLogsRows,
      },
    };

    return NextResponse.json(backup);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ساخت نسخه پشتیبان" }, { status: 500 });
  }
}
