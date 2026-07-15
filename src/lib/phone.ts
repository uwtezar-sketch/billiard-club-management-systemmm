// شماره‌ها رو قبل از مقایسه «تمیز» می‌کنیم (فقط عدد نگه می‌داریم) تا فاصله/خط‌تیره
// باعث نشه یه مشتری به‌اشتباه دو نفر جدا حساب بشه.
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}
