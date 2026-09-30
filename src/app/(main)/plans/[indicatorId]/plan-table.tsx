"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { PlanSection } from "@prisma/client";
import type { FormState } from "@/actions/plans";
import type { MonthLocks } from "@/lib/submission-window";
import { deletePlanAttachmentAction } from "@/actions/plan-attachments";
import { fileKindLabel, formatBytes } from "@/lib/attachments";
import { DeleteAttachmentButton } from "../../reports/[indicatorId]/[quarter]/delete-attachment-button";
import { PlanEvidenceUpload } from "./plan-evidence-upload";
import {
  FISCAL_MONTHS,
  MONTH_COUNT,
  PLAN_SECTIONS,
  PLAN_SECTION_CAUSE_LABEL,
  PLAN_SECTION_CUM_LABEL,
  PLAN_SECTION_GUIDE,
  PLAN_SECTION_INDEX_LABEL,
  PLAN_SECTION_ITEM_LABEL,
  PLAN_SECTION_TITLE,
  PLAN_SECTION_YEAR_LABEL,
  formatPct,
  monthQuarter,
  summarizeSection,
} from "@/lib/plan";

// ============================================================================
// ตารางแผนดำเนินงานตามแบบฟอร์มเอกสารแนบ 4
// ============================================================================
// ทั้งหน้าเป็นฟอร์มเดียว คนกรอกไล่พิมพ์ทั้งตารางแล้วกดบันทึกครั้งเดียว
// เหมือนตอนกรอกในไฟล์ Excel ไม่ใช่กดบันทึกทีละบรรทัด
//
// ช่องตัวเลขเก็บใน state ของ React ด้วย เพราะคอลัมน์เปอร์เซ็นต์ต้องคิดใหม่
// ทันทีที่พิมพ์ ให้เห็นผลเหมือนสูตรใน Excel ไม่ต้องรอกดบันทึกก่อน
//
// ตาราง "ติดตามการดำเนินงานตามแผน" แบ่งเป็นกลุ่มตามค่าเกณฑ์ระดับ 1-5
//   แถวค่าเกณฑ์ล็อกไว้ (มาจาก MOU แก้ที่นี่ไม่ได้)
//   ใต้แต่ละระดับเพิ่มขั้นตอนการดำเนินงานได้ และมีช่องรายงานผลการดำเนินงานของระดับนั้น
//
// หลักฐานประกอบผลการดำเนินงานเป็นไฟล์แนบ อัปโหลดทันทีไม่ต้องรอกดบันทึก
// แนบได้ทุกบรรทัดที่เห็นบนจอ เพราะบรรทัดถูกสร้างในฐานข้อมูลตั้งแต่กดเพิ่มแล้ว
// ============================================================================

export type PlanCriterion = {
  level: number;
};

export type PlanFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type PlanRowData = {
  id: string;
  section: PlanSection;
  sortOrder: number;
  /** ค่าเกณฑ์ระดับที่ขั้นตอนนี้อยู่ใต้ (เฉพาะตาราง STEP) */
  criteriaLevel: number | null;
  title: string;
  targetValue: number | null;
  unit: string | null;
  planMonths: (number | null)[];
  actualMonths: (number | null)[];
  causeNote: string | null;
  correctiveAction: string | null;
  attachments: PlanFile[];
};

/** ช่องในตารางเก็บเป็นข้อความ ไม่ใช่ตัวเลข เพื่อให้พิมพ์ "1." ค้างไว้ได้โดยเลขไม่หาย */
type RowState = PlanRowData & { plan: string[]; actual: string[] };

const numText = (v: number | null) => (v === null ? "" : String(v));
const toNum = (v: string) => {
  const cleaned = v.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

function toRowState(rows: PlanRowData[]): RowState[] {
  return rows.map((r) => ({
    ...r,
    plan: r.planMonths.map(numText),
    actual: r.actualMonths.map(numText),
  }));
}

const cellInput =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1.5 text-right text-sm tabular-nums outline-none hover:border-slate-300 focus:border-brand-600 focus:bg-surface focus:ring-1 focus:ring-brand-600";
const textInput =
  "w-full rounded border border-slate-200 bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

function SaveButton({ label = "บันทึกแผน" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value="save"
      disabled={pending}
      className="min-h-11 rounded-lg bg-brand-700 px-5 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก..." : label}
    </button>
  );
}

