"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { VIEW_YEAR_COOKIE } from "@/lib/view-year";

// เลือกปีบัญชีที่จะดู - ทุกสิทธิ์ทำได้ มีผลกับผู้ใช้คนนี้ในเครื่องนี้เท่านั้น (ดู lib/view-year.ts)
export async function setViewYearAction(formData: FormData): Promise<void> {
  await requireUser();

  const year = Number(formData.get("year"));
  const target = Number.isInteger(year)
    ? await db.fiscalYear.findUnique({ where: { year }, select: { year: true, isActive: true } })
    : null;
  if (!target) return;

  const store = await cookies();
  if (target.isActive) {
    // กลับมาปีปัจจุบัน = ลบตัวเลือกทิ้ง พอส่วนกลางเปลี่ยนปีที่ใช้งาน ผู้ใช้จะตามไปปีใหม่เอง
    store.delete(VIEW_YEAR_COOKIE);
  } else {
    store.set(VIEW_YEAR_COOKIE, String(target.year), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath("/", "layout");
}
