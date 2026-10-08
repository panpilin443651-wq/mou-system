import type { ReactNode } from "react";

// แถบขั้นตอน 1 แผน → 2 รายงานผล ใช้ร่วมกันทั้งหน้าแผนและหน้ารายงานผล
// current = ขั้นตอนที่ผู้ใช้ต้องทำตอนนี้ (เด่นที่สุด) · done = ทำเสร็จแล้ว · upcoming = ยังทำไม่ได้/ยังไม่ถึง
export type StepState = "current" | "done" | "upcoming";

export type Step = {
  title: ReactNode;
  detail: ReactNode;
  state: StepState;
  // ขั้นตอนที่ผู้ใช้กำลังดูอยู่ในหน้านี้
  here?: boolean;
};

const STATE_LABEL: Record<StepState, string> = {
  current: "ขั้นตอนปัจจุบัน",
  done: "เสร็จแล้ว",
  upcoming: "ยังไม่ถึงขั้นตอนนี้",
};

export function StepTracker({ steps }: { steps: Step[] }) {
  return (
    <ol
      aria-label="ขั้นตอนการดำเนินงาน"
      className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
    >
      {steps.map((step, i) => (
        <li key={i} className="contents">
          {i > 0 && (
            <span
              aria-hidden
              className="self-center text-xl text-slate-400 rotate-90 sm:rotate-0"
            >
              →
            </span>
          )}
          <div
            aria-current={step.state === "current" ? "step" : undefined}
            className={`flex flex-1 items-start gap-3 rounded-xl border-2 px-4 py-3 text-sm ${
              step.state === "current"
                ? "border-brand-600 bg-brand-50 text-brand-900 shadow-md ring-4 ring-brand-100"
                : step.state === "done"
                  ? "border-emerald-200 bg-surface text-slate-700"
                  : "border-dashed border-slate-300 bg-surface text-slate-500"
            }`}
          >
            <span
              aria-hidden
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                step.state === "current"
                  ? "bg-brand-700 text-white"
                  : step.state === "done"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {step.state === "done" ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    step.state === "current"
                      ? "bg-brand-700 text-white"
                      : step.state === "done"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {STATE_LABEL[step.state]}
                </span>
                {step.here && (
                  <span className="text-xs font-medium text-slate-500">· หน้านี้</span>
                )}
              </div>
              <p
                className={`mt-1 ${
                  step.state === "current" ? "text-base font-bold" : "font-medium"
                }`}
              >
                ขั้นตอนที่ {i + 1} · {step.title}
              </p>
              <p className="mt-0.5">{step.detail}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
