-- ย้ายระบบ login ไป Supabase Auth
-- authId ผูกผู้ใช้ในระบบกับบัญชีใน auth.users ของ Supabase
-- passwordHash ไม่บังคับแล้ว เพราะบัญชีใหม่เก็บรหัสผ่านที่ Supabase

ALTER TABLE "User" ADD COLUMN "authId" TEXT;
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
