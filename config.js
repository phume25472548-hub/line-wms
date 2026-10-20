/**
 * config.js — ตั้งค่าการเชื่อมต่อ (แก้ไฟล์นี้ไฟล์เดียวตอนติดตั้ง)
 * ไฟล์นี้เปิดเผยได้ ไม่มีข้อมูลลับ (ห้ามใส่ Channel Secret / Token ใด ๆ ที่นี่)
 */
window.APP_CONFIG = {
  // LIFF ID จาก LINE Developers > LINE Login channel > LIFF  เช่น '2001234567-AbCdEfGh'
  LIFF_ID: 'YOUR_LIFF_ID',

  // URL ของ Google Apps Script Web App ที่ลงท้ายด้วย /exec
  API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',

  // เวลารอคำตอบสูงสุดต่อครั้ง (มิลลิวินาที)
  REQUEST_TIMEOUT_MS: 30000
};
