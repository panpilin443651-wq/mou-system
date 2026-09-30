-- ปิดไม่ให้ตารางของระบบถูกอ่าน/เขียนผ่าน Data API ของ Supabase
--
-- Supabase เปิดทุกตารางใน schema public ให้เรียกผ่าน REST API ได้ด้วย anon key
-- และ anon key ถูกส่งไปถึงเบราว์เซอร์ของทุกคน (NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- ถ้าไม่ปิด ใครก็ใช้ key นั้นอ่านหรือแก้ตาราง User, Indicator ฯลฯ ได้ตรงๆ โดยไม่ผ่านเว็บ
--
-- ระบบนี้อ่านเขียนข้อมูลผ่าน Prisma เท่านั้น (ต่อด้วย role postgres ซึ่งข้าม RLS)
-- Supabase ใช้แค่ระบบ login จึงปิด Data API ของทุกตารางได้โดยไม่กระทบการทำงาน
--
-- 1) เปิด RLS ทุกตาราง โดยไม่สร้าง policy = role anon / authenticated เข้าไม่ได้เลย
-- 2) ถอนสิทธิ์ของ anon / authenticated ออก และกันตารางที่จะสร้างในอนาคตด้วย
--
-- ข้อ 2 ทำเฉพาะเมื่อมี role ของ Supabase อยู่ ฐานข้อมูล Postgres อื่นจึงรัน migration นี้ผ่านได้เหมือนกัน

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
