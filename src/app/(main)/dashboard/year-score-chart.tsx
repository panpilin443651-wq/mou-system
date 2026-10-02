import type { DepartmentScoreRow } from "@/lib/department-scores";

// ============================================================================
// กราฟแท่งแนวนอน "ผลการประเมินคะแนนแต่ละส่วนงาน (เทียบปี)"
// ============================================================================
// ตามแบบที่ส่วนกลางกำหนด (2 ต.ค. 2569): ตารางลำดับ + ส่วนงานด้านซ้าย แท่งคะแนนด้านขวา
// เรียงจากคะแนนมากไปน้อย ตัวเลขคะแนน 4 ตำแหน่งท้ายแท่ง แกน 0-5 มีเส้นประทุก 1 คะแนน
// สีแท่งตามช่วงคะแนนในคำอธิบายสีด้านล่าง (SCORE_BANDS)
// เรนเดอร์ฝั่งเซิร์ฟเวอร์ล้วน ไม่ต้องโหลดไลบรารีกราฟ
// ============================================================================

const MAX = 5;
const TICKS = [0, 1, 2, 3, 4, 5];

/** ช่วงคะแนนและสี ตามคำอธิบายสีของแบบ - ค่าบนสุดของแต่ละช่วงนับรวมในช่วงนั้น */
const SCORE_BANDS = [
  { max: 1, label: "0.0 – 1.0", name: "สีแดง", bar: "bg-[#e5383b]" },
  { max: 2, label: "1.1 – 2.0", name: "สีส้ม", bar: "bg-[#f97a42]" },
  { max: 3, label: "2.1 – 3.0", name: "สีเหลือง", bar: "bg-[#fbd347]" },
  { max: 4, label: "3.1 – 4.0", name: "สีเขียวอ่อน", bar: "bg-[#93cb67]" },
  { max: 5, label: "4.1 – 5.0", name: "สีเขียวเข้ม", bar: "bg-[#0e9f6e]" },
] as const;

function bandOf(score: number) {
  return SCORE_BANDS.find((b) => score <= b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

const pct = (v: number) => `${(Math.min(MAX, Math.max(0, v)) / MAX) * 100}%`;

// คอลัมน์ซ้าย (ลำดับ + ส่วนงาน) และที่ว่างขวาสุดไว้ให้ตัวเลขของแท่งที่ยาวเกือบเต็ม
// ใช้ค่าเดียวกันทั้งแถวข้อมูล เส้นประ และแกนล่าง ให้ตรงแนวกันพอดี
const COLS = "grid-cols-[3.5rem_9.5rem_1fr]";
const PLOT_LEFT = "left-[13rem]";
const PLOT_RIGHT = "right-[4.5rem]";

export function YearScoreChart({
  rows,
  myCode,
}: {
  rows: DepartmentScoreRow[];
  myCode: string | null;
}) {
  const scored = rows
    .filter((d): d is DepartmentScoreRow & { yearScore: number } => d.yearScore !== null)
    .sort((a, b) => b.yearScore - a.yearScore);
  if (scored.length === 0) return null;

  return (
    <figure>
      {/* !text-white: กฎสีหัวข้อ h3 ใน globals.css อยู่นอก layer จึงชนะคลาสปกติ */}
      <h3 className="mx-auto mb-5 w-fit max-w-full rounded-full bg-gradient-to-r from-[#0b5d4b] via-[#0e7a5f] to-[#0b5d4b] px-8 py-2.5 text-center text-lg font-bold !text-white shadow-sm sm:text-xl">
        ผลการประเมินคะแนนแต่ละส่วนงาน (เทียบปี)
      </h3>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[44rem]">
          {/* หัวตารางด้านซ้าย */}
          <div className={`grid ${COLS} text-sm font-semibold text-white`}>
            <div className="rounded-tl-lg bg-[#0b5d4b] px-2 py-1.5 text-center">ลำดับ</div>
            <div className="rounded-tr-lg border-l border-white/30 bg-[#0b5d4b] px-2 py-1.5 text-center">
              ส่วนงาน
            </div>
            <div />
          </div>

          <div className="relative">
            {/* เส้นแกน 0 (ทึบ) และเส้นประทุก 1 คะแนน อยู่หลังแท่ง */}
            <div aria-hidden className={`pointer-events-none absolute inset-y-0 ${PLOT_LEFT} ${PLOT_RIGHT}`}>
              <span className="absolute inset-y-0 left-0 w-px bg-slate-500" />
              {TICKS.slice(1).map((t) => (
                <span
                  key={t}
                  className="absolute inset-y-0 border-l border-dashed border-slate-400"
                  style={{ left: pct(t) }}
                />
              ))}
            </div>

            {scored.map((d, i) => {
              const isMine = d.code === myCode;
              const band = bandOf(d.yearScore);
              const stripe = isMine ? "bg-accent-100" : i % 2 === 1 ? "bg-slate-100/70" : "";
              return (
                <div key={d.code} className={`group grid ${COLS} items-center text-sm`}>
                  <div className={`py-1 text-center tabular-nums text-slate-700 ${stripe}`}>{i + 1}</div>
                  <div
                    className={`truncate px-2 py-1 ${stripe} ${isMine ? "font-semibold text-slate-900" : "text-slate-800"}`}
                    title={d.line ? `${d.sourceName} · ${d.line}` : d.sourceName}
                  >
                    {d.sourceName}
                    {isMine && <span className="ml-1 text-xs font-normal text-accent-900">(คุณ)</span>}
                  </div>
                  <div className="relative mr-[4.5rem] h-7">
                    <div
                      className={`absolute inset-y-1 left-0 ${band.bar} shadow-sm transition-opacity group-hover:opacity-85 ${
                        isMine ? "ring-2 ring-accent-500 ring-offset-1" : ""
                      }`}
                      style={{ width: pct(d.yearScore) }}
                      role="img"
                      aria-label={`ลำดับ ${i + 1} ${d.sourceName} คะแนนเทียบปี ${d.yearScore.toFixed(4)}`}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 pl-1.5 text-sm tabular-nums text-slate-800"
                      style={{ left: pct(d.yearScore) }}
                    >
                      {d.yearScore.toFixed(4)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* แกนคะแนนด้านล่าง */}
          <div className="relative h-7 border-t border-slate-500" style={{ marginLeft: "13rem", marginRight: "4.5rem" }}>
            {TICKS.map((t) => (
              <span
                key={t}
                className="absolute top-1 -translate-x-1/2 text-sm font-semibold tabular-nums text-slate-800"
                style={{ left: pct(t) }}
              >
                {t}
              </span>
            ))}
          </div>
          <p className="text-center text-sm font-semibold text-brand-ink" style={{ paddingLeft: "13rem", paddingRight: "4.5rem" }}>
            คะแนนเทียบปี
          </p>
        </div>
      </div>

      {/* คำอธิบายสี */}
      <figcaption className="mx-auto mt-5 flex w-fit max-w-full flex-wrap justify-center gap-x-8 gap-y-3 rounded-xl border border-teal-200 bg-teal-50/60 px-6 py-3">
        {SCORE_BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-2.5 text-sm text-slate-800">
            <span className={`h-8 w-9 rounded-md ${b.bar}`} aria-hidden />
            <span className="leading-tight">
              <span className="block font-semibold tabular-nums">{b.label}</span>
              <span className="block">({b.name})</span>
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
