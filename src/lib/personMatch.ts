import { normalizePhone } from "@/lib/phone";

export function normalizeName(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// آیا این فاکتور/سهم متعلق به همین شخصه؟ اول با شماره تلفن (دقیق‌تر)، وگرنه با نام (وقتی تلفن ثبت نشده)
export function isSamePerson(
  person: { phone: string | null | undefined; name: string | null | undefined },
  entry: { phone: string | null | undefined; name: string | null | undefined }
): boolean {
  const pPhone = normalizePhone(person.phone);
  const ePhone = normalizePhone(entry.phone);
  if (pPhone && ePhone) return pPhone === ePhone;
  if (pPhone || ePhone) return false; // یکی شماره داره یکی نداره → مطمئن نیستیم، مچ نکن
  const pName = normalizeName(person.name);
  const eName = normalizeName(entry.name);
  return !!pName && pName === eName;
}