/** ยืนยันแผน - บันทึกทั้งตารางก่อน แล้วล็อกโครงแผน */
function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value="confirm"
      disabled={pending}
      onClick={(e) => {
        // ยืนยันแล้วแก้โครงแผนเองไม่ได้อีก ต้องให้ส่วนกลางปลดล็อก จึงถามย้ำก่อน
        if (
          !window.confirm(
            "ยืนยันแผนดำเนินงาน?\n\nหลังยืนยันจะแก้แผนรายเดือน เป้าหมายตัวชี้วัด ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานไม่ได้อีก (ต้องให้ส่วนกลางปลดล็อก)",
          )
        ) {
          e.preventDefault();
        }
      }}
      className="min-h-11 rounded-lg border border-brand-600 bg-surface px-5 text-sm font-medium text-brand-ink transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      ยืนยันแผน
    </button>
  );
}

/** ปลดล็อกแผน (เฉพาะส่วนกลาง) */
function UnlockButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value="unlock"
      disabled={pending}
      className="min-h-11 rounded-lg border border-slate-300 px-5 text-sm font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      ปลดล็อกแผน
    </button>
  );
}

export function PlanTable({
  action,
  canEdit,
  header,
  rows,
  monthsElapsed,
  fiscalYear,
  indicatorId,
  criteria,
  levelReports,
  locks,
  confirmedLabel,
  structureLocked,
  canUnlock,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  canEdit: boolean;
  header: { owner: string; budget: string };
  rows: PlanRowData[];
  monthsElapsed: number;
  fiscalYear: number;
  indicatorId: string;
  /** ค่าเกณฑ์ระดับ 1-5 ของตัวชี้วัด ใช้เป็นหัวกลุ่มของตารางขั้นตอนการดำเนินงาน */
  criteria: PlanCriterion[];
  /** รายงานผลการดำเนินงานของแต่ละระดับ key = ระดับ */
  levelReports: Record<number, string>;
  /** เดือนที่ล็อกไว้ (ไตรมาสที่ผ่านไปแล้ว) ช่อง 0 = ต.ค. */
  locks: MonthLocks;
  /** ยืนยันแผนเมื่อไร (ข้อความแสดงผล) - null = ยังไม่ยืนยัน */
  confirmedLabel: string | null;
  /** ยืนยันแผนแล้ว และผู้ใช้คนนี้แก้โครงแผนไม่ได้ (ผู้รับผิดชอบส่วนงาน) */
  structureLocked: boolean;
  /** แสดงปุ่มปลดล็อกแผน (ส่วนกลาง) */
  canUnlock: boolean;
}) {
  // โครงแผน = ชื่อรายการ ค่าเป้าหมาย หน่วยนับ แผนรายเดือน และการเพิ่ม/ลบบรรทัด
  // ยืนยันแผนแล้วล็อกทั้งหมด แต่ยังกรอกผล สาเหตุ แนวทางแก้ไข หลักฐาน และรายงานรายระดับได้
  const editStructure = canEdit && !structureLocked;
  const [state, formAction] = useActionState(action, {
    error: null,
  } as FormState);
  const [data, setData] = useState<RowState[]>(() => toRowState(rows));

  // เมื่อเซิร์ฟเวอร์ส่งข้อมูลชุดใหม่มา (บันทึก/เพิ่ม/ลบบรรทัดสำเร็จ)
  // ต้องเอาของจากเซิร์ฟเวอร์เป็นหลัก ไม่งั้นบรรทัดที่เพิ่งเพิ่มจะไม่โผล่
  const signature = useMemo(() => rows.map((r) => r.id).join(","), [rows]);
  useEffect(() => {
    setData(toRowState(rows));
    // ผูกกับ signature อย่างเดียว ถ้าผูกกับ rows ทั้งก้อนจะรีเซ็ตทุกครั้งที่หน้า render
    // ทำให้สิ่งที่กำลังพิมพ์ค้างไว้หายไปกลางคัน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ไฟล์แนบอ่านจาก props ตรงๆ ไม่เก็บใน state
  // เพราะหลังอัปโหลดหน้าจะดึงข้อมูลใหม่ ถ้าอ่านจาก state ไฟล์ที่เพิ่งแนบจะไม่โผล่
  // และจะรีเซ็ต state ให้ไฟล์โผล่ก็ไม่ได้ ตัวเลขที่พิมพ์ค้างไว้จะหาย
  const filesByRow = useMemo(
    () => new Map(rows.map((r) => [r.id, r.attachments])),
    [rows],
  );

  // ผู้ใช้เลือกได้ว่าจะคิดยอดสะสมถึงเดือนไหน ค่าเริ่มต้นคือเดือนปัจจุบัน
  // (แบบฟอร์มต้นฉบับให้ผู้กรอกแก้ช่วงในสูตรเอง ซึ่งพลาดง่ายมาก)
  // บีบให้อยู่ในช่วง 1-12 เสมอ เพราะปีบัญชีที่ยังมาไม่ถึงจะได้ค่า 0
  // ซึ่งไม่ตรงกับตัวเลือกไหนเลย แล้วช่องเลือกจะแสดงไม่ตรงกับที่คิดจริง
  const [upto, setUpto] = useState(
    Math.min(MONTH_COUNT, Math.max(1, monthsElapsed)),
  );

  const setCell = (
    rowId: string,
    field: "plan" | "actual",
    monthIndex: number,
    value: string,
  ) => {
    setData((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              [field]: r[field].map((v, i) => (i === monthIndex ? value : v)),
            }
          : r,
      ),
    );
  };

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      {state.success && state.message && (
        <p
          role="status"
          className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900"
        >
          {state.message}
        </p>
      )}

      {/* ---- สถานะการยืนยันแผน ---- */}
      {confirmedLabel ? (
        <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-700 shadow-sm">
          <span className="font-medium text-emerald-800">✓ ยืนยันแผนแล้ว</span> เมื่อ {confirmedLabel} ·{" "}
          {structureLocked
            ? "แผนรายเดือน เป้าหมายตัวชี้วัด ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานถูกล็อก ติดต่อส่วนกลางหากต้องแก้แผน"
            : "ผู้รับผิดชอบส่วนงานแก้โครงแผนไม่ได้แล้ว ส่วนกลางยังแก้ได้ หรือกดปลดล็อกแผนให้ส่วนงานแก้เอง"}
        </p>
      ) : (
        canEdit && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            กรอกแผนให้ครบแล้วกด <strong>ยืนยันแผน</strong> ด้านล่าง จึงจะรายงานผลรายไตรมาสได้ ·
            หลังยืนยันจะแก้แผนรายเดือน เป้าหมาย ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานไม่ได้อีก
          </p>
        )
      )}

      {/* ---- ส่วนหัวของแบบฟอร์ม ---- */}
      <section className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="font-semibold">ข้อมูลหัวแบบฟอร์ม</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="owner" className="mb-1.5 block text-sm font-medium">
              ผู้รับผิดชอบตัวชี้วัด
            </label>
            <input
              id="owner"
              name="owner"
              defaultValue={header.owner}
              readOnly={!canEdit}
              placeholder="เช่น การยางแห่งประเทศไทยเขตภาคเหนือ/กองแผนและวิชาการ"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none read-only:bg-slate-50 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <div>
            <label
              htmlFor="budget"
              className="mb-1.5 block text-sm font-medium"
            >
              งบประมาณ
            </label>
            <input
              id="budget"
              name="budget"
              defaultValue={header.budget}
              readOnly={!canEdit}
              placeholder="เช่น 71,000 บาท"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none read-only:bg-slate-50 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
        </div>
      </section>

      {/* ---- ตัวเลือกเดือนที่ใช้คิดยอดสะสม ---- */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm shadow-sm">
        <label htmlFor="upto" className="font-medium">
          คิดยอดสะสมถึงเดือน
        </label>
        <select
          id="upto"
          value={upto}
          onChange={(e) => setUpto(Number(e.target.value))}
          className="min-h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        >
          {FISCAL_MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <span className="text-slate-500">
          ปีบัญชี {fiscalYear} · ค่าเริ่มต้นคือเดือนปัจจุบัน
        </span>

        {/* ปุ่มดาวน์โหลดอยู่ตรงนี้เพราะต้องส่งเดือนที่เลือกไปด้วย
            ไฟล์ที่ได้จะคิดยอดสะสมช่วงเดียวกับที่เห็นบนหน้าจอพอดี */}
        <a
          href={`/api/export/plan/${indicatorId}?upto=${upto}`}
          className="ml-auto inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium transition hover:bg-slate-50"
        >
          ดาวน์โหลดเป็น Excel
        </a>
      </div>

      {canEdit && (structureLocked || locks.plan.some(Boolean) || locks.actual.some(Boolean)) && (
        <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="mt-0.5 inline-block h-4 w-6 shrink-0 rounded border border-slate-200 bg-slate-100" aria-hidden="true" />
          <span>
            ช่องสีเทาแก้ไขไม่ได้ · ช่อง &quot;ผล&quot; กรอกได้เฉพาะเดือนในไตรมาสที่เปิดรายงานอยู่ ·
            ช่อง &quot;แผน&quot; ของไตรมาสที่ผ่านไปแล้วล็อกไว้ แก้ย้อนหลังไม่ได้
          </span>
        </p>
      )}

      {PLAN_SECTIONS.map((section) => (
        <SectionTable
          key={section}
          section={section}
          canEdit={canEdit}
          editStructure={editStructure}
          rows={data.filter((r) => r.section === section)}
          upto={upto}
          onCell={setCell}
          filesByRow={filesByRow}
          criteria={criteria}
          levelReports={levelReports}
          locks={locks}
        />
      ))}

      {canEdit && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <SaveButton label={confirmedLabel ? "บันทึก" : "บันทึกแผน"} />
          {!confirmedLabel && <ConfirmButton />}
          {canUnlock && <UnlockButton />}
          <span className="text-sm text-slate-600">
            ตัวเลขที่พิมพ์จะยังไม่ถูกเก็บจนกว่าจะกดบันทึก
          </span>
        </div>
      )}
    </form>
  );
}

