import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL, canViewDashboard, homePath } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard";
import {
  averageYearScore,
  departmentScoresFor,
  groupScoresByLines,
  yearsWithScores,
  type DepartmentScoreData,
  type DepartmentScoreRow,
  type QuarterKey,
} from "@/lib/department-scores";
import { YearScoreChart } from "./year-score-chart";

export const dynamic = "force-dynamic";
export const metadata = { title: "ภาพรวม | ระบบรายงานผล MOU" };

export default async function DashboardPage() {
  const user = await requireUser();
  // ผู้รับผิดชอบส่วนงานไม่เห็นหน้าภาพรวม
  if (!canViewDashboard(user)) redirect(homePath(user));
  // เอาแถบเลือกไตรมาสออกแล้ว ตัวเลขสรุปจึงใช้ไตรมาสล่าสุดที่ส่งแล้วเสมอ
  const quarter = "latest";

  const data = await getDashboardData(user, quarter);

  // รหัสส่วนงานของผู้ใช้ ใช้ทั้งไฮไลต์แถวและจำกัดสิ่งที่มองเห็น
  const myDepartment = user.departmentId
    ? await db.department.findUnique({
        where: { id: user.departmentId },
        select: { code: true },
      })
    : null;
  const myCode = myDepartment?.code ?? null;

  // ไฟล์คะแนนอ้างส่วนงานด้วยรหัส แต่หน้ารายงานผลรับ id จึงต้องแปลงก่อนทำลิงก์
  // หน้ารายงานผลตรวจสิทธิ์เองอีกชั้น ถ้าเปิด dept ที่ไม่มีสิทธิ์จะไม่เห็นข้อมูล
  const allDepartments = await db.department.findMany({
    select: { id: true, code: true, isActive: true, commandLineId: true },
    orderBy: { sortOrder: "asc" },
  });
  const departmentIdByCode = new Map(allDepartments.map((d) => [d.code, d.id]));

  // สายบังคับบัญชาตามที่ส่วนกลางจัดไว้ใน ตั้งค่าระบบ > สายบังคับบัญชา
  const commandLines = await db.commandLine.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const activeDepartments = allDepartments.filter((d) => d.isActive);

  // คะแนนจากไฟล์สรุปของส่วนกลาง ของปีบัญชีที่ใช้งานอยู่
  // เปลี่ยนปีบัญชีที่ ตั้งค่าระบบ แล้วหน้านี้เปลี่ยนตามทันที ไม่ค้างเป็นปีเก่า
  const scores = departmentScoresFor(data.fiscalYear?.year ?? null);

  // ผู้รับผิดชอบส่วนงานเห็นเฉพาะแถวของตัวเอง ตามกฎการมองเห็นเดียวกับทั้งระบบ
  // ส่วนกลางและผู้บริหารเห็นทุกแถวเพื่อเปรียบเทียบกัน
  const visibleScores = !scores
    ? []
    : user.role === "DEPT_USER"
      ? scores.departments.filter((d) => d.code === myCode)
      : scores.departments;

  // คะแนนชุดเดียวกัน แต่จัดกลุ่มตามสายบังคับบัญชา ใช้กฎการมองเห็นเดียวกัน
  const lineGroups = !scores
    ? []
    : groupScoresByLines(
        scores,
        commandLines.map((l) => ({
          name: l.name,
          codes: activeDepartments.filter((d) => d.commandLineId === l.id).map((d) => d.code),
        })),
        activeDepartments.filter((d) => d.commandLineId === null).map((d) => d.code),
        user.role === "DEPT_USER" ? new Set(myCode ? [myCode] : []) : null
      );

  // คะแนนเฉลี่ยบนการ์ด ใช้คะแนนปีจากไฟล์สรุปของส่วนกลาง ชุดเดียวกับกราฟและตารางข้างล่าง
  // (เดิมคิดจากผลที่กรอกในระบบ ซึ่งยังไม่มีใครกรอก การ์ดจึงขึ้น – ตลอด)
  // ผู้รับผิดชอบส่วนงานเห็นคะแนนของส่วนงานตัวเอง ส่วนกลางและผู้บริหารเห็นค่าเฉลี่ยทุกส่วนงาน
  const averageScore = averageYearScore(visibleScores);

  const tiles = [
    {
      label: "ส่วนงาน",
      value: data.departments.length.toLocaleString("th-TH"),
      hint:
        user.role === "DEPT_USER"
          ? "ส่วนงานของคุณ"
          : `${data.indicatorCount.toLocaleString("th-TH")} ตัวชี้วัด`,
    },
    {
      label: "ส่งผลแล้ว",
      value: `${data.submittedPct}%`,
      hint: `${data.submittedCount.toLocaleString("th-TH")} จาก ${data.indicatorCount.toLocaleString("th-TH")} ตัวชี้วัด`,
    },
    {
      label: user.role === "DEPT_USER" ? "คะแนนปี" : "คะแนนเฉลี่ย",
      value: averageScore === null ? "–" : averageScore.toFixed(3),
      hint: !scores
        ? `ยังไม่มีคะแนนของปีบัญชี ${data.fiscalYear?.year ?? "-"}`
        : `คะแนนปี เต็ม 5 · สะสมถึงไตรมาส ${scores.latestQuarter}${
            user.role === "DEPT_USER" ? "" : ` · ${visibleScores.length} ส่วนงาน`
          }`,
    },
    {
      label: "ยังไม่ส่งเลย",
      value: data.notStartedDepartments.length.toLocaleString("th-TH"),
      hint:
        data.departments.length === 0
          ? "ปีบัญชีนี้ยังไม่มีตัวชี้วัด"
          : data.notStartedDepartments.length === 0
          ? "ทุกส่วนงานเริ่มส่งแล้ว"
          : `ส่วนงาน: ${data.notStartedDepartments.slice(0, 4).join(" · ")}${
              data.notStartedDepartments.length > 4 ? " …" : ""
            }`,
    },
  ];

  const exportHref = `/api/export/summary?q=${quarter}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">ภาพรวม</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.name} · {ROLE_LABEL[user.role]}
            {data.fiscalYear
              ? ` · ปีบัญชี ${data.fiscalYear.year}`
              : " · ยังไม่ได้ตั้งปีบัญชี"}
          </p>
        </div>

        <a
          href={exportHref}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50"
        >
          ดาวน์โหลดเป็น Excel
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <dt className="text-sm text-slate-600">{t.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{t.value}</dd>
            <p className="mt-1 text-xs text-slate-500">{t.hint}</p>
          </div>
        ))}
      </dl>

      {data.submittedCount > 0 && data.submittedPct < 100 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ยังส่งผลไม่ครบ ({data.submittedPct}%) คะแนนที่เห็นจึงเป็นคะแนนเท่าที่ส่งมาแล้ว
          ไม่ใช่คะแนนสุดท้าย ส่วนงานที่ส่งน้อยกว่าจะดูเหมือนได้คะแนนต่ำกว่าโดยอัตโนมัติ
        </p>
      )}

      {!scores ? (
        // ยังไม่ได้นำเข้าไฟล์คะแนนของปีบัญชีนี้ บอกให้ชัดแทนการโชว์คะแนนปีอื่น
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center sm:px-6">
          <h2 className="font-semibold">
            ยังไม่มีคะแนนภาพรวมของปีบัญชี {data.fiscalYear?.year ?? "-"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            กราฟและตารางคะแนนของแต่ละส่วนงานจะแสดงเมื่อนำเข้าไฟล์สรุปคะแนนของปีนี้แล้ว
            {yearsWithScores().length > 0 &&
              ` · ตอนนี้มีข้อมูลของปีบัญชี ${yearsWithScores().join(", ")}`}
          </p>
        </section>
      ) : (
        <>
        {/* กราฟเปรียบเทียบคะแนนปีระหว่างส่วนงาน ข้อมูลชุดเดียวกับตารางข้างล่าง
            ซ่อนเมื่อเห็นได้ส่วนงานเดียว เพราะกราฟแท่งเดียวไม่มีอะไรให้เปรียบเทียบ */}
        {visibleScores.length > 1 && (
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className={SECTION_HEAD}>
              <h2 className="font-semibold">เปรียบเทียบคะแนนปีของแต่ละส่วนงาน</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                ปีบัญชี {scores.fiscalYear} · สะสมถึงไตรมาส {scores.latestQuarter} ·
                เรียงจากคะแนนมากไปน้อย
              </p>
            </div>
            <div className={SECTION_BODY}>
              <YearScoreChart rows={visibleScores} myCode={myCode} />
            </div>
          </section>
        )}

        {/* คะแนนภาพรวมของแต่ละส่วนงาน ตามไฟล์สรุปของส่วนกลาง
            แยกจากตัวเลขที่ระบบคำนวณเอง เพราะเป็นคนละชุดข้อมูล
            ถ้าเอามาปนกันโดยไม่บอก ผู้อ่านจะแยกไม่ออกว่าเลขไหนมาจากไหน */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className={SECTION_HEAD}>
            <h2 className="font-semibold">คะแนนภาพรวมของแต่ละส่วนงาน</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              ปีบัญชี {scores.fiscalYear} · ไตรมาส {scores.latestQuarter} ·
              เรียงตามคะแนนปี · คะแนนเต็ม 5 ·
              จากไฟล์สรุปของส่วนกลาง{" "}
              <span className="text-slate-500">({scores.source})</span>
            </p>
          </div>

          <div className={`${SECTION_BODY} overflow-x-auto`}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={`${TH} w-[14%]`}>ลำดับ</th>
                  <th className={`${TH} w-[38%]`}>ส่วนงาน</th>
                  <th className={`${TH} w-[24%]`}>คะแนนไตรมาส</th>
                  <th className={`${TH} w-[24%]`}>คะแนนปี</th>
                </tr>
              </thead>
              <tbody>
                {visibleScores.map((d, i) => (
                  <tr key={d.code} className={rowTone(d.code === myCode, i)}>
                    <td className={`${TD} text-slate-500`}>{d.rank || "–"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {departmentIdByCode.has(d.code) ? (
                        <Link
                          href={`/reports?dept=${departmentIdByCode.get(d.code)}`}
                          title={`ดูรายงานผลของ ${d.code}`}
                          className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-4 transition hover:text-brand-900 hover:decoration-brand-700"
                        >
                          {d.sourceName}
                        </Link>
                      ) : (
                        d.sourceName
                      )}
                      {!d.inSystem && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          ไม่มีในระบบแล้ว
                        </span>
                      )}
                      {d.code === myCode && (
                        <span className="ml-2 rounded bg-accent-200 px-1.5 py-0.5 text-xs font-medium text-accent-900">
                          ส่วนงานของคุณ
                        </span>
                      )}
                    </td>
                    <QuarterCell d={d} scores={scores} />
                    <YearCell d={d} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={SECTION_FOOT}>
            ตัวเลขชุดนี้มาจากไฟล์สรุปของส่วนกลาง ไม่ได้คำนวณจากผลที่กรอกในระบบ
            จึงไม่เปลี่ยนตามการกรอกผลรายไตรมาส · คะแนนไตรมาสเทียบกับแผนของไตรมาสนั้น ·
            คะแนนปีเทียบกับแผนทั้งปี สะสมถึงไตรมาสล่าสุด
          </p>
        </section>

        {/* คะแนนชุดเดียวกับตารางข้างบน แต่จัดกลุ่มตามสายบังคับบัญชา
            ตารางข้างบนตอบว่า "ส่วนงานไหนได้เท่าไร" ตารางนี้ตอบว่า "สายไหนไปได้ดีแค่ไหน"
            คนละคำถาม จึงแยกเป็นคนละหัวข้อ ไม่ยุบรวมกัน */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className={SECTION_HEAD}>
            <h2 className="font-semibold">คะแนนภาพรวมส่วนงานแยกตามสายบังคับบัญชา</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              ปีบัญชี {scores.fiscalYear} · ไตรมาส {scores.latestQuarter} ·
              คะแนนเต็ม 5 ·
              แต่ละสายเรียงจากคะแนนมากไปน้อย
            </p>
          </div>

          {/* หนึ่งสายหนึ่งตาราง มีหัวข้อของตัวเอง ใช้ table-fixed และความกว้างคอลัมน์เท่ากัน
              ให้คอลัมน์ของทุกตารางตรงแนวกันเวลาเลื่อนดูต่อกัน */}
          <div className={`${SECTION_BODY} space-y-8`}>
            {lineGroups.map((line) => (
              <div key={line.name}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-semibold text-brand-800">
                    {line.name}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {line.departments.length} ส่วนงาน
                    </span>
                  </h3>
                  <p className="text-sm text-slate-600">
                    {line.averageYearScore === null ? (
                      "ยังไม่มีข้อมูลในไฟล์ปีนี้"
                    ) : (
                      <>
                        คะแนนปีเฉลี่ยทั้งสาย{" "}
                        <span className="font-semibold tabular-nums text-brand-800">
                          {line.averageYearScore.toFixed(3)}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className={TABLE}>
                    <thead>
                      <tr>
                        <th className={`${TH} w-[14%]`}>ลำดับรวม</th>
                        <th className={`${TH} w-[38%]`}>ส่วนงาน</th>
                        <th className={`${TH} w-[24%]`}>คะแนนไตรมาส</th>
                        <th className={`${TH} w-[24%]`}>คะแนนปี</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.departments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={`${TD} text-slate-500`}>
                            ไม่มีส่วนงานในสายนี้
                          </td>
                        </tr>
                      ) : (
                        line.departments.map((d, i) => (
                          <tr key={d.code} className={rowTone(d.code === myCode, i)}>
                            <td className={`${TD} text-slate-500`}>{d.rank || "–"}</td>
                            <td className={`${TD} whitespace-nowrap`}>
                              {d.sourceName}
                              {d.code === myCode && (
                                <span className="ml-2 rounded bg-accent-200 px-1.5 py-0.5 text-xs font-medium text-accent-900">
                                  ส่วนงานของคุณ
                                </span>
                              )}
                            </td>
                            <QuarterCell d={d} scores={scores} />
                            <YearCell d={d} />
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <p className={SECTION_FOOT}>
            &quot;ลำดับรวม&quot; คือลำดับเทียบกับทั้ง 30 ส่วนงาน ไม่ใช่ลำดับภายในสาย ·
            ตัวเลขมาจากไฟล์สรุปของส่วนกลาง ไม่ได้คำนวณจากผลที่กรอกในระบบ
          </p>
        </section>
        </>
      )}
    </div>
  );
}

// ---- รูปแบบตารางคะแนน ใช้ร่วมกันทั้งสองตาราง ----
// เส้นทุกช่องและหัวตารางสีเข้ม ให้อ่านเทียบแถวได้ง่ายเหมือนตารางในไฟล์ Excel ที่ผู้ใช้คุ้นเคย
// ความกว้างคอลัมน์กำหนดเป็นสัดส่วนเดียวกันทุกตาราง (table-fixed) ให้ทุกตารางหน้าตาเท่ากันและตรงแนว
const TABLE = "w-full min-w-[40rem] table-fixed border-collapse border border-slate-300 text-sm";
const TH = "border border-brand-800 bg-brand-700 px-4 py-3.5 text-center font-semibold text-white";
const TD = "border border-slate-300 px-4 py-3 text-center tabular-nums";

// ระยะห่างภายในกล่องหัวข้อ ใช้ชุดเดียวกันทุกกล่อง
const SECTION_HEAD = "border-b border-slate-200 px-5 py-4 sm:px-6";
const SECTION_BODY = "px-5 py-5 sm:px-6";
const SECTION_FOOT = "border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:px-6";

/** สลับสีพื้นแถว และไฮไลต์แถวของส่วนงานผู้ใช้ */
function rowTone(isMine: boolean, index: number): string {
  if (isMine) return "bg-accent-50";
  return index % 2 === 1 ? "bg-slate-50 hover:bg-brand-50" : "bg-white hover:bg-brand-50";
}

/** คะแนนไตรมาสล่าสุดที่นำเข้า */
function QuarterCell({ d, scores }: { d: DepartmentScoreRow; scores: DepartmentScoreData }) {
  const score = d.quarterScores[String(scores.latestQuarter) as QuarterKey];
  return (
    <td className={`${TD} whitespace-nowrap`}>
      {score === null ? <span className="text-slate-400">–</span> : score.toFixed(3)}
    </td>
  );
}

/** คะแนนปี */
function YearCell({ d }: { d: DepartmentScoreRow }) {
  return (
    <td className={`${TD} whitespace-nowrap`}>
      {d.yearScore === null ? <span className="text-slate-400">–</span> : d.yearScore.toFixed(3)}
    </td>
  );
}
