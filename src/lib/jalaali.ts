import * as jalaali from "jalaali-js";

export function toJalaali(date: Date): string {
  const { jy, jm, jd } = jalaali.toJalaali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export function toJalaaliLabel(date: Date): string {
  const months = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
  ];
  const { jy, jm, jd } = jalaali.toJalaali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
  return `${jd} ${months[jm - 1]} ${jy}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} دقیقه`;
  if (m === 0) return `${h} ساعت`;
  return `${h} ساعت و ${m} دقیقه`;
}

export function calcPrice(minutes: number, pricePerHour: number): number {
  return Math.round((minutes / 60) * pricePerHour);
}

export function formatPrice(amount: number): string {
  return amount.toLocaleString("fa-IR") + " تومان";
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const ts = now.getTime().toString().slice(-8);
  return `INV-${ts}`;
}

export function todayJalaali(): string {
  return toJalaali(new Date());
}
