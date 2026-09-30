import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

// ============================================================================
// ระบบ Login - ใช้บัญชีในระบบเอง (อีเมล + รหัสผ่าน)
// ============================================================================
// ผู้ใช้สมัครเองไม่ได้ ADMIN เป็นผู้สร้างบัญชีให้เท่านั้น
//
// ข้อมูล session เก็บเป็น JWT ในคุกกี้ที่เข้ารหัสแล้ว ไม่ได้เก็บในฐานข้อมูล
// จึงต้องฝัง role และ departmentId ลงใน token เพื่อให้ตรวจสิทธิ์ได้เร็ว
// ============================================================================

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * เปิดโหมดจำลองสิทธิ์หรือไม่ - เลือกผู้ใช้จากรายชื่อแล้วเข้าได้เลยโดยไม่ต้องใช้รหัสผ่าน
 *
 * ใช้ระหว่างทดลองระบบ ก่อนเชื่อมต่อระบบยืนยันตัวตนขององค์กร
 * ต้องตั้ง DEMO_LOGIN="true" เองเท่านั้น ถ้าไม่ได้ตั้งจะปิดเสมอ
 * เพราะเปิดไว้บนเว็บจริงเมื่อไร ใครก็เข้าเป็นผู้ดูแลระบบได้
 */
export function isDemoLoginEnabled(): boolean {
  return process.env.DEMO_LOGIN === "true";
}

type LoginUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
};

/** บันทึกเวลาเข้าใช้ล่าสุด แล้วคืนข้อมูลที่จะฝังลง token */
async function completeLogin(user: LoginUser) {
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    departmentId: user.departmentId,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "อีเมล", type: "email" },
        password: { label: "รหัสผ่าน", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // บัญชีถูกปิดใช้งาน ก็ถือว่า login ไม่ผ่าน
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return completeLogin(user);
      },
    }),
    // โหมดจำลองสิทธิ์ - ตรวจสวิตช์ซ้ำที่นี่ด้วย ไม่พึ่งแค่การซ่อนรายชื่อบนหน้า login
    // ไม่อย่างนั้นใครรู้ชื่อ provider ก็ยิงตรงมาเข้าได้แม้ปิดโหมดแล้ว
    Credentials({
      id: "demo",
      credentials: {
        userId: { label: "ผู้ใช้", type: "text" },
      },
      async authorize(raw) {
        if (!isDemoLoginEnabled()) return null;

        const userId = typeof raw?.userId === "string" ? raw.userId : "";
        if (!userId) return null;

        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user || !user.isActive) return null;

        return completeLogin(user);
      },
    }),
  ],
  callbacks: {
    // ตอน login สำเร็จ ให้ยัด role และสังกัดลง token
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.departmentId = user.departmentId;
      }
      return token;
    },
    // ย้ายค่าจาก token ออกมาไว้ใน session ให้หน้าเว็บอ่านได้
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role;
        session.user.departmentId = token.departmentId;
      }
      return session;
    },
  },
});
