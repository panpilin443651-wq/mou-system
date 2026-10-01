import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canManagePlan, canSubmitReport } from "@/lib/permissions";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_PLAN_FILES_PER_ROW,
} from "@/lib/attachments";
import { getWindowStatus } from "@/lib/submission-window";

// ============================================================================
// จุดออก "บัตรผ่าน" ให้เบราว์เซอร์อัปโหลดไฟล์ตรงไปที่ Vercel Blob
// ============================================================================
// เบราว์เซอร์จะขอบัตรผ่านจากที่นี่ก่อน แล้วค่อยส่งไฟล์ตรงไป Blob เอง
//
// การตรวจสิทธิ์ทั้งหมดต้องเกิดตรงนี้ ก่อนออกบัตรผ่าน
// ถ้าไปตรวจหลังอัปโหลดเสร็จ ไฟล์จะขึ้นไปอยู่บน Blob เรียบร้อยแล้ว
// ต่อให้ปฏิเสธทีหลังก็สายเกินไป
// ============================================================================

export const dynamic = "force-dynamic";

// ไฟล์แนบมีสองแบบ ตรวจสิทธิ์คนละชุด
//   รายงานรายไตรมาส: สิทธิ์กรอกผล + ช่วงเวลาเปิดรับข้อมูล
//   หลักฐานในแผนดำเนินงาน (kind: "plan"): สิทธิ์แก้แผน ไม่ผูกช่วงเวลา
type ClientPayload =
  | {
      kind?: "report";
      indicatorId: string;
      quarter: number;
      criteriaLevel: number;
    }
  | { kind: "plan"; actionPlanId: string };

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // ไม่มี token แล้ว handleUpload จะพังด้วยข้อความภาษาอังกฤษที่ไม่บอกวิธีแก้
  // ฝั่งเบราว์เซอร์ก็เห็นแค่ "Failed to retrieve the client token" จึงบอกชื่อค่าที่ขาดไว้ใน log
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "[upload] ยังไม่ได้ตั้งค่า BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob) จึงออกบัตรผ่านอัปโหลดไม่ได้",
    );
    return NextResponse.json(
      { error: "ระบบเก็บไฟล์ยังไม่ได้ตั้งค่า BLOB_READ_WRITE_TOKEN" },
      { status: 500 },
    );
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // 1. ต้อง login ก่อน
        const user = await getCurrentUser();
        if (!user) throw new Error("กรุณาเข้าสู่ระบบก่อนแนบไฟล์");

        // 2. ข้อมูลที่เบราว์เซอร์ส่งมาต้องอ่านได้และครบ
        if (!clientPayload) throw new Error("ข้อมูลประกอบการอัปโหลดไม่ครบ");
        let payload: ClientPayload;
        try {
          payload = JSON.parse(clientPayload) as ClientPayload;
        } catch {
          throw new Error("ข้อมูลประกอบการอัปโหลดไม่ถูกต้อง");
        }

        const uploadRules = {
          // Blob จะปฏิเสธเองถ้าไฟล์ผิดชนิดหรือใหญ่เกิน ไม่ต้องรอมาตรวจทีหลัง
          allowedContentTypes: [...ALLOWED_MIME_TYPES],
          maximumSizeInBytes: MAX_FILE_BYTES,
          // เติมตัวอักษรสุ่มท้ายชื่อไฟล์ กันชื่อชนกันและกันคนเดาที่อยู่ไฟล์
          addRandomSuffix: true,
        };

        if (payload.kind === "plan") {
          const plan = await db.actionPlan.findUnique({
            where: { id: String(payload.actionPlanId) },
            select: {
              _count: { select: { attachments: true } },
              indicator: {
                select: {
                  departmentId: true,
                  planHeader: { select: { confirmedAt: true } },
                },
              },
            },
          });
          if (!plan)
            throw new Error("ไม่พบบรรทัดแผนนี้ กรุณากดบันทึกแผนก่อนแนบไฟล์");
          if (!canManagePlan(user, plan.indicator.departmentId)) {
            throw new Error("คุณไม่มีสิทธิ์แนบไฟล์ในแผนของส่วนงานนี้");
          }
          // หลักฐานเป็นส่วนของการรายงานผล ต้องส่งแผนก่อน (ส่วนกลางข้ามได้)
          if (user.role !== "ADMIN" && !plan.indicator.planHeader?.confirmedAt) {
            throw new Error("ต้องส่งแผนการดำเนินงานก่อน จึงแนบหลักฐานได้");
          }
          if (plan._count.attachments >= MAX_PLAN_FILES_PER_ROW) {
            throw new Error(`แนบหลักฐานได้ไม่เกิน ${MAX_PLAN_FILES_PER_ROW} ไฟล์ต่อขั้นตอน`);
          }
          return {
            ...uploadRules,
            tokenPayload: JSON.stringify({
              kind: "plan",
              actionPlanId: payload.actionPlanId,
            }),
          };
        }

        const { indicatorId, quarter, criteriaLevel } = payload;
        if (![1, 2, 3, 4].includes(quarter))
          throw new Error("ไตรมาสไม่ถูกต้อง");
        if (![1, 2, 3, 4, 5].includes(criteriaLevel)) {
          throw new Error("ระดับคะแนนไม่ถูกต้อง");
        }

        // 3. ตัวชี้วัดต้องมีอยู่จริง และผู้ใช้ต้องมีสิทธิ์กรอกผลของส่วนงานนั้น
        const indicator = await db.indicator.findUnique({
          where: { id: indicatorId },
          select: { id: true, departmentId: true, fiscalYearId: true },
        });
        if (!indicator) throw new Error("ไม่พบตัวชี้วัดนี้");
        if (!canSubmitReport(user, indicator.departmentId)) {
          throw new Error("คุณไม่มีสิทธิ์แนบไฟล์ของส่วนงานนี้");
        }

        // 4. ต้องอยู่ในช่วงที่เปิดรับข้อมูล (ข้อ 9)
        //    ตรวจตรงนี้เพราะเป็นจุด "ออกบัตรผ่าน" ถ้าไปตรวจตอนบันทึกข้อมูลไฟล์
        //    ไฟล์จะขึ้นไปอยู่บน Blob เรียบร้อยแล้ว ปฏิเสธทีหลังก็สายเกินไป
        const window = await getWindowStatus({
          fiscalYearId: indicator.fiscalYearId,
          quarter,
          departmentId: indicator.departmentId,
          actor: user,
        });
        if (!window.canWrite)
          throw new Error(`แนบไฟล์ไม่ได้ — ${window.message}`);

        // 5. ไม่เกิน 3 ไฟล์ต่อระดับคะแนน (เงื่อนไขเดียวกับหลักฐานในแผน)
        const existing = await db.attachment.count({
          where: { criteriaLevel, report: { indicatorId, quarter } },
        });
        if (existing >= MAX_PLAN_FILES_PER_ROW)
          throw new Error(`แนบไฟล์ได้ไม่เกิน ${MAX_PLAN_FILES_PER_ROW} ไฟล์ต่อระดับ`);

        return {
          ...uploadRules,
          tokenPayload: JSON.stringify({ indicatorId, quarter, criteriaLevel }),
        };
      },

      // Vercel เรียกกลับมาที่นี่เมื่ออัปโหลดเสร็จ แต่เรียกไม่ถึงตอนรันบนเครื่องตัวเอง
      // การบันทึกลงฐานข้อมูลจึงทำที่ Server Action หลังอัปโหลดเสร็จแทน
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ";
    // เบราว์เซอร์อ่านข้อความนี้ไม่ได้ (ไลบรารี Blob แทนด้วยข้อความกลางๆ) ต้องดูสาเหตุจริงจาก log
    console.error("[upload] ไม่ออกบัตรผ่านอัปโหลด:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
