import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { formatThaiDateTime } from "@/lib/datetime";
import { returnDueText } from "@/lib/return-due";
import { DueBadge } from "@/components/return-due-input";
import {
  markAllNotificationsReadAction,
  openNotificationAction,
} from "@/actions/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "แจ้งเตือน | ระบบรายงานผลการดำเนินงานตามบันทึกข้อตกลงของส่วนงานและหน่วยงานที่ไม่สังกัดส่วนงาน" };

// หน้ารวมแจ้งเตือนของกระดิ่ง - ตอนนี้คือการตีกลับแผน/ผลจากส่วนกลาง
// กดรายการแล้วถือว่าอ่าน และพาไปหน้าแผนหรือหน้ารายงานผลที่ต้องแก้
export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => n.readAt === null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">แจ้งเตือน</h1>
          <p className="mt-1 text-sm text-slate-600">
            {unread > 0 ? `ยังไม่อ่าน ${unread.toLocaleString("th-TH")} รายการ` : "อ่านครบทุกรายการแล้ว"}
            {" · "}แจ้งเมื่อส่วนกลางตีกลับแผนหรือผลการดำเนินงาน กดรายการเพื่อดูข้อสังเกตและแก้ไข
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium transition hover:bg-slate-50"
            >
              ทำเครื่องหมายว่าอ่านทั้งหมด
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-6 text-sm text-slate-600">
          ยังไม่มีแจ้งเตือน
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
          {notifications.map((n) => (
            <li key={n.id}>
              <form action={openNotificationAction.bind(null, n.id)}>
                <button
                  type="submit"
                  className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    n.readAt === null ? "bg-red-50/60" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      n.readAt === null ? "bg-red-600" : "bg-transparent"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm ${n.readAt === null ? "font-semibold text-red-800" : "font-medium"}`}
                    >
                      {n.title}
                      {n.readAt === null && <span className="sr-only"> (ยังไม่อ่าน)</span>}
                    </span>
                    {n.dueAt && <DueBadge text={returnDueText(n.dueAt)} />}
                    {n.body && (
                      <span className="mt-0.5 block whitespace-pre-line text-sm text-slate-700">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {formatThaiDateTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
