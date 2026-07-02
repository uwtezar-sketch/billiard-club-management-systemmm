import * as jalaali from "jalaali-js";

function getTehranYMD(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}

export function toJalaali(date: Date): string {
  const { y, m, d } = getTehranYMD(date);
  const { jy, jm, jd } = jalaali.toJalaali(y, m, d);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export function toJalaaliLabel(date: Date): string {
  const months = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
  ];
  const { y, m, d } = getTehranYMD(date);
  const { jy, jm, jd } = jalaali.toJalaali(y, m, d);
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
