"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import type { PlanSection } from "@prisma/client";
import type { FormState } from "@/actions/plans";
import type { MonthLocks } from "@/lib/submission-window";
import { deletePlanAttachmentAction } from "@/actions/plan-attachments";
import {
  MAX_FILE_BYTES,
  MAX_PLAN_FILES_PER_ROW,
  fileKindLabel,
  formatBytes,
} from "@/lib/attachments";
import { DeleteAttachmentButton } from "../../reports/[indicatorId]/[quarter]/delete-attachment-button";
import { PlanEvidenceUpload } from "./plan-evidence-upload";
import { SuccessDialog } from "@/components/success-dialog";
import { DueBadge, ReturnDueInput, hasReturnDueDate } from "@/components/return-due-input";
import { COMMENT_HEADING, COMMENT_MAX_LENGTH, levelCommentKey } from "@/lib/review-comments";
import {
  FISCAL_MONTHS,
  MONTH_COUNT,
  PLAN_SECTIONS,
  PLAN_SECTION_CAUSE_LABEL,
  PLAN_SECTION_AVG_LABEL,
  PLAN_SECTION_CUM_LABEL,
  PLAN_SECTION_GUIDE,
  PLAN_SECTION_INDEX_LABEL,
  PLAN_SECTION_ITEM_LABEL,
  PLAN_SECTION_TITLE,
  PLAN_SECTION_YEAR_LABEL,
  formatPct,
  formatPlanNumber,
  LEVEL_REPORT_MAX_WORDS,
  countWords,
  monthQuarter,
  planRowLabel,
  sumMonths,
  summarizeSection,
  targetMismatch,
  type PlanLevelGroup,
  type PlanRowSummary,
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
// ตาราง "ติดตามการดำเนินงานตามแผน" แบ่งเป็นกลุ่มตามค่าเกณฑ์ระดับ 1-5 และเงื่อนไขอื่นๆ (ถ้ามี)
//   แถวค่าเกณฑ์และคำอธิบายเกณฑ์ล็อกไว้ (มาจาก MOU แก้ที่นี่ไม่ได้)
//   ใต้แต่ละระดับเพิ่มขั้นตอนการดำเนินงานได้ และมีช่องรายงานผลการดำเนินงานของระดับนั้น
//
// หลักฐานประกอบผลการดำเนินงานเป็นไฟล์แนบ อัปโหลดทันทีไม่ต้องรอกดบันทึก
// แนบได้ทุกบรรทัดที่เห็นบนจอ เพราะบรรทัดถูกสร้างในฐานข้อมูลตั้งแต่กดเพิ่มแล้ว
//
// ตารางเดียวกันใช้สองหน้า (mode):
//   plan    หน้าแผนดำเนินงาน: ส่วนหัว + รายการ + แผนรายเดือน · บันทึกร่างแผน / ส่งแผน
//   report  หน้ารายงานผล: แผนแสดงอย่างเดียว กรอกผลรายเดือน สาเหตุ แนวทางแก้ไข หลักฐาน รายงานรายระดับ
// ช่องของอีกหน้าไม่มี name จึงไม่ถูกส่งไป เซิร์ฟเวอร์คงค่าเดิมไว้ให้
// ============================================================================

/** กลุ่มของตารางขั้นตอน - สร้างด้วย planLevelGroups() */
export type PlanCriterion = PlanLevelGroup;

export type PlanTableMode = "plan" | "report";

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
type RowState = PlanRowData & { target: string; plan: string[]; actual: string[] };

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
    target: numText(r.targetValue),
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

/** ส่งแผนการดำเนินงาน (หัวหน้าส่วนงาน/หน่วยงาน หรือส่วนกลาง) - บันทึกทั้งตารางก่อน แล้วล็อกโครงแผน */
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
            "ส่งแผนการดำเนินงาน?\n\nหลังส่งจะแก้แผนรายเดือน เป้าหมายตัวชี้วัด ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานไม่ได้อีก (ต้องให้ส่วนกลางตีกลับ)",
          )
        ) {
          e.preventDefault();
        }
      }}
      className="min-h-11 rounded-lg border border-brand-600 bg-surface px-5 text-sm font-medium text-brand-ink transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      ส่งแผนการดำเนินงาน
    </button>
  );
}

// ----------------------------------------------------------------------------
// ข้อสังเกต: กล่องสีแดงใต้เป้าหมายตัวชี้วัด และใต้ค่าเกณฑ์แต่ละระดับ
// ----------------------------------------------------------------------------
// ส่วนกลางเขียนได้ (ช่องชื่อ comment_<section>) ส่วนงานเห็นแบบอ่านอย่างเดียวเมื่อมีข้อสังเกต
// หน้ารายงานผล กล่องผูกกับฟอร์มตีกลับผลด้วย formId (ไม่ถูกส่งไปกับฟอร์มบันทึกผล)

export type PlanComments = {
  /** section -> ข้อความ ("TARGET", "L1".."L6") */
  values: Record<string, string>;
  /** ส่วนกลาง = เขียนได้ · คนอื่น = อ่านอย่างเดียว */
  editable: boolean;
  /** id ของฟอร์มที่กล่องข้อสังเกตผูกอยู่ (หน้ารายงานผล) - ไม่ระบุ = ฟอร์มตารางแผนเอง */
  formId?: string;
  /** หัวกล่อง เช่น "ข้อสังเกตเพื่อให้แผนมีความชัดเจน" (COMMENT_HEADING) */
  heading: string;
};

