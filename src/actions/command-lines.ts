"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageSystem } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

// ============================================================================
// Server Action สำหรับสายบังคับบัญชา (เฉพาะ ADMIN)
// ============================================================================
// สายบังคับบัญชาใช้จัดกลุ่มส่วนงานในหน้าภาพรวม เดิมอ่านจากไฟล์ Excel ของส่วนกลาง
// ย้ายมาเก็บในฐานข้อมูลเพื่อให้ส่วนกลางเพิ่มสาย เปลี่ยนชื่อ และย้ายส่วนงานข้ามสายได้เอง
//
// ทุกฟังก์ชันตรวจสิทธิ์เองที่บรรทัดแรก เพราะ Server Action ถูกเรียกตรงได้
// ============================================================================

export type FormState = { error: string | null; message?: string | null };

const NO_PERMISSION = "คุณไม่มีสิทธิ์จัดการสายบังคับบัญชา เฉพาะส่วนกลางเท่านั้นที่ทำได้";

function readName(formData: FormData): string | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (name === "") return { error: "กรุณากรอกชื่อสายบังคับบัญชา" };
  if (name.length > 100) return { error: "ชื่อสายบังคับบัญชายาวเกินไป (ไม่เกิน 100 ตัวอักษร)" };
  return name;
}

function revalidate() {
  revalidatePath("/admin/command-lines");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** เพิ่มสายใหม่ต่อท้ายรายการ */
export async function createCommandLineAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) return { error: NO_PERMISSION };

  const name = readName(formData);
  if (typeof name !== "string") return name;

  const last = await db.commandLine.findFirst({ orderBy: { sortOrder: "desc" } });
  try {
    const created = await db.commandLine.create({
      data: { name, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    await writeAudit({
      userId: actor.id,
      action: "COMMAND_LINE_CREATE",
      entity: "CommandLine",
      entityId: created.id,
      detail: { name },
    });
  } catch (error) {
    if (isDuplicateName(error)) return { error: `มีสาย "${name}" อยู่แล้ว` };
    throw error;
  }

  revalidate();
  return { error: null, message: `เพิ่มสาย "${name}" แล้ว` };
}

/** เปลี่ยนชื่อสาย */
export async function renameCommandLineAction(
  lineId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) return { error: NO_PERMISSION };

  const name = readName(formData);
  if (typeof name !== "string") return name;

  const existing = await db.commandLine.findUnique({ where: { id: lineId } });
  if (!existing) return { error: "ไม่พบสายบังคับบัญชานี้" };
  if (existing.name === name) return { error: null, message: "ชื่อไม่ได้เปลี่ยน" };

  try {
    await db.commandLine.update({ where: { id: lineId }, data: { name } });
  } catch (error) {
    if (isDuplicateName(error)) return { error: `มีสาย "${name}" อยู่แล้ว` };
    throw error;
  }

  await writeAudit({
    userId: actor.id,
    action: "COMMAND_LINE_RENAME",
    entity: "CommandLine",
    entityId: lineId,
    detail: { from: existing.name, to: name },
  });

  revalidate();
  return { error: null, message: "เปลี่ยนชื่อแล้ว" };
}

/** เลื่อนลำดับสายขึ้นหรือลงหนึ่งตำแหน่ง */
export async function moveCommandLineAction(
  lineId: string,
  direction: "up" | "down",
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) return { error: NO_PERMISSION };

  const lines = await db.commandLine.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const index = lines.findIndex((l) => l.id === lineId);
  if (index < 0) return { error: "ไม่พบสายบังคับบัญชานี้" };

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= lines.length) return { error: null };

  // ไล่เลขลำดับใหม่ทั้งชุดหลังสลับ กันกรณีเลขลำดับเดิมซ้ำกันแล้วสลับไม่ได้ผล
  const reordered = [...lines];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
  await db.$transaction(
    reordered.map((l, i) =>
      db.commandLine.update({ where: { id: l.id }, data: { sortOrder: i + 1 } })
    )
  );

  revalidate();
  return { error: null };
}

/**
 * ลบสาย
 *
 * ส่วนงานในสายนั้นไม่ถูกลบ แค่กลายเป็น "ยังไม่ระบุสาย" (onDelete: SetNull)
 * ต้องย้ายไปสายอื่นเองภายหลัง
 */
export async function deleteCommandLineAction(
  lineId: string,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) return { error: NO_PERMISSION };

  const existing = await db.commandLine.findUnique({
    where: { id: lineId },
    include: { _count: { select: { departments: true } } },
  });
  if (!existing) return { error: "ไม่พบสายบังคับบัญชานี้" };

  await db.commandLine.delete({ where: { id: lineId } });
  await writeAudit({
    userId: actor.id,
    action: "COMMAND_LINE_DELETE",
    entity: "CommandLine",
    entityId: lineId,
    detail: { name: existing.name, departments: existing._count.departments },
  });

  revalidate();
  return { error: null, message: `ลบสาย "${existing.name}" แล้ว` };
}

/**
 * บันทึกการจัดส่วนงานเข้าสาย ทั้งตารางในครั้งเดียว
 *
 * ช่อง `line_<departmentId>` = id ของสาย หรือ "" = ไม่ระบุสาย
 * ไล่จากส่วนงานในฐานข้อมูล ไม่เชื่อรายชื่อที่ฟอร์มส่งมา และรับเฉพาะ id สายที่มีอยู่จริง
 */
export async function saveLineAssignmentsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageSystem(actor)) return { error: NO_PERMISSION };

  const [departments, lines] = await Promise.all([
    db.department.findMany({ select: { id: true, code: true, commandLineId: true } }),
    db.commandLine.findMany({ select: { id: true, name: true } }),
  ]);
  const lineIds = new Set(lines.map((l) => l.id));
  const lineName = new Map(lines.map((l) => [l.id, l.name]));

  const changes: { code: string; from: string | null; to: string | null }[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const d of departments) {
    const raw = formData.get(`line_${d.id}`);
    if (raw === null) continue;
    const next = String(raw) === "" ? null : String(raw);
    if (next !== null && !lineIds.has(next)) {
      return { error: `ส่วนงาน ${d.code}: ไม่พบสายบังคับบัญชาที่เลือก กรุณาโหลดหน้าใหม่` };
    }
    if (next === d.commandLineId) continue;

    updates.push(db.department.update({ where: { id: d.id }, data: { commandLineId: next } }));
    changes.push({
      code: d.code,
      from: d.commandLineId ? (lineName.get(d.commandLineId) ?? null) : null,
      to: next ? (lineName.get(next) ?? null) : null,
    });
  }

  if (updates.length === 0) return { error: null, message: "ไม่มีส่วนงานที่ย้ายสาย" };

  await db.$transaction(updates);
  await writeAudit({
    userId: actor.id,
    action: "COMMAND_LINE_ASSIGN",
    entity: "Department",
    entityId: null,
    detail: { changes },
  });

  revalidate();
  return { error: null, message: `บันทึกแล้ว ย้ายสาย ${updates.length} ส่วนงาน` };
}
