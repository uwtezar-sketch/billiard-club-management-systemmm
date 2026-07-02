import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems, sessions, tables, debtors, debts } from "@/db/schema";
import { eq, desc, like, and, gte, lte } from "drizzle-orm";
import { toJalaali, generateInvoiceNumber } from "@/lib/jalaali";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const date = searchParams.get("date");
    const tableType = searchParams.get("tableType");
    const paymentMethod = searchParams.get("paymentMethod");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db.select().from(invoices);

    const conditions = [];
    if (status) conditions.push(eq(invoices.status, status));
    if (date) conditions.push(eq(invoices.jalaaliDate, date));
    if (tableType) conditions.push(eq(invoices.tableType, tableType));
    if (paymentMethod) conditions.push(eq(invoices.paymentMethod, paymentMethod));

    const allInvoices = await db
      .select()
      .from(invoices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(invoices.issuedAt))
      .limit(limit)
      .offset(offset);

    // Filter by search client side for simplicity
    const filtered = search
      ? allInvoices.filter(
          (inv) =>
            inv.customerName?.includes(search) ||
            inv.invoiceNumber.includes(search)
        )
      : allInvoices;

    // Attach items
    const withItems = await Promise.all(
      filtered.map(async (inv) => {
        const items = await db
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, inv.id));
        return { ...inv, items };
      })
    );

    return NextResponse.json(withItems);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در دریافت فاکتورها" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      tableId,
      customerName,
      customerPhone,
      tableType,
      tableName,
      startTime,
      endTime,
      durationMinutes,
      pricePerHour,
      gamePrice,
      cafeItems,
      discountType,
      discountValue,
      paymentMethod,
      status,
      isPartial,
      notes,
    } = body;

    const cafeTotal = (cafeItems || []).reduce(
      (sum: number, item: { totalPrice: number }) => sum + Number(item.totalPrice),
      0
    );
    const subtotal = Number(gamePrice || 0) + cafeTotal;

    let discountAmount = 0;
    if (discountType === "percent") {
      discountAmount = Math.round(subtotal * (Number(discountValue || 0) / 100));
    } else if (discountType === "fixed") {
      discountAmount = Number(discountValue || 0);
    }
    const totalAmount = Math.max(0, subtotal - discountAmount);

    const invoiceNumber = generateInvoiceNumber();
    const jalaaliDate = toJalaali(new Date());

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        sessionId: sessionId || null,
        tableId: tableId || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        tableType: tableType || null,
        tableName: tableName || null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        durationMinutes: durationMinutes || null,
        pricePerHour: pricePerHour ? pricePerHour.toString() : null,
        gamePrice: gamePrice.toString(),
        cafeTotal: cafeTotal.toString(),
        subtotal: subtotal.toString(),
        discountType: discountType || null,
        discountValue: discountValue ? discountValue.toString() : "0",
        discountAmount: discountAmount.toString(),
        totalAmount: totalAmount.toString(),
        paymentMethod: paymentMethod || null,
        status: status || "pending",
        isPartial: isPartial || false,
        notes: notes || null,
        jalaaliDate,
        settledAt: status === "paid" ? new Date() : null,
      })
      .returning();

    // Insert cafe items
    if (cafeItems && cafeItems.length > 0) {
      await db.insert(invoiceItems).values(
        cafeItems.map((item: { cafeItemId?: number; name: string; quantity: number; unitPrice: number; totalPrice: number }) => ({
          invoiceId: invoice.id,
          cafeItemId: item.cafeItemId || null,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
        }))
      );
    }

    // Handle debt transfer
    if (paymentMethod === "debt" || status === "debt") {
      let debtorId: number;

      if (body.debtorId) {
        debtorId = body.debtorId;
        // Update total debt
        const [debtor] = await db.select().from(debtors).where(eq(debtors.id, debtorId));
        if (debtor) {
          await db
            .update(debtors)
            .set({ totalDebt: (Number(debtor.totalDebt) + totalAmount).toString() })
            .where(eq(debtors.id, debtorId));
        }
      } else {
        // Create new debtor
        const [newDebtor] = await db
          .insert(debtors)
          .values({
            name: customerName || "نامشخص",
            phone: customerPhone || null,
            totalDebt: totalAmount.toString(),
          })
          .returning();
        debtorId = newDebtor.id;
      }

      await db.insert(debts).values({
        debtorId,
        invoiceId: invoice.id,
        invoiceNumber,
        amount: totalAmount.toString(),
        description: `فاکتور ${invoiceNumber} - ${tableName || ""} - ${jalaaliDate}`,
        jalaaliDate,
        isPaid: false,
      });

      // Update invoice status to debt
      await db
        .update(invoices)
        .set({ status: "debt" })
        .where(eq(invoices.id, invoice.id));
    }

    // If session is not partial and not kept open, close the session
    if (sessionId && !isPartial) {
      await db
        .update(sessions)
        .set({ status: "closed", endTime: endTime ? new Date(endTime) : new Date() })
        .where(eq(sessions.id, sessionId));
      if (tableId) {
        await db.update(tables).set({ isActive: false }).where(eq(tables.id, tableId));
      }
    }

    return NextResponse.json({ ...invoice, invoiceNumber });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در صدور فاکتور" }, { status: 500 });
  }
}
