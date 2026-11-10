/**
 * config.js — ตั้งค่าการเชื่อมต่อ (แก้ไฟล์นี้ไฟล์เดียวตอนติดตั้ง)
 * ไฟล์นี้เปิดเผยได้ ไม่มีข้อมูลลับ (ห้ามใส่ Channel Secret / Token ใด ๆ ที่นี่)
 */
window.APP_CONFIG = {
  // LIFF ID จาก LINE Developers > LINE Login channel > LIFF  เช่น '2001234567-AbCdEfGh'
  LIFF_ID: '2012121135-ER2PTeHe',

  // ระบบหลักของ LINE WMS ใช้ Supabase; Apps Script เดิมเก็บไว้เป็นข้อมูลสำรอง
  API_URL: 'https://dqipcgoqzikaghojujkg.supabase.co/functions/v1/line-wms-api',

  // Endpoint เดียวกันใช้กับหน้ารายงานและบันทึกค่าใช้จ่าย
  SUPABASE_API_URL: 'https://dqipcgoqzikaghojujkg.supabase.co/functions/v1/line-wms-api',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_r80uS4T7IpvbIMZtwcqtaA_a-eqU1bi',

  // เวลารอคำตอบสูงสุดต่อครั้ง (มิลลิวินาที)
  REQUEST_TIMEOUT_MS: 30000
};