/** จำนวนคอลัมน์ของตาราง ใช้กับแถวที่กินเต็มความกว้าง */
function columnCount(canEdit: boolean) {
  // ลำดับ · รายการ · ค่าเป้าหมาย · หน่วย · แผน/ผล · 12 เดือน
  // · สะสม · ทั้งปี · สาเหตุ · แนวทางแก้ไข · หลักฐาน · (ลบ)
  return 5 + MONTH_COUNT + 5 + (canEdit ? 1 : 0);
}

function SectionTable({
  section,
  canEdit,
  editStructure,
  rows,
  upto,
  onCell,
  filesByRow,
  criteria,
  levelReports,
  locks,
}: {
  section: PlanSection;
  canEdit: boolean;
  /** แก้โครงแผนได้ (ชื่อรายการ ค่าเป้าหมาย หน่วยนับ แผนรายเดือน เพิ่ม/ลบบรรทัด) */
  editStructure: boolean;
  rows: RowState[];
  upto: number;
  onCell: (
    rowId: string,
    field: "plan" | "actual",
    monthIndex: number,
    value: string,
  ) => void;
  filesByRow: Map<string, PlanFile[]>;
  criteria: PlanCriterion[];
  levelReports: Record<number, string>;
  locks: MonthLocks;
}) {
  const isStep = section === "STEP";
  const levels = criteria.map((c) => c.level);

  // ตาราง STEP เรียงตามระดับก่อน แล้วตามลำดับในระดับ
  // แถวเก่าที่ยังไม่ระบุระดับ (สร้างก่อนแยกตามระดับ) ไปรวมไว้ท้ายตาราง ไม่ให้หายไปเฉยๆ
  const orphans = isStep
    ? rows.filter(
        (r) => r.criteriaLevel === null || !levels.includes(r.criteriaLevel),
      )
    : [];
  const ordered = isStep
    ? [
        ...levels.flatMap((l) => rows.filter((r) => r.criteriaLevel === l)),
        ...orphans,
      ]
    : rows;

  const summary = summarizeSection(
    ordered.map((r) => ({
      planMonths: r.plan.map(toNum),
      actualMonths: r.actual.map(toNum),
    })),
    upto,
  );
  const summaryById = new Map(ordered.map((r, i) => [r.id, summary.rows[i]]));
  const cols = columnCount(editStructure);

  const renderRows = (list: RowState[], prefix: string) =>
    list.map((row, index) => {
      const rowSummary = summaryById.get(row.id)!;
      return (
        <RowPair
          key={row.id}
          row={row}
          label={`${prefix}${index + 1}`}
          canEdit={canEdit}
          editStructure={editStructure}
          cumPct={rowSummary.cumPct}
          yearPct={rowSummary.yearPct}
          onCell={onCell}
          files={filesByRow.get(row.id) ?? []}
          locks={locks}
        />
      );
    });

  // บรรทัดสรุปท้ายตาราง ตรงกับสูตร AVERAGE ในไฟล์ต้นฉบับ
  const averageRow = (
    <tr className="bg-slate-50 font-medium">
      <td colSpan={5 + MONTH_COUNT} className="border border-slate-200 px-3 py-2.5">
        <span className="sticky left-3">ค่าเฉลี่ยร้อยละผลการดำเนินงานตามเป้าหมาย</span>
      </td>
      <td className="border border-slate-200 px-2 py-2.5 text-right tabular-nums text-brand-ink">
        {formatPct(summary.avgCumPct)}
      </td>
      <td className="border border-slate-200 px-2 py-2.5 text-right tabular-nums text-brand-ink">
        {formatPct(summary.avgYearPct)}
      </td>
      <td colSpan={editStructure ? 4 : 3} className="border border-slate-200" />
    </tr>
  );

  const showTable = isStep
    ? levels.length > 0 || rows.length > 0
    : rows.length > 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <h2 className="font-semibold">{PLAN_SECTION_TITLE[section]}</h2>
        {isStep && (
          <p className="mt-0.5 text-sm text-slate-600">
            ค่าเกณฑ์ระดับ 1-5 มาจาก MOU แก้ไขที่นี่ไม่ได้ ·
            เพิ่มขั้นตอนการดำเนินงานใต้แต่ละระดับ
            และรายงานผลการดำเนินงานของระดับนั้น
          </p>
        )}
      </div>

      {!showTable ? (
        <p className="px-4 py-5 text-sm text-slate-600 sm:px-5">
          {isStep
            ? "ตัวชี้วัดนี้ยังไม่มีค่าเกณฑ์ระดับ จึงยังเพิ่มขั้นตอนการดำเนินงานไม่ได้ ติดต่อส่วนกลาง"
            : `ยังไม่มี${PLAN_SECTION_ITEM_LABEL[section]}ในตารางนี้`}
        </p>
      ) : !isStep ? (
        // ตารางเป้าหมายมักสั้น จำกัดความสูงไว้ให้แถบเลื่อนแนวนอนอยู่ในจอเสมอ
        // และหัวตารางลอยค้างด้านบนกรอบ
        <TableFrame canEdit={editStructure} className="max-h-[70vh] overflow-auto">
          <thead className="sticky top-0 z-10">
            <HeaderRow section={section} canEdit={editStructure} />
          </thead>
          <tbody>
            {renderRows(rows, "")}
            {averageRow}
          </tbody>
        </TableFrame>
      ) : (
        // ตารางขั้นตอนยาวลงไปตามธรรมชาติ ไม่มีกรอบเลื่อนขึ้นลงของตัวเอง
        // แยกเป็นตารางละหนึ่งค่าเกณฑ์ แต่ละตารางจึงสั้น แถบเลื่อนแนวนอนอยู่ใต้ตารางของระดับนั้นเลย
        // (ถ้ารวมเป็นตารางเดียว แถบเลื่อนแนวนอนจะไปอยู่ล่างสุด ต้องเลื่อนหน้าลงไปหาไกลมาก)
        <div className="space-y-5 p-3 sm:p-4">
          {criteria.map((c) => {
            const steps = rows.filter((r) => r.criteriaLevel === c.level);
            return (
              <TableFrame key={c.level} canEdit={editStructure} className="overflow-x-auto">
                <tbody>
                  <LevelGroup
                    section={section}
                    criterion={c}
                    cols={cols}
                    canEdit={canEdit}
                    editStructure={editStructure}
                    stepCount={steps.length}
                    report={levelReports[c.level] ?? ""}
                  >
                    {renderRows(steps, `${c.level}.`)}
                  </LevelGroup>
                </tbody>
              </TableFrame>
            );
          })}

          {orphans.length > 0 && (
            <TableFrame canEdit={editStructure} className="overflow-x-auto">
              <tbody>
                <tr className="bg-amber-50">
                  <td
                    colSpan={cols}
                    className="border border-slate-200 px-3 py-2 text-sm font-medium text-amber-900"
                  >
                    <span className="sticky left-3">
                      ขั้นตอนที่ยังไม่ระบุค่าเกณฑ์ระดับ (บันทึกไว้ก่อนแยกตามระดับ) · ถ้าไม่ใช้แล้วกดลบได้
                    </span>
                  </td>
                </tr>
                <HeaderRow section={section} canEdit={editStructure} />
                {renderRows(orphans, "")}
              </tbody>
            </TableFrame>
          )}

          {/* สรุปท้ายตาราง เป็นกล่องแยกแทนแถวในตาราง
              เพราะตารางขั้นตอนแยกเป็นหลายตาราง แถวค่าเฉลี่ยที่อยู่ตารางสุดท้ายจะไม่มีหัวคอลัมน์กำกับ
              ผู้อ่านไม่รู้ว่าตัวเลขสองตัวคืออะไร จึงเขียนชื่อกำกับไว้ตรงตัวเลขเลย */}
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
            <h3 className="font-semibold text-brand-900">
              ค่าเฉลี่ยร้อยละผลการดำเนินงานตามเป้าหมาย
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              เฉลี่ยจากทุกขั้นตอนการดำเนินงาน {ordered.length.toLocaleString("th-TH")} ขั้นตอน
              ทุกค่าเกณฑ์ · แต่ละขั้นตอนมีน้ำหนักเท่ากัน
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-surface p-3 shadow-sm">
                <dt className="text-sm text-slate-600">{PLAN_SECTION_CUM_LABEL[section]}</dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-brand-ink">
                  {formatPct(summary.avgCumPct)}
                </dd>
                <p className="text-xs text-slate-500">
                  ผลสะสมเทียบแผนสะสม ตั้งแต่ ต.ค. ถึง {FISCAL_MONTHS[upto - 1]}
                </p>
              </div>
              <div className="rounded-lg bg-surface p-3 shadow-sm">
                <dt className="text-sm text-slate-600">{PLAN_SECTION_YEAR_LABEL[section]}</dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-brand-ink">
                  {formatPct(summary.avgYearPct)}
                </dd>
                <p className="text-xs text-slate-500">ผลรวมทั้งปีเทียบแผนทั้งปี (ต.ค. ถึง ก.ย.)</p>
              </div>
            </dl>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-slate-200 p-4 sm:p-5">
        {editStructure && !isStep && (
          <button
            type="submit"
            name="intent"
            value={`add:${section}`}
            className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-brand-ink transition hover:border-brand-600 hover:bg-brand-50"
          >
            + เพิ่ม{PLAN_SECTION_ITEM_LABEL[section]}อีกหนึ่งบรรทัด
          </button>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          {PLAN_SECTION_GUIDE[section]}
        </p>
      </div>
    </section>
  );
}

/**
 * กลุ่มของค่าเกณฑ์หนึ่งระดับในตารางขั้นตอนการดำเนินงาน
 *
 * แถวค่าเกณฑ์ (ล็อก) → หัวตาราง → ขั้นตอนการดำเนินงาน → ปุ่มเพิ่มขั้นตอน → ช่องรายงานผลของระดับ
 */
function LevelGroup({
  section,
  criterion,
  cols,
  canEdit,
  editStructure,
  stepCount,
  report,
  children,
}: {
  section: PlanSection;
  criterion: PlanCriterion;
  cols: number;
  canEdit: boolean;
  editStructure: boolean;
  stepCount: number;
  report: string;
  children: React.ReactNode;
}) {
  // ช่องกว้างที่กินหลายคอลัมน์ ให้ข้อความติดขอบซ้ายของกรอบที่มองเห็นเสมอ
  // ไม่งั้นพอเลื่อนตารางไปดูเดือนท้ายๆ ข้อความจะหลุดจอไปทางซ้าย
  const stick = "sticky left-3 inline-block max-w-[56rem]";

  return (
    <>
      <tr className="bg-brand-50">
        <td colSpan={cols} className="border border-slate-300 px-3 py-2.5">
          <span className="sticky left-3 inline-flex items-center gap-1.5 font-semibold text-brand-ink">
            <LockIcon />
            ค่าเกณฑ์ระดับ {criterion.level}
          </span>
        </td>
      </tr>

      <HeaderRow section={section} canEdit={editStructure} />

      {children}

      {stepCount === 0 && (
        <tr>
          <td
            colSpan={cols}
            className="border border-slate-200 px-3 py-2 text-sm text-slate-500"
          >
            <span className={stick}>
              ยังไม่มีขั้นตอนการดำเนินงานของระดับนี้
            </span>
          </td>
        </tr>
      )}

      {editStructure && (
        <tr>
          <td colSpan={cols} className="border border-slate-200 px-3 py-2">
            <button
              type="submit"
              name="intent"
              value={`add:STEP:${criterion.level}`}
              className="sticky left-3 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-brand-ink transition hover:border-brand-600 hover:bg-brand-50"
            >
              + เพิ่มขั้นตอนการดำเนินงานของระดับ {criterion.level}
            </button>
          </td>
        </tr>
      )}

      <tr>
        <td colSpan={cols} className="border border-slate-200 px-3 py-2">
          <div className={`${stick} w-[56rem]`}>
            <label
              htmlFor={`levelReport_${criterion.level}`}
              className="mb-1 block text-sm font-medium"
            >
              รายงานผลการดำเนินงานของระดับ {criterion.level}
            </label>
            <textarea
              id={`levelReport_${criterion.level}`}
              name={`levelReport_${criterion.level}`}
              defaultValue={report}
              readOnly={!canEdit}
              rows={3}
              placeholder={
                canEdit ? "ผลที่เกิดขึ้นจริงเทียบกับค่าเกณฑ์ระดับนี้" : ""
              }
              className={`${textInput} resize-y read-only:bg-slate-50`}
            />
          </div>
        </td>
      </tr>
    </>
  );
}

/**
 * กรอบตาราง + ความกว้างคอลัมน์ตายตัว ใช้ทุกตารางในแผน ทุกตารางจึงมีคอลัมน์ตรงแนวกัน
 *
 * table-fixed + colgroup: ถ้าปล่อยให้เบราว์เซอร์จัดเอง คอลัมน์ข้อความยาวจะไปบีบช่องตัวเลข
 * จนเลข "100" เหลือ "10" ทั้งที่ตารางเลื่อนแนวนอนได้อยู่แล้ว
 * ตารางกว้างกว่าจอเสมอเพราะมี 12 เดือน จึงเลื่อนแนวนอนในกรอบตัวเอง ไม่ให้ทั้งหน้าเลื่อนซ้ายขวา
 */
function TableFrame({
  canEdit,
  className,
  children,
}: {
  canEdit: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <table className="w-[124rem] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-14" />
          <col className="w-72" />
          <col className="w-24" />
          <col className="w-20" />
          <col className="w-16" />
          {FISCAL_MONTHS.map((m) => (
            <col key={m} className="w-12" />
          ))}
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-48" />
          <col className="w-40" />
          <col className="w-52" />
          {canEdit && <col className="w-16" />}
        </colgroup>
        {children}
      </table>
    </div>
  );
}

/** แถวหัวคอลัมน์ของตารางแผน ใช้ทั้งหัวตารางเป้าหมาย และหัวตารางซ้ำของแต่ละค่าเกณฑ์ */
function HeaderRow({ section, canEdit }: { section: PlanSection; canEdit: boolean }) {
  return (
    <tr className="bg-slate-50 text-slate-700 shadow-[0_1px_0_0_var(--color-slate-200)]">
      <Th>{PLAN_SECTION_INDEX_LABEL[section]}</Th>
      <Th className="text-left">{PLAN_SECTION_ITEM_LABEL[section]}</Th>
      <Th>ค่าเป้าหมาย</Th>
      <Th>หน่วยนับ</Th>
      <Th>แผน/ผล</Th>
      {FISCAL_MONTHS.map((m, i) => (
        <Th key={m} className={i % 3 === 0 ? "border-l-2 border-l-slate-300" : ""}>
          {m}
        </Th>
      ))}
      <Th className="border-l-2 border-l-slate-300">{PLAN_SECTION_CUM_LABEL[section]}</Th>
      <Th>{PLAN_SECTION_YEAR_LABEL[section]}</Th>
      <Th className="text-left">{PLAN_SECTION_CAUSE_LABEL[section]}</Th>
      <Th className="text-left">แนวทางการดำเนินการแก้ไข</Th>
      <Th className="text-left">หลักฐานประกอบผลการดำเนินงาน</Th>
      {canEdit && <Th>ลบ</Th>}
    </tr>
  );
}

function LockIcon() {
  return (
    <svg
      aria-label="ล็อก"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function RowPair({
  row,
  label,
  canEdit,
  editStructure,
  cumPct,
  yearPct,
  onCell,
  files,
  locks,
}: {
  row: RowState;
  /** เลขลำดับที่แสดง เช่น "2" หรือ "3.1" (ขั้นที่ 1 ของระดับ 3) */
  label: string;
  canEdit: boolean;
  editStructure: boolean;
  cumPct: number;
  yearPct: number;
  onCell: (
    rowId: string,
    field: "plan" | "actual",
    monthIndex: number,
    value: string,
  ) => void;
  files: PlanFile[];
  locks: MonthLocks;
}) {
  // 1 รายการกินสองบรรทัด (แผน/ผล) ช่องที่ใช้ร่วมกันจึงใช้ rowSpan
  // ให้หน้าตาตรงกับแบบฟอร์มกระดาษ
  const shared = "border border-slate-200 px-2 py-1.5 align-top";

  // บรรทัดที่มีตัวเลขในเดือนที่ล็อกลบไม่ได้ (เซิร์ฟเวอร์ก็ปฏิเสธเหมือนกัน)
  const hasLockedData =
    row.planMonths.some((v, i) => locks.plan[i] && v !== null) ||
    row.actualMonths.some((v, i) => locks.actual[i] && v !== null);

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td rowSpan={2} className={`${shared} text-center tabular-nums`}>
          {label}
        </td>
        <td rowSpan={2} className={shared}>
          <textarea
            name={`title_${row.id}`}
            defaultValue={row.title}
            readOnly={!editStructure}
            rows={2}
            placeholder="พิมพ์ชื่อรายการ"
            className={`${textInput} resize-y read-only:bg-slate-50`}
          />
        </td>
        <td rowSpan={2} className={shared}>
          <input
            name={`target_${row.id}`}
            defaultValue={
              row.targetValue === null ? "" : String(row.targetValue)
            }
            readOnly={!editStructure}
            inputMode="decimal"
            className={`${textInput} text-right tabular-nums read-only:bg-slate-50`}
          />
        </td>
        <td rowSpan={2} className={shared}>
          <input
            name={`unit_${row.id}`}
            defaultValue={row.unit ?? ""}
            readOnly={!editStructure}
            placeholder="ไร่ / ครั้ง"
            className={`${textInput} read-only:bg-slate-50`}
          />
        </td>

        <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-medium">
          แผน
        </td>
        {row.plan.map((value, i) => (
          <MonthCell
            key={i}
            name={`p${i}_${row.id}`}
            value={value}
            readOnly={!editStructure || locks.plan[i]}
            locked={canEdit && (!editStructure || locks.plan[i])}
            monthIndex={i}
            label={`แผนเดือน${FISCAL_MONTHS[i]}`}
            onChange={(v) => onCell(row.id, "plan", i, v)}
          />
        ))}

        <td
          rowSpan={2}
          className={`${shared} border-l-2 border-l-slate-300 text-right font-medium tabular-nums text-brand-ink`}
        >
          {formatPct(cumPct)}
        </td>
        <td
          rowSpan={2}
          className={`${shared} text-right font-medium tabular-nums text-brand-ink`}
        >
          {formatPct(yearPct)}
        </td>

        <td rowSpan={2} className={shared}>
          <textarea
            name={`cause_${row.id}`}
            defaultValue={row.causeNote ?? ""}
            readOnly={!canEdit}
            rows={2}
            className={`${textInput} resize-y read-only:bg-slate-50`}
          />
        </td>
        <td rowSpan={2} className={shared}>
          <textarea
            name={`fix_${row.id}`}
            defaultValue={row.correctiveAction ?? ""}
            readOnly={!canEdit}
            rows={2}
            className={`${textInput} resize-y read-only:bg-slate-50`}
          />
        </td>
        <td rowSpan={2} className={shared}>
          <EvidenceFiles
            files={files}
            canEdit={canEdit}
            actionPlanId={row.id}
          />
        </td>

        {editStructure && (
          <td rowSpan={2} className={`${shared} text-center`}>
            {hasLockedData ? (
              <span
                className="text-xs text-slate-400"
                title="มีข้อมูลในไตรมาสที่ปิดไปแล้ว จึงลบไม่ได้"
              >
                ลบไม่ได้
              </span>
            ) : (
              <button
                type="submit"
                name="intent"
                value={`delete:${row.id}`}
                className="min-h-11 rounded-lg px-2 text-sm text-red-700 transition hover:bg-red-50"
                aria-label={`ลบบรรทัดที่ ${label}`}
              >
                ลบ
              </button>
            )}
          </td>
        )}
      </tr>

      <tr className="hover:bg-slate-50/60">
        <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-medium">
          ผล
        </td>
        {row.actual.map((value, i) => (
          <MonthCell
            key={i}
            name={`a${i}_${row.id}`}
            value={value}
            readOnly={!canEdit || locks.actual[i]}
            locked={canEdit && locks.actual[i]}
            monthIndex={i}
            label={`ผลเดือน${FISCAL_MONTHS[i]}`}
            onChange={(v) => onCell(row.id, "actual", i, v)}
          />
        ))}
      </tr>
    </>
  );
}

/** ช่องหลักฐานประกอบผลการดำเนินงาน: รายชื่อไฟล์ + ปุ่มแนบเอกสาร */
function EvidenceFiles({
  files,
  canEdit,
  actionPlanId,
}: {
  files: PlanFile[];
  canEdit: boolean;
  actionPlanId: string;
}) {
  return (
    <div className="space-y-1.5">
      {files.length === 0 && !canEdit && (
        <p className="text-xs text-slate-400">ไม่มีไฟล์แนบ</p>
      )}
      {files.map((f) => (
        <div key={f.id} className="rounded bg-slate-50 px-2 py-1">
          <a
            href={`/api/plan-attachments/${f.id}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-brand-ink underline-offset-2 hover:underline"
            title={f.originalName}
          >
            {f.originalName}
          </a>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {fileKindLabel(f.mimeType)} · {formatBytes(f.sizeBytes)}
            </span>
            {canEdit && (
              <DeleteAttachmentButton
                action={deletePlanAttachmentAction.bind(null, f.id)}
              />
            )}
          </div>
        </div>
      ))}
      {canEdit && <PlanEvidenceUpload actionPlanId={actionPlanId} />}
    </div>
  );
}

function MonthCell({
  name,
  value,
  readOnly,
  locked = false,
  monthIndex,
  label,
  onChange,
}: {
  name: string;
  value: string;
  readOnly: boolean;
  /** ล็อกเพราะไตรมาสปิดแล้ว (ต่างจาก readOnly เพราะไม่มีสิทธิ์ ซึ่งไม่ต้องแต้มสี) */
  locked?: boolean;
  monthIndex: number;
  label: string;
  onChange: (value: string) => void;
}) {
  // ตีเส้นหนาทุก 3 เดือน ให้มองออกว่าไตรมาสไหนถึงไหน
  const quarterEdge =
    monthIndex % 3 === 0 ? "border-l-2 border-l-slate-300" : "";

  return (
    <td
      className={`border border-slate-200 p-0 ${quarterEdge} ${locked ? "bg-slate-100" : ""}`}
      title={locked ? "แก้ไขได้เฉพาะเดือนในไตรมาสที่เปิดรายงานอยู่" : undefined}
    >
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        inputMode="decimal"
        aria-label={`${label} (ไตรมาส ${monthQuarter(monthIndex)}${locked ? " ล็อกแล้ว" : ""})`}
        className={locked ? `${cellInput} cursor-not-allowed text-slate-500 hover:border-transparent` : cellInput}
      />
    </td>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border border-slate-200 px-2 py-2 text-center font-medium ${className}`}
    >
      {children}
    </th>
  );
}
