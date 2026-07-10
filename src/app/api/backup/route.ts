import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  tables,
  sessions,
  cafeMenu,
  invoices,
  invoiceItems,
  sessionCafeOrders,
  debtors,
  debts,
  reservations,
  settings,
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
      sessionCafeOrdersRows,
      debtorsRows,
      debtsRows,
      reservationsRows,
      settingsRows,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(tables),
      db.select().from(sessions),
      db.select().from(cafeMenu),
      db.select().from(invoices),
      db.select().from(invoiceItems),
      db.select().from(sessionCafeOrders),
      db.select().from(debtors),
      db.select().from(debts),
      db.select().from(reservations),
      db.select().from(settings),
    ]);

    const safeUsers = usersRows.map((u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));

    const backup = {
      generatedAt: new Date().toISOString(),
      version: 1,
      data: {
        users: safeUsers,
        tables: tablesRows,
        sessions: sessionsRows,
        cafeMenu: cafeMenuRows,
        invoices: invoicesRows,
        invoiceItems: invoiceItemsRows,
        sessionCafeOrders: sessionCafeOrdersRows,
        debtors: debtorsRows,
        debts: debtsRows,
        reservations: reservationsRows,
        settings: settingsRows,
      },
    };

    return NextResponse.json(backup);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ساخت نسخه پشتیبان" }, { status: 500 });
  }
}
