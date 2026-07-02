import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, invoiceItems } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, parseInt(id)));
    if (!invoice) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    return NextResponse.json({ ...invoice, items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, settledAt } = body;

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (settledAt !== undefined) updateData.settledAt = settledAt ? new Date(settledAt) : new Date();
    if (status === "paid" && !settledAt) updateData.settledAt = new Date();

    const [invoice] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, parseInt(id)))
      .returning();

    return NextResponse.json(invoice);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ویرایش فاکتور" }, { status: 500 });
  }
}
