// محاسبه‌ی نسبت واقعی «پرداخت‌شده / بدهی / در انتظار» برای یک فاکتور — چه عادی، چه تقسیم‌شده.
// این فایل مرکزی نگه داشته می‌شه تا همه‌ی گزارش‌ها (روزانه، تحلیلی و...) دقیقاً یک منطق حسابی داشته باشن
// و درآمد واقعی هیچ‌وقت با بدهی/در انتظار قاطی نشه.

export type ShareLite = { status: string; amount: string | number; paymentMethod?: string | null };

export type InvoiceRatios = { paid: number; debt: number; pending: number };

export function invoiceRatios(
  inv: { status: string; isSplit: boolean; totalAmount: string | number },
  sharesByInvoice: Map<number, ShareLite[]>,
  invId: number
): InvoiceRatios {
  const total = Number(inv.totalAmount) || 0;
  if (total === 0) return { paid: 0, debt: 0, pending: 0 };

  if (inv.isSplit) {
    const shares = sharesByInvoice.get(invId) || [];
    const paidSum = shares.filter((s) => s.status === "paid").reduce((s, sh) => s + Number(sh.amount), 0);
    const debtSum = shares.filter((s) => s.status === "debt").reduce((s, sh) => s + Number(sh.amount), 0);
    const pendingSum = shares.filter((s) => s.status === "pending").reduce((s, sh) => s + Number(sh.amount), 0);
    return { paid: paidSum / total, debt: debtSum / total, pending: pendingSum / total };
  }

  return {
    paid: inv.status === "paid" ? 1 : 0,
    debt: inv.status === "debt" ? 1 : 0,
    pending: inv.status === "pending" ? 1 : 0,
  };
}

// مبلغِ واقعاً پرداخت‌شده‌ی یک فاکتور به تفکیک نقد/کارت (برای فاکتورهای تقسیم‌شده از روی سهم‌ها، برای بقیه از روی خودِ فاکتور)
export function paidByMethod(
  inv: { status: string; isSplit: boolean; totalAmount: string | number; paymentMethod: string | null },
  sharesByInvoice: Map<number, ShareLite[]>,
  invId: number
): { cash: number; card: number } {
  if (inv.isSplit) {
    const shares = sharesByInvoice.get(invId) || [];
    const cash = shares.filter((s) => s.status === "paid" && s.paymentMethod === "cash").reduce((s, sh) => s + Number(sh.amount), 0);
    const card = shares.filter((s) => s.status === "paid" && s.paymentMethod === "card").reduce((s, sh) => s + Number(sh.amount), 0);
    return { cash, card };
  }
  if (inv.status !== "paid") return { cash: 0, card: 0 };
  const amt = Number(inv.totalAmount) || 0;
  return {
    cash: inv.paymentMethod === "cash" ? amt : 0,
    card: inv.paymentMethod === "card" ? amt : 0,
  };
}