const CommentContext = createContext<PlanComments>({
  values: {},
  editable: false,
  heading: COMMENT_HEADING.plan,
});

/** ในฟอร์มนี้มีกล่องข้อสังเกตที่เขียนแล้วอย่างน้อย 1 กล่องหรือไม่ */
export function hasAnyComment(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  return Array.from(form.elements).some(
    (el) =>
      el instanceof HTMLTextAreaElement &&
      el.name.startsWith("comment_") &&
      el.value.trim() !== "",
  );
}

/** กล่องข้อสังเกตของส่วนหนึ่ง - ไม่มีข้อสังเกตและแก้ไม่ได้ = ไม่แสดงอะไร */
function CommentBox({ section, title }: { section: string; title: string }) {
  const { values, editable, formId, heading } = useContext(CommentContext);
  const text = values[section] ?? "";
  if (!editable && text === "") return null;

  const id = `comment_${section}`;
  return (
    <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3">
      <label
        htmlFor={editable ? id : undefined}
        className="flex items-center gap-2 text-sm font-semibold text-red-800"
      >
        <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
        {heading}
        <span className="font-normal text-red-700">· {title}</span>
      </label>
      {editable ? (
        <textarea
          id={id}
          name={id}
          form={formId}
          defaultValue={text}
          rows={2}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={`ข้อสังเกต/สิ่งที่ต้องแก้ของ${title} (เว้นว่างได้ถ้าไม่มี)`}
          className="mt-1.5 w-full resize-y rounded-lg border border-red-300 bg-surface px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
        />
      ) : (
        <p className="mt-1.5 whitespace-pre-line rounded-lg bg-surface px-3 py-2 text-sm text-red-900">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * ปุ่มตีกลับแผน (เฉพาะส่วนกลาง) - ข้อสังเกตมาจากกล่องใต้แต่ละส่วน (comment_<section>)
 * เซิร์ฟเวอร์ปลดล็อกแผน เก็บข้อสังเกต และแจ้งเตือน (กระดิ่ง) ถึงผู้รายงานและหัวหน้าส่วนงาน
 */
function ReturnPanel({ canReturnNow }: { canReturnNow: boolean }) {
  const { pending } = useFormStatus();
  return (
    <section className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold text-red-800">
        <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
        ตีกลับแผนการดำเนินงาน
      </h2>
      <p className="mt-1 text-sm text-red-900">
        เขียนในกล่อง <strong>{COMMENT_HEADING.plan}</strong> สีแดงใต้เป้าหมายตัวชี้วัด
        และใต้ค่าเกณฑ์ระดับที่ต้องแก้ (อย่างน้อย 1 กล่อง) แล้วกดตีกลับแผน ·
        ผู้รายงานและหัวหน้าส่วนงานจะได้รับแจ้งเตือนที่กระดิ่งและเห็นข้อสังเกตใต้แต่ละส่วน
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ReturnDueInput />
        <button
          type="submit"
          name="intent"
          value="unlock"
          disabled={pending || !canReturnNow}
          onClick={(e) => {
            if (!hasAnyComment(e.currentTarget.form)) {
              e.preventDefault();
              window.alert("กรุณาเขียนข้อสังเกตในกล่องสีแดงอย่างน้อย 1 กล่องก่อนตีกลับ");
              return;
            }
            if (!hasReturnDueDate(e.currentTarget.form)) {
              e.preventDefault();
              window.alert("กรุณาเลือกวันที่ที่ต้องแก้ไขให้เสร็จก่อนตีกลับ");
              return;
            }
            if (!window.confirm("ตีกลับแผนการดำเนินงานพร้อมข้อสังเกตที่เขียนไว้?")) e.preventDefault();
          }}
          className="min-h-11 rounded-lg bg-red-700 px-5 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "กำลังตีกลับ..." : "ตีกลับแผน"}
        </button>
        {!canReturnNow && (
          <span className="text-sm text-red-800">แผนนี้ยังไม่ได้ส่ง จึงยังตีกลับไม่ได้</span>
        )}
      </div>
    </section>
  );
}

export function PlanTable({
  mode,
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
  canReturn,
  canSend,
  returned,
  comments,
}: {
  /** plan = หน้าแผนดำเนินงาน · report = หน้ารายงานผล */
  mode: PlanTableMode;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  canEdit: boolean;
  header: { owner: string; budget: string };
  rows: PlanRowData[];
  monthsElapsed: number;
  fiscalYear: number;
  indicatorId: string;
  /** ค่าเกณฑ์ระดับ 1-5 + เงื่อนไขอื่นๆ ใช้เป็นหัวกลุ่มของตารางขั้นตอนการดำเนินงาน */
  criteria: PlanCriterion[];
  /** รายงานผลการดำเนินงานของแต่ละระดับ key = ระดับ */
  levelReports: Record<number, string>;
  /** เดือนที่ล็อกไว้ (ไตรมาสที่ผ่านไปแล้ว) ช่อง 0 = ต.ค. */
  locks: MonthLocks;
  /** ส่งแผนเมื่อไร (ข้อความแสดงผล) - null = ยังไม่ยืนยัน */
  confirmedLabel: string | null;
  /** ส่งแผนแล้ว และผู้ใช้คนนี้แก้โครงแผนไม่ได้ (ผู้รับผิดชอบส่วนงาน) */
  structureLocked: boolean;
  /** แสดงปุ่มปลดล็อกแผน (ส่วนกลาง) */
  canUnlock: boolean;
  /** เป็นส่วนกลาง (แสดงช่องข้อสังเกต/ตีกลับ) - ตีกลับได้จริงเมื่อ canUnlock */
  canReturn: boolean;
  /** กดส่งแผนได้ (หัวหน้าส่วนงาน/หน่วยงาน หรือส่วนกลาง) - ผู้รายงานบันทึกร่างได้อย่างเดียว */
  canSend: boolean;
  /** ส่วนกลางตีกลับแผนล่าสุด (แสดงจนกว่าจะส่งแผนใหม่) - null = ไม่ได้ถูกตีกลับ */
  returned: {
    label: string;
    note: string;
    /** "ต้องแก้ไขให้เสร็จภายในวันที่ ..." - null = ไม่มีกำหนด (ตีกลับก่อนมีช่องนี้) */
    due: string | null;
  } | null;
  /** ข้อสังเกตใต้แต่ละส่วน */
  comments: PlanComments;
}) {
  // โครงแผน = ชื่อรายการ ค่าเป้าหมาย หน่วยนับ แผนรายเดือน และการเพิ่ม/ลบบรรทัด
  // ส่งแผนแล้วล็อกทั้งหมด แต่ยังกรอกผล สาเหตุ แนวทางแก้ไข หลักฐาน และรายงานรายระดับได้
  const isPlan = mode === "plan";
  const editStructure = isPlan && canEdit && !structureLocked;
  // หน้าแผนไม่กรอกผล หน้ารายงานผลไม่แก้แผน
  const editResults = !isPlan && canEdit;
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

  const setCell: OnCell = (rowId, field, monthIndex, value) => {
    setData((prev) =>
      prev.map((r) =>
        r.id !== rowId
          ? r
          : field === "target"
            ? { ...r, target: value }
            : {
                ...r,
                [field]: r[field].map((v, i) => (i === monthIndex ? value : v)),
              },
      ),
    );
  };

  // ค่าเป้าหมายต้องเท่ากับรวมแผนทั้งปี ไม่ตรงแม้แต่รายการเดียวก็เด้งเตือนและไม่ส่งฟอร์ม
  // (เซิร์ฟเวอร์ตรวจซ้ำและปฏิเสธเหมือนกัน) ยกเว้นปุ่มปลดล็อกแผนของส่วนกลาง
  const checkTargets = (e: React.FormEvent<HTMLFormElement>) => {
    if (!editStructure) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === "unlock") return;

    const problems = data
      .filter((r) => targetMismatch(toNum(r.target), r.plan.map(toNum)))
      .map(
        (r) =>
          `• ${PLAN_SECTION_ITEM_LABEL[r.section]} ลำดับ ${planRowLabel(r)}: ค่าเป้าหมาย ${r.target} แต่รวมแผนทั้งปี ${formatPlanNumber(sumMonths(r.plan.map(toNum))) || "0"}`,
      );
    if (problems.length === 0) return;

    e.preventDefault();
    window.alert(
      `บันทึกแผนไม่ได้\n\nค่าเป้าหมายต้องเท่ากับรวมแผนทั้งปี (ต.ค. – ก.ย.) กรุณาแก้รายการต่อไปนี้:\n${problems.join("\n")}`,
    );
  };

  return (
    <CommentContext.Provider value={comments}>
    <form action={formAction} onSubmit={checkTargets} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      <SuccessDialog state={state} />

      {/* ---- แผนถูกตีกลับ (หน้าแผน) ---- */}
      {isPlan && returned && !confirmedLabel && (
        <div
          id="return"
          role="alert"
          className="scroll-mt-4 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-semibold">ส่วนกลางตีกลับแผนการดำเนินงาน เมื่อ {returned.label}</p>
          {returned.due && <DueBadge text={returned.due} />}
          <p className="mt-1 font-medium">ข้อสังเกตเพื่อให้แผนมีความชัดเจน (จากส่วนกลาง):</p>
          <p className="mt-0.5 whitespace-pre-line rounded-lg bg-surface px-3 py-2 text-base text-red-900">
            {returned.note}
          </p>
          <p className="mt-1">
            ผู้รายงานแก้ไขแผนแล้วบันทึกร่าง จากนั้นหัวหน้าส่วนงาน/หัวหน้าหน่วยงานกดส่งแผนการดำเนินงานใหม่
          </p>
        </div>
      )}

      {/* ---- สถานะการส่งแผน (หน้าแผน) ---- */}
      {!isPlan ? null : confirmedLabel ? (
        <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-700 shadow-sm">
          <span className="font-medium text-emerald-800">✓ ส่งแผนแล้ว</span> เมื่อ {confirmedLabel} ·{" "}
          {structureLocked
            ? "แผนรายเดือน เป้าหมายตัวชี้วัด ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานถูกล็อก ติดต่อส่วนกลางหากต้องแก้แผน"
            : "ส่วนงานแก้โครงแผนไม่ได้แล้ว ส่วนกลางยังแก้ได้ หรือกดตีกลับแผนให้ส่วนงานแก้เอง"}
        </p>
      ) : (
        canEdit && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            กรอกไม่เสร็จกด <strong>บันทึกร่างแผน</strong> ไว้ก่อนแล้วกลับมาแก้ต่อได้ ·{" "}
            {canSend ? (
              <>
                กรอกครบแล้วกด <strong>ส่งแผนการดำเนินงาน</strong> ด้านล่าง จึงจะรายงานผลการดำเนินงานได้ ·
                หลังส่งจะแก้แผนรายเดือน เป้าหมาย ค่าเป้าหมาย หน่วยนับ และขั้นตอนการดำเนินงานไม่ได้อีก
              </>
            ) : (
              <>
                กรอกครบแล้วแจ้ง <strong>หัวหน้าส่วนงาน/หัวหน้าหน่วยงาน</strong> ให้เข้ามาตรวจและกดส่งแผนการดำเนินงาน
              </>
            )}
          </p>
        )
      )}

      {/* ---- ส่วนหัวของแบบฟอร์ม ----
          กรอกที่หน้าแผน หน้ารายงานผลแสดงอย่างเดียว (ไม่มี name จึงไม่ถูกส่งไปบันทึกทับ) */}
      <section className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="font-semibold">ข้อมูลหัวแบบฟอร์ม</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="owner" className="mb-1.5 block text-sm font-medium">
              ส่วนงาน/หน่วยงานที่รับผิดชอบตัวชี้วัด
            </label>
            <input
              id="owner"
              name={isPlan ? "owner" : undefined}
              defaultValue={header.owner}
              readOnly={!isPlan || !canEdit}
              placeholder={isPlan ? "เช่น การยางแห่งประเทศไทยเขตภาคเหนือ/กองแผนและวิชาการ" : ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none read-only:bg-slate-50 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <div>
            <label
              htmlFor="budget"
              className="mb-1.5 block text-sm font-medium"
            >
              งบประมาณ <span className="font-normal text-slate-500">(ถ้ามี)</span>
            </label>
            <input
              id="budget"
              name={isPlan ? "budget" : undefined}
              defaultValue={header.budget}
              readOnly={!isPlan || !canEdit}
              placeholder={isPlan ? "เช่น 71,000 บาท · ไม่มีงบประมาณเว้นว่างได้" : ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none read-only:bg-slate-50 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>
        </div>
      </section>

      {/* ---- ตัวเลือกเดือนที่ใช้คิดยอดสะสม (หน้ารายงานผล) ---- */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm shadow-sm">
        {isPlan ? (
          <span className="text-slate-600">
            ปีบัญชี {fiscalYear} · กรอกแผนรายเดือน ต.ค. – ก.ย. ช่อง &quot;รวม&quot; คือแผนทั้งปี
          </span>
        ) : (
          <>
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
          </>
        )}

        {/* ปุ่มดาวน์โหลดอยู่ตรงนี้เพราะต้องส่งเดือนที่เลือกไปด้วย
            ไฟล์ที่ได้จะคิดยอดสะสมช่วงเดียวกับที่เห็นบนหน้าจอพอดี */}
        <a
          href={`/api/export/plan/${indicatorId}?upto=${upto}`}
          className="ml-auto inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium transition hover:bg-slate-50"
        >
          ดาวน์โหลดเป็น Excel
        </a>
      </div>

      {canEdit &&
        (isPlan
          ? structureLocked || locks.plan.some(Boolean)
          : locks.actual.some(Boolean)) && (
        <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="mt-0.5 inline-block h-4 w-6 shrink-0 rounded border border-slate-200 bg-slate-100" aria-hidden="true" />
          <span>
            {isPlan
              ? "ช่องสีเทาแก้ไขไม่ได้ · แผนของไตรมาสที่ผ่านไปแล้วล็อกไว้ แก้ย้อนหลังไม่ได้"
              : "ช่องสีเทาแก้ไขไม่ได้ · ช่อง \"ผล\" กรอกได้เฉพาะเดือนในไตรมาสที่เปิดรายงานอยู่ · ช่อง \"แผน\" แก้ที่หน้าแผนดำเนินงาน"}
          </span>
        </p>
      )}

      {PLAN_SECTIONS.map((section) => (
        <SectionTable
          key={section}
          mode={mode}
          section={section}
          editResults={editResults}
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

      {/* ---- ข้อสังเกต + ตีกลับแผน (เฉพาะส่วนกลาง หน้าแผน)
          อยู่ใต้ตารางเป้าหมายตัวชี้วัดและค่าเกณฑ์ทุกระดับ ส่วนกลางอ่านแผนครบแล้วค่อยเขียนข้อสังเกต ---- */}
      {isPlan && canReturn && <ReturnPanel canReturnNow={canUnlock} />}

      {canEdit && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          {isPlan ? (
            <>
              <SaveButton label={confirmedLabel ? "บันทึก" : "บันทึกร่างแผน"} />
              {!confirmedLabel && canSend && <ConfirmButton />}
            </>
          ) : (
            <SaveButton label="บันทึกผลการดำเนินงาน" />
          )}
          <span className="text-sm text-slate-600">
            ตัวเลขที่พิมพ์จะยังไม่ถูกเก็บจนกว่าจะกดบันทึก
          </span>
        </div>
      )}
    </form>
    </CommentContext.Provider>
  );
}

/**
 * จำนวนคอลัมน์ของตาราง ใช้กับแถวที่กินเต็มความกว้าง
 *
 * หน้าแผน: ลำดับ · รายการ · ค่าเป้าหมาย · หน่วย · 12 เดือน · รวม · (ลบ)
 * หน้ารายงานผล: ลำดับ · รายการ · ค่าเป้าหมาย · หน่วย · แผน/ผล · 12 เดือน
 *   · ผล/แผนสะสม · % สะสม · % ทั้งปี · สาเหตุ · แนวทางแก้ไข · หลักฐาน
 */
function columnCount(mode: PlanTableMode, editStructure: boolean) {
  return mode === "plan"
    ? 4 + MONTH_COUNT + 1 + (editStructure ? 1 : 0)
    : 5 + MONTH_COUNT + 6;
}

function SectionTable({
  mode,
  section,
  editResults,
  editStructure,
  rows,
  upto,
  onCell,
  filesByRow,
  criteria,
  levelReports,
  locks,
}: {
  mode: PlanTableMode;
  section: PlanSection;
  /** กรอกผล สาเหตุ แนวทางแก้ไข หลักฐาน และรายงานรายระดับได้ (หน้ารายงานผล) */
  editResults: boolean;
  /** แก้โครงแผนได้ (ชื่อรายการ ค่าเป้าหมาย หน่วยนับ แผนรายเดือน เพิ่ม/ลบบรรทัด) */
  editStructure: boolean;
  rows: RowState[];
  upto: number;
  onCell: OnCell;
  filesByRow: Map<string, PlanFile[]>;
  criteria: PlanCriterion[];
  levelReports: Record<number, string>;
  locks: MonthLocks;
}) {
  const isStep = section === "STEP";
  const isPlan = mode === "plan";
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
  const cols = columnCount(mode, editStructure);

  const renderRows = (list: RowState[], prefix: string) =>
    list.map((row, index) => {
      const rowSummary = summaryById.get(row.id)!;
      const props = {
        row,
        label: `${prefix}${index + 1}`,
        summary: rowSummary,
        onCell,
        locks,
      };
      return isPlan ? (
        <PlanRow key={row.id} {...props} editStructure={editStructure} />
      ) : (
        <RowPair
          key={row.id}
          {...props}
          canEdit={editResults}
          files={filesByRow.get(row.id) ?? []}
        />
      );
    });

  // บรรทัดสรุปท้ายตาราง ตรงกับสูตร AVERAGE ในไฟล์ต้นฉบับ (หน้ารายงานผล)
  const averageRow = isPlan ? null : (
    <tr className="bg-slate-50 font-medium">
      <td colSpan={5 + MONTH_COUNT + 1} className="border border-slate-200 px-3 py-2.5">
        <span className="sticky left-3">{PLAN_SECTION_AVG_LABEL[section]}</span>
      </td>
      <td className="border border-slate-200 px-2 py-2.5 text-right tabular-nums text-brand-ink">
        {formatPct(summary.avgCumPct)}
      </td>
      <td className="border border-slate-200 px-2 py-2.5 text-right tabular-nums text-brand-ink">
        {formatPct(summary.avgYearPct)}
      </td>
      <td colSpan={3} className="border border-slate-200" />
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
            ค่าเกณฑ์ระดับ 1-5 และคำอธิบายมาจาก MOU แก้ไขที่นี่ไม่ได้ ·{" "}
            {isPlan
              ? "เพิ่มขั้นตอนการดำเนินงานใต้แต่ละระดับ (และเงื่อนไขอื่นๆ ถ้ามี) พร้อมแผนรายเดือน"
              : `กรอกผลรายเดือนของแต่ละขั้นตอน แนบหลักฐานได้ขั้นตอนละไม่เกิน ${MAX_PLAN_FILES_PER_ROW} ไฟล์ และรายงานผลการดำเนินงานของแต่ละระดับ`}
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
        <TableFrame mode={mode} editStructure={editStructure} className="max-h-[70vh] overflow-auto">
          <thead className="sticky top-0 z-10">
            <HeaderRow section={section} mode={mode} editStructure={editStructure} />
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
              <TableFrame key={c.level} mode={mode} editStructure={editStructure} className="overflow-x-auto">
                <tbody>
                  <LevelGroup
                    section={section}
                    criterion={c}
                    cols={cols}
                    mode={mode}
                    editResults={editResults}
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
            <TableFrame mode={mode} editStructure={editStructure} className="overflow-x-auto">
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
                <HeaderRow section={section} mode={mode} editStructure={editStructure} />
                {renderRows(orphans, "")}
              </tbody>
            </TableFrame>
          )}

          {/* สรุปท้ายตาราง เป็นกล่องแยกแทนแถวในตาราง
              เพราะตารางขั้นตอนแยกเป็นหลายตาราง แถวค่าเฉลี่ยที่อยู่ตารางสุดท้ายจะไม่มีหัวคอลัมน์กำกับ
              ผู้อ่านไม่รู้ว่าตัวเลขสองตัวคืออะไร จึงเขียนชื่อกำกับไว้ตรงตัวเลขเลย */}
          {!isPlan && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
            <h3 className="font-semibold text-brand-900">
              {PLAN_SECTION_AVG_LABEL[section]}
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
          )}
        </div>
      )}

      {!isStep && (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <CommentBox section="TARGET" title="เป้าหมายตัวชี้วัด" />
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
  mode,
  editResults,
  editStructure,
  stepCount,
  report,
  children,
}: {
  section: PlanSection;
  criterion: PlanCriterion;
  cols: number;
  mode: PlanTableMode;
  editResults: boolean;
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
            {criterion.title}
            {/* ค่าเกณฑ์ของระดับนี้ ให้คนวางขั้นตอนเห็นว่าต้องได้เท่าไรถึงจะผ่าน */}
            {criterion.value && (
              <span className="font-normal text-slate-800">: {criterion.value}</span>
            )}
          </span>
          {/* รายการเงื่อนไขของกลุ่มเงื่อนไขอื่นๆ */}
          {criterion.description && (
            <span className="sticky left-3 mt-1 block max-w-[56rem] whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {criterion.description}
            </span>
          )}
        </td>
      </tr>

      <HeaderRow section={section} mode={mode} editStructure={editStructure} />

      {children}

      {stepCount === 0 && (
        <tr>
          <td
            colSpan={cols}
            className="border border-slate-200 px-3 py-2 text-sm text-slate-500"
          >
            <span className={stick}>
              ยังไม่มีขั้นตอนการดำเนินงานของ{criterion.shortTitle}
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
              + เพิ่มขั้นตอนการดำเนินงานของ{criterion.shortTitle}
            </button>
          </td>
        </tr>
      )}

      {/* รายงานผลรายระดับอยู่หน้ารายงานผล */}
      {mode === "report" && (
        <tr>
          <td colSpan={cols} className="border border-slate-200 px-3 py-2">
            <div className={`${stick} w-[56rem]`}>
              <label
                htmlFor={`levelReport_${criterion.level}`}
                className="mb-1 block text-sm font-medium"
              >
                รายงานผลการดำเนินงานของ{criterion.shortTitle}
              </label>
              <LevelReportInput
                id={`levelReport_${criterion.level}`}
                defaultValue={report}
                readOnly={!editResults}
              />
            </div>
          </td>
        </tr>
      )}

      {/* ข้อสังเกตของระดับนี้ (ใต้ค่าเกณฑ์) */}
      <CommentRow cols={cols} section={levelCommentKey(criterion.level)} title={criterion.title} />
    </>
  );
}

/** แถวกินเต็มความกว้างของตาราง ใส่กล่องข้อสังเกต - ไม่มีอะไรให้แสดงก็ไม่มีแถว */
function CommentRow({ cols, section, title }: { cols: number; section: string; title: string }) {
  const { values, editable } = useContext(CommentContext);
  if (!editable && !values[section]) return null;
  return (
    <tr>
      <td colSpan={cols} className="border border-slate-200 px-3 py-2">
        <div className="sticky left-3 w-[56rem] max-w-[calc(100vw-4rem)]">
          <CommentBox section={section} title={title} />
        </div>
      </td>
    </tr>
  );
}

/**
 * ช่อง "รายงานผลการดำเนินงานของระดับ" พร้อมตัวนับคำ (ไม่เกิน LEVEL_REPORT_MAX_WORDS คำ)
 * ตัวนับใช้ countWords ตัวเดียวกับเซิร์ฟเวอร์ ตัวเลขบนจอจึงตรงกับที่ถูกตรวจจริง
 */
function LevelReportInput({
  id,
  defaultValue,
  readOnly,
}: {
  id: string;
  defaultValue: string;
  readOnly: boolean;
}) {
  const [words, setWords] = useState(() => countWords(defaultValue));
  const over = words > LEVEL_REPORT_MAX_WORDS;
  const max = LEVEL_REPORT_MAX_WORDS.toLocaleString("th-TH");
  return (
    <>
      <textarea
        id={id}
        name={id}
        defaultValue={defaultValue}
        readOnly={readOnly}
        rows={3}
        onChange={(e) => setWords(countWords(e.target.value))}
        placeholder={
          readOnly ? "" : `ผลที่เกิดขึ้นจริงเทียบกับค่าเกณฑ์ระดับนี้ (ไม่เกิน ${max} คำ)`
        }
        aria-invalid={over}
        className={`${textInput} resize-y read-only:bg-slate-50 ${over ? "border-red-400" : ""}`}
      />
      {!readOnly && (
        <p className={`mt-0.5 text-right text-xs ${over ? "font-medium text-red-700" : "text-slate-500"}`}>
          {words.toLocaleString("th-TH")} / {max} คำ
          {over && " · เกินจำนวนที่กำหนด บันทึกไม่ได้"}
        </p>
      )}
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
  mode,
  editStructure,
  className,
  children,
}: {
  mode: PlanTableMode;
  editStructure: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const isPlan = mode === "plan";
  return (
    <div className={className}>
      <table
        className={`${isPlan ? "w-[82rem]" : "w-[130rem]"} table-fixed border-collapse text-sm`}
      >
        <colgroup>
          <col className="w-14" />
          <col className="w-72" />
          <col className="w-24" />
          <col className="w-20" />
          {!isPlan && <col className="w-16" />}
          {FISCAL_MONTHS.map((m) => (
            <col key={m} className="w-12" />
          ))}
          <col className="w-24" />
          {!isPlan && (
            <>
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-48" />
              <col className="w-40" />
              <col className="w-52" />
            </>
          )}
          {isPlan && editStructure && <col className="w-16" />}
        </colgroup>
        {children}
      </table>
    </div>
  );
}

/** แถวหัวคอลัมน์ของตารางแผน ใช้ทั้งหัวตารางเป้าหมาย และหัวตารางซ้ำของแต่ละค่าเกณฑ์ */
function HeaderRow({
  section,
  mode,
  editStructure,
}: {
  section: PlanSection;
  mode: PlanTableMode;
  editStructure: boolean;
}) {
  const isPlan = mode === "plan";
  return (
    <tr className="bg-slate-50 text-slate-700 shadow-[0_1px_0_0_var(--color-slate-200)]">
      <Th>{PLAN_SECTION_INDEX_LABEL[section]}</Th>
      <Th className="text-left">{PLAN_SECTION_ITEM_LABEL[section]}</Th>
      <Th>ค่าเป้าหมาย</Th>
      <Th>หน่วยนับ</Th>
      {!isPlan && <Th>แผน/ผล</Th>}
      {FISCAL_MONTHS.map((m, i) => (
        <Th key={m} className={i % 3 === 0 ? "border-l-2 border-l-slate-300" : ""}>
          {m}
        </Th>
      ))}
      {isPlan ? (
        <Th className="border-l-2 border-l-slate-300">รวมแผนทั้งปี</Th>
      ) : (
        <>
          {/* ยอดสะสมของแผน (บรรทัดบน) และผล (บรรทัดล่าง) ตรงกับคอลัมน์ผลสะสมในไฟล์ Excel */}
          <Th className="border-l-2 border-l-slate-300">ผล/แผนการดำเนินงานสะสม</Th>
          <Th>{PLAN_SECTION_CUM_LABEL[section]}</Th>
          <Th>{PLAN_SECTION_YEAR_LABEL[section]}</Th>
          <Th className="text-left">{PLAN_SECTION_CAUSE_LABEL[section]}</Th>
          <Th className="text-left">แนวทางการดำเนินการแก้ไข</Th>
          <Th className="text-left">
            หลักฐานประกอบผลการดำเนินงาน
            <span className="block text-xs font-normal text-slate-500">
              ไม่เกิน {MAX_PLAN_FILES_PER_ROW} ไฟล์ · ไฟล์ละไม่เกิน {formatBytes(MAX_FILE_BYTES)}
            </span>
          </Th>
        </>
      )}
      {isPlan && editStructure && <Th>ลบ</Th>}
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

/** field "target" = ช่องค่าเป้าหมาย (ไม่ใช้ monthIndex) */
type OnCell = (
  rowId: string,
  field: "plan" | "actual" | "target",
  monthIndex: number,
  value: string,
) => void;

const sharedCell = "border border-slate-200 px-2 py-1.5 align-top";

/** 1 รายการในหน้าแผน: บรรทัดเดียว มีแต่แผนรายเดือน (ผลกรอกที่หน้ารายงานผล) */
function PlanRow({
  row,
  label,
  editStructure,
  summary,
  onCell,
  locks,
}: {
  row: RowState;
  /** เลขลำดับที่แสดง เช่น "2" หรือ "3.1" (ขั้นที่ 1 ของระดับ 3) */
  label: string;
  editStructure: boolean;
  summary: PlanRowSummary;
  onCell: OnCell;
  locks: MonthLocks;
}) {
  // บรรทัดที่มีตัวเลขในเดือนที่ล็อกลบไม่ได้ (เซิร์ฟเวอร์ก็ปฏิเสธเหมือนกัน)
  const hasLockedData =
    row.planMonths.some((v, i) => locks.plan[i] && v !== null) ||
    row.actualMonths.some((v, i) => locks.actual[i] && v !== null);
  const mismatch = targetMismatch(toNum(row.target), row.plan.map(toNum));

  return (
    <tr className="hover:bg-slate-50/60">
      <td className={`${sharedCell} text-center tabular-nums`}>{label}</td>
      <td className={sharedCell}>
        <textarea
          name={`title_${row.id}`}
          defaultValue={row.title}
          readOnly={!editStructure}
          rows={2}
          placeholder="พิมพ์ชื่อรายการ"
          className={`${textInput} resize-y read-only:bg-slate-50`}
        />
      </td>
      <td className={sharedCell}>
        <input
          name={`target_${row.id}`}
          value={row.target}
          onChange={(e) => onCell(row.id, "target", -1, e.target.value)}
          readOnly={!editStructure}
          inputMode="decimal"
          aria-invalid={mismatch}
          className={`${textInput} text-right tabular-nums read-only:bg-slate-50 ${mismatch ? "border-red-400" : ""}`}
        />
      </td>
      <td className={sharedCell}>
        <input
          name={`unit_${row.id}`}
          defaultValue={row.unit ?? ""}
          readOnly={!editStructure}
          placeholder="ไร่ / ครั้ง"
          className={`${textInput} read-only:bg-slate-50`}
        />
      </td>
      {row.plan.map((value, i) => (
        <MonthCell
          key={i}
          name={`p${i}_${row.id}`}
          value={value}
          readOnly={!editStructure || locks.plan[i]}
          locked={editStructure && locks.plan[i]}
          monthIndex={i}
          label={`แผนเดือน${FISCAL_MONTHS[i]}`}
          onChange={(v) => onCell(row.id, "plan", i, v)}
        />
      ))}
      <td
        className={`${sharedCell} border-l-2 border-l-slate-300 text-right font-medium tabular-nums ${
          mismatch ? "bg-red-50 text-red-700" : "text-brand-ink"
        }`}
        title={mismatch ? "รวมแผนทั้งปีไม่เท่ากับค่าเป้าหมาย" : undefined}
      >
        {formatPlanNumber(summary.planYear) || "–"}
        {mismatch && <span className="block text-[11px] font-normal">ไม่ตรงค่าเป้าหมาย</span>}
      </td>
      {editStructure && (
        <td className={`${sharedCell} text-center`}>
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
  );
}

/**
 * 1 รายการในหน้ารายงานผล: สองบรรทัด แผน (แสดงอย่างเดียว) / ผล (กรอกได้)
 * ชื่อรายการและช่องแผนไม่มี name จึงไม่ถูกส่งไปบันทึกทับโครงแผน
 */
function RowPair({
  row,
  label,
  canEdit,
  summary,
  onCell,
  files,
  locks,
}: {
  row: RowState;
  label: string;
  /** กรอกผล สาเหตุ แนวทางแก้ไข และแนบหลักฐานได้ */
  canEdit: boolean;
  summary: PlanRowSummary;
  onCell: OnCell;
  files: PlanFile[];
  locks: MonthLocks;
}) {
  // 1 รายการกินสองบรรทัด (แผน/ผล) ช่องที่ใช้ร่วมกันจึงใช้ rowSpan
  // ให้หน้าตาตรงกับแบบฟอร์มกระดาษ
  const shared = sharedCell;

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td rowSpan={2} className={`${shared} text-center tabular-nums`}>
          {label}
        </td>
        <td rowSpan={2} className={`${shared} whitespace-pre-line`}>
          {row.title || <span className="text-slate-400">(ยังไม่ตั้งชื่อ)</span>}
        </td>
        <td rowSpan={2} className={`${shared} text-right tabular-nums`}>
          {formatPlanNumber(row.targetValue)}
        </td>
        <td rowSpan={2} className={shared}>
          {row.unit ?? ""}
        </td>

        <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-medium">
          แผน
        </td>
        {row.plan.map((value, i) => (
          <MonthCell
            key={i}
            value={value}
            readOnly
            locked={canEdit}
            monthIndex={i}
            label={`แผนเดือน${FISCAL_MONTHS[i]}`}
            onChange={() => {}}
          />
        ))}

        {/* ยอดแผนสะสม (บรรทัดแผน) */}
        <td className="border border-slate-200 border-l-2 border-l-slate-300 px-2 py-1.5 text-right tabular-nums">
          {formatPlanNumber(summary.planCum) || "0"}
        </td>
        <td
          rowSpan={2}
          className={`${shared} text-right font-medium tabular-nums text-brand-ink`}
        >
          {formatPct(summary.cumPct)}
        </td>
        <td
          rowSpan={2}
          className={`${shared} text-right font-medium tabular-nums text-brand-ink`}
        >
          {formatPct(summary.yearPct)}
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
        {/* ยอดผลสะสม (บรรทัดผล) */}
        <td className="border border-slate-200 border-l-2 border-l-slate-300 px-2 py-1.5 text-right font-medium tabular-nums">
          {formatPlanNumber(summary.actualCum) || "0"}
        </td>
      </tr>
    </>
  );
}

/** ช่องหลักฐานประกอบผลการดำเนินงาน: รายชื่อไฟล์ + ปุ่มแนบเอกสาร (ไม่เกิน MAX_PLAN_FILES_PER_ROW ไฟล์ต่อขั้นตอน) */
function EvidenceFiles({
  files,
  canEdit,
  actionPlanId,
}: {
  files: PlanFile[];
  canEdit: boolean;
  actionPlanId: string;
}) {
  const full = files.length >= MAX_PLAN_FILES_PER_ROW;
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
      {canEdit &&
        (full ? (
          <p className="text-[11px] text-slate-500">
            ครบ {MAX_PLAN_FILES_PER_ROW} ไฟล์แล้ว · ลบไฟล์เดิมก่อนจึงแนบเพิ่มได้
          </p>
        ) : (
          <>
            <PlanEvidenceUpload actionPlanId={actionPlanId} />
            <p className="text-[11px] text-slate-500">
              แนบแล้ว {files.length}/{MAX_PLAN_FILES_PER_ROW} ไฟล์
            </p>
          </>
        ))}
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
  /** ไม่มี name = แสดงอย่างเดียว ไม่ถูกส่งไปกับฟอร์ม */
  name?: string;
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
