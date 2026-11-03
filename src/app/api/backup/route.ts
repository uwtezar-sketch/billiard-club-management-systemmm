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
  activityLogs,
  customerPointRedemptions,
  creditors,
  creditorTransactions,
} from "@/db/schema";

export async function GET() {
  try {
    const backup = await db.transaction(async (tx) => {
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
        activityLogsRows,
        customerPointRedemptionsRows,
        creditorsRows,
        creditorTransactionsRows,
      ] = await Promise.all([
        tx.select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt }).from(users),
        tx.select().from(tables),
        tx.select().from(sessions),
        tx.select().from(cafeMenu),
        tx.select().from(invoices),
        tx.select().from(invoiceItems),
        tx.select().from(invoiceShares),
        tx.select().from(sessionCafeOrders),
        tx.select().from(debtors),
        tx.select().from(debts),
        tx.select().from(debtorPayments),
        tx.select().from(reservations),
        tx.select().from(settings),
        tx.select().from(customers),
        tx.select().from(inventoryItems),
        tx.select().from(inventoryLogs),
        tx.select().from(activityLogs),
        tx.select().from(customerPointRedemptions),
        tx.select().from(creditors),
        tx.select().from(creditorTransactions),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        version: 3,
        data: {
          users: usersRows,
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
          activityLogs: activityLogsRows,
          customerPointRedemptions: customerPointRedemptionsRows,
          creditors: creditorsRows,
          creditorTransactions: creditorTransactionsRows,
        },
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });

    return NextResponse.json(backup, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("database_json_export_failed");
    return NextResponse.json({ error: "خطا در ساخت نسخه پشتیبان" }, { status: 500 });
  }
}
