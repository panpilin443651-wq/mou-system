import type { DepartmentScoreRow } from "@/lib/department-scores";

// ============================================================================
// กราฟแท่งแนวตั้งเปรียบเทียบคะแนนปีของแต่ละส่วนงาน
// ============================================================================
// สีเดียวทุกแท่ง (ความสูงบอกคะแนนอยู่แล้ว) ยกเว้นส่วนงานของผู้ใช้ที่เน้นด้วยสีทอง
// ตัวเลขแสดงเฉพาะสูงสุด ต่ำสุด และส่วนงานของผู้ใช้ ที่เหลือชี้เมาส์ดู หรืออ่านจากตารางข้างล่าง
// ชื่อส่วนงาน 30 หน่วยวางแนวนอนไม่พอ จึงเอียง 45 องศา
// จอแคบให้เลื่อนกราฟแนวนอนในกรอบของตัวเอง แทนการบีบแท่งจนอ่านไม่ออก
// เรนเดอร์ฝั่งเซิร์ฟเวอร์ล้วน ไม่ต้องโหลดไลบรารีกราฟ
// ============================================================================

const MAX = 5;
const TICKS = [0, 1, 2, 3, 4, 5];

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

  const average = scored.reduce((sum, d) => sum + d.yearScore, 0) / scored.length;
  const highest = scored[0].code;
  const lowest = scored[scored.length - 1].code;
  const pct = (v: number) => `${(Math.min(MAX, Math.max(0, v)) / MAX) * 100}%`;

  return (
    <figure>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[46rem] grid-cols-[2rem_1fr] pt-6">
          {/* แกนคะแนน */}
          <div className="relative h-72 text-xs tabular-nums text-slate-500">
            {TICKS.map((t) => (
              <span
                key={t}
                className="absolute right-2 translate-y-1/2"
                style={{ bottom: pct(t) }}
              >
                {t}
              </span>
            ))}
          </div>

          {/* พื้นที่กราฟ */}
          <div className="relative h-72 border-b border-slate-400">
            {/* เส้นกริดแนวนอน จางๆ ไม่แย่งสายตาจากแท่ง */}
            {TICKS.slice(1).map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute inset-x-0 h-px bg-slate-100"
                style={{ bottom: pct(t) }}
              />
            ))}

            {/* เส้นค่าเฉลี่ย */}
            <span
              aria-hidden
              className="absolute inset-x-0 z-[1] h-0 border-t border-dashed border-slate-500"
              style={{ bottom: pct(average) }}
            />
            <span
              className="absolute right-0 z-[1] translate-y-[-120%] rounded bg-tooltip px-1.5 py-0.5 text-[11px] text-white"
              style={{ bottom: pct(average) }}
            >
              เฉลี่ย {average.toFixed(3)}
            </span>

            <div className="absolute inset-0 flex">
              {scored.map((d, i) => {
                const isMine = d.code === myCode;
                const showValue = isMine || d.code === highest || d.code === lowest;
                return (
                  // พื้นที่ชี้เมาส์คือทั้งช่อง กว้างและสูงกว่าตัวแท่ง
                  <div key={d.code} className="group relative flex flex-1 justify-center">
                    {/* แท่งกว้างไม่เกิน 24px ปลายบนมน 4px โคนติดเส้นฐาน */}
                    <div
                      className={`absolute bottom-0 w-[60%] max-w-6 rounded-t transition-opacity group-hover:opacity-80 ${
                        isMine ? "bg-accent-400" : "bg-brand-600"
                      }`}
                      style={{ height: pct(d.yearScore) }}
                      role="img"
                      aria-label={`${d.sourceName} คะแนนปี ${d.yearScore.toFixed(3)}`}
                    />
                    {showValue && (
                      <span
                        className="absolute mb-1 text-[11px] font-medium tabular-nums text-slate-700"
                        style={{ bottom: pct(d.yearScore) }}
                      >
                        {d.yearScore.toFixed(2)}
                      </span>
                    )}

                    {/* ป้ายคะแนนตอนชี้เมาส์ ครึ่งขวาให้ป้ายยื่นไปทางซ้าย จะได้ไม่ล้นขอบกราฟ */}
                    <span
                      className={`pointer-events-none absolute z-10 mb-6 hidden ${i < scored.length / 2 ? "left-1/2" : "right-1/2"} whitespace-nowrap rounded-md bg-tooltip px-2 py-1 text-xs text-white shadow group-hover:block`}
                      style={{ bottom: pct(d.yearScore) }}
                    >
                      {d.sourceName} · คะแนนปี{" "}
                      <span className="font-semibold tabular-nums">{d.yearScore.toFixed(3)}</span>
                      {d.line ? ` · ${d.line}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ชื่อส่วนงาน เอียง 45 องศา ปลายข้อความชี้เข้ากลางแท่ง */}
          <div />
          <div className="flex h-20">
            {scored.map((d) => (
              <div key={d.code} className="relative flex-1">
                <span
                  className={`absolute right-1/2 top-2 origin-top-right -rotate-45 whitespace-nowrap text-xs ${
                    d.code === myCode ? "font-semibold text-slate-900" : "text-slate-700"
                  }`}
                >
                  {d.sourceName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-brand-600" aria-hidden /> คะแนนปี (เต็ม 5)
        </span>
        {myCode && scored.some((d) => d.code === myCode) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-accent-400" aria-hidden /> ส่วนงานของคุณ
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-slate-500" aria-hidden />
          ค่าเฉลี่ยทุกส่วนงาน
        </span>
        <span className="text-slate-500">ชี้ที่แท่งเพื่อดูคะแนน</span>
      </figcaption>
    </figure>
  );
}
