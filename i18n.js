Warning: truncated output (original token count: 22936)
Total output lines: 880

/* LINE WMS — ภาษาหน้าจอ (ไทย / English / 中文)
 * เปลี่ยนเฉพาะข้อความบนหน้าจอ ไม่แตะฐานข้อมูล: ข้อมูลที่ผู้ใช้พิมพ์เอง (ชื่อสินค้า ช่องทาง เหตุผล) แสดงตามที่บันทึกไว้
 * บิลเงินสด / ใบรายการสินค้าที่พิมพ์ออก เป็นภาษาไทยเสมอ (ไม่ผ่านไฟล์นี้)
 * วิธีเพิ่มคำแปล: เพิ่มแถว ['ข้อความไทย', 'English', '中文'] ในตาราง T ด้านล่าง
 */
(function () {
  'use strict';
  var VERSION = '1.3.0';
  var KEY = 'wms_lang';
  var LANGS = [['th', 'ไทย', 'TH'], ['en', 'English', 'EN'], ['zh', '中文', '中文']];

  function detect() {
    try { var s = localStorage.getItem(KEY); if (s === 'th' || s === 'en' || s === 'zh') return s; } catch (e) { /* โหมดส่วนตัว */ }
    var n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'th').toLowerCase();
    if (n.indexOf('zh') === 0) return 'zh';
    if (n.indexOf('en') === 0) return 'en';
    return 'th';
  }
  var lang = detect();

  /* ---------------------------------------------------------------- */
  /* ตารางคำแปล: [ไทย, English, 中文]                                    */
  /* คีย์ "ข้อความ|ctx" = ความหมายเฉพาะที่ (คำเดียวกันแต่ใช้คนละแบบ)          */
  /* ---------------------------------------------------------------- */
  var T = [
    // ประเภทรายการ / สถานะ
    ['รับเข้า', 'Stock in', '入库'],
    ['ขายออก', 'Sale', '销售出库'],
    ['รับคืน', 'Customer return', '客户退货'],
    ['ส่งคืนซัพพลายเออร์', 'Return to supplier', '退回供应商'],
    ['ตัดเสีย', 'Write-off', '报损'],
    ['ปรับยอด', 'Adjustment', '库存调整'],
    ['ย้ายสถานะ', 'Status transfer', '状态转移'],
    ['ยกเลิกออเดอร์', 'Cancel order', '取消订单'],
    ['พร้อมขาย', 'Available', '可售'],
    ['รอตรวจสอบ', 'Awaiting inspection', '待检'],
    ['ตัดสต๊อกแล้ว', 'Stock deducted', '已扣库存'],
    ['คืนบางส่วน', 'Partly returned', '部分退货'],
    ['คืนครบแล้ว', 'Fully returned', '已全部退货'],
    ['ยกเลิกแล้ว', 'Cancelled', '已取消'],
    ['สภาพดี', 'Good', '完好'],
    ['เข้ายอดพร้อมขาย', 'To available', '计入可售'],
    ['ชำรุด รอตรวจ', 'Needs check', '有损坏待检'],
    ['เข้ายอดรอตรวจสอบ', 'To inspection', '计入待检'],
    ['เสียหาย', 'Broken', '损坏'],
    ['ตัดเสียทันที', 'Write off now', '立即报损'],
    ['ผู้ดูแลระบบ', 'Admin', '管理员'],
    ['พนักงาน', 'Staff', '员工'],
    ['ดูอย่างเดียว', 'View only', '仅查看'],

    // ทั่วไป
    ['ตกลง', 'OK', '确定'],
    ['รวม', 'Total', '合计'],
    ['รายการ', 'items', '项'],
    ['หน่วย', 'units', '件'],
    ['หน่วย|label', 'Unit', '单位'],
    ['ยืนยันบันทึก', 'Confirm & save', '确认保存'],
    ['กลับไปแก้ไข', 'Go back and edit', '返回修改'],
    ['กำลังโหลด', 'Loading', '加载中'],
    ['โหลด LINE LIFF SDK ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วเปิดใหม่', 'Could not load LINE LIFF SDK. Check your internet and open again.', 'LINE LIFF SDK 加载失败，请检查网络后重新打开。'],
    ['เข้าสู่ระบบไม่สำเร็จ', 'Sign-in failed', '登录失败'],
    ['กรุณาปิดหน้าจอนี้แล้วเปิดเมนูคลังสินค้าใน LINE ใหม่อีกครั้ง', 'Please close this screen and open the warehouse menu in LINE again.', '请关闭此页面，然后在 LINE 中重新打开仓库菜单。'],
    ['กำลังเข้าสู่ระบบใหม่', 'Signing in again', '正在重新登录'],
    ['เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง', 'The server returned an invalid response', '服务器响应无效'],
    ['เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'Cannot reach the server. Please check your internet.', '无法连接服务器，请检查网络。'],
    ['ยังไม่ทราบผลการบันทึก', 'Save result not known yet', '保存结果未知'],
    ['สัญญาณไม่ดี กำลังลองส่งอีกครั้ง', 'Weak signal, retrying', '信号不好，正在重试'],
    ['มีพนักงานอื่นกำลังบันทึก รอสักครู่', 'Another user is saving, please wait', '其他员工正在保存，请稍候'],
    ['กำลังตรวจสอบผลการบันทึก', 'Checking save result', '正在核对保存结果'],
    ['กำลังบันทึก… ห้ามปิดหน้าจอ', 'Saving… do not close the screen', '保存中… 请勿关闭页面'],
    ['รายการนี้ถูกบันทึกไว้แล้ว (ไม่บันทึกซ้ำ', 'This was already saved (not saved twice', '此记录已保存（不会重复保存'],
    ['สัญญาณขาดระหว่างบันทึก', 'Connection lost while saving', '保存时网络中断'],
    ['ระบบเก็บรายการไว้แล้ว กดตรวจสอบสถานะได้เลย ห้ามทำรายการเดิมซ้ำด้วยมือ', 'The entry is kept on this device. Tap Check status — do not enter it again by hand.', '系统已暂存该记录，请点“检查状态”，不要手动重复操作。'],
    ['ตรวจสอบสถานะ', 'Check status', '检查状态'],
    ['ไว้ตรวจทีหลัง', 'Check later', '稍后检查'],
    ['กำลังตรวจสอบรายการล่าสุด', 'Checking the last entry', '正在检查最近的记录'],
    ['บันทึกสำเร็จแล้ว', 'Saved successfully', '已成功保存'],
    ['ถูกบันทึกเรียบร้อย', 'was saved', '已保存'],
    ['รายการยังไม่ถูกบันทึก', 'Entry not saved yet', '记录尚未保存'],
    ['ยังไม่พบในระบบ ต้องการส่งรายการเดิมอีกครั้งหรือไม่?\n(ระบบใช้รหัสคำขอเดิม จึงไม่บันทึกซ้ำแน่นอน', 'was not found in the system. Send the same entry again?\n(It uses the same request ID, so it will never be saved twice', '在系统中未找到。要重新发送该记录吗？\n（系统使用原请求编号，绝不会重复保存'],
    ['ส่งรายการเดิมอีกครั้ง', 'Send the same entry again', '重新发送原记录'],
    ['ยกเลิกรายการนี้', 'Discard this entry', '放弃此记录'],
    ['บันทึกสำเร็จ', 'Saved', '保存成功'],
    ['บันทึกเรียบร้อย', 'Saved successfully', '保存成功'],
    ['ยังตรวจสอบไม่ได้', 'Cannot check yet', '暂时无法检查'],
    ['เลขออเดอร์', 'Order no.', '订单号'],
    ['เลขเอกสาร', 'Document no.', '单据号'],
    ['สต๊อกไม่พอ', 'Not enough stock', '库存不足'],
    ['ออเดอร์ซ้ำ', 'Duplicate order', '订单重复'],
    ['ไม่พบสินค้า', 'Product not found', '未找到商品'],
    ['ไม่มีสิทธิ์', 'No permission', '没有权限'],
    ['รับคืนเกินจำนวน', 'Return exceeds quantity', '退货数量超出'],
    ['ยอดในระบบเปลี่ยน', 'Stock changed in the system', '系统库存已变化'],
    ['เชื่อมต่อไม่ได้', 'Cannot connect', '无法连接'],
    ['ระบบไม่ว่าง', 'System busy', '系统繁忙'],
    ['ทำรายการไม่สำเร็จ', 'Could not complete', '操作未成功'],
    ['ย้อนกลับ', 'Back', '返回'],

    // สแกน
    ['โหมดสแกนต่อเนื่อง: สแกนทีละชิ้น ระบบนับให้อัตโนมัติ', 'Continuous mode: scan one piece at a time, counted automatically', '连续扫描：逐件扫描，系统自动计数'],
    ['เล็งบาร์โค้ด/QR ให้อยู่ในกรอบ', 'Aim the barcode/QR inside the frame', '将条码/二维码对准框内'],
    ['หรือพิมพ์รหัส แล้วกด Enter', 'Or type the code and press Enter', '或输入编码后按 Enter'],
    ['สแกน', 'Scan', '扫描'],
    ['ปิดกล้อง', 'Close camera', '关闭相机'],
    ['เสร็จสิ้นการสแกน', 'Finish scanning', '完成扫描'],
    ['ปิด', 'Close', '关闭'],
    ['ไม่พบตัวสแกน (โหลดไลบรารีไม่สำเร็จ', 'Scanner not found (library failed to load', '找不到扫描组件（库加载失败'],
    ['เปิดกล้องไม่ได้ — กรุณาอนุญาตการใช้กล้องให้ LINE หรือพิมพ์รหัสด้านล่าง / ใช้เครื่องสแกนบลูทูธ', 'Cannot open the camera — allow camera access for LINE, type the code below, or use a Bluetooth scanner', '无法打开相机 — 请允许 LINE 使用相机，或在下方输入编码 / 使用蓝牙扫描枪'],
    ['ใช้ตัวสแกน QR ของ LINE', 'Use LINE QR scanner', '使用 LINE 二维码扫描'],
    ['ไม่พบสินค้าในระบบ', 'Product not in the system', '系统中没有此商品'],
    ['รหัส', 'Code', '编码'],
    ['ยังไม่มีในระบบ ตรวจสอบว่าสแกนถูกชิ้น หรือสร้างเป็นสินค้าใหม่', 'is not in the system yet. Check you scanned the right item, or create a new product.', '尚未在系统中。请确认扫描的是正确商品，或新建商品。'],
    ['สร้างสินค้าใหม่', 'Create new product', '新建商品'],
    ['เช่น เครื่องพิมพ์ใบปะหน้า 80mm', 'e.g. 80mm shipping-label printer', '例如 80mm 面单打印机'],
    ['หมวดหมู่ (ไม่บังคับ', 'Category (optional', '分类（选填'],
    ['ค่าเริ่มต้นตามตั้งค่า', 'Default from settings', '按系统设置默认'],
    ['เช่น', 'e.g.', '例如'],
    ['บันทึกสินค้า', 'Save product', '保存商品'],
    ['กรุณากรอก SKU และชื่อสินค้า', 'Please enter SKU and product name', '请填写 SKU 和商品名称'],
    ['ราคาขายต้องเป็นตัวเลข 0 ขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง', 'Price must be a number 0 or more (max 2 decimals', '售价必须是 0 或以上的数字（最多 2 位小数'],
    ['สร้างสินค้า', 'Create product', '新建商品'],
    ['แก้ไขสินค้า', 'Edit product', '编辑商品'],
    ['SKU / บาร์โค้ด', 'SKU / Barcode', 'SKU / 条码'],
    ['ชื่อสินค้า', 'Product name', '商品名称'],
    ['หมวดหมู่', 'Category', '分类'],
    ['แจ้งเตือนเมื่อพร้อมขายเหลือไม่เกิน', 'Low-stock alert when available is at or below', '可售数量低于或等于此值时提醒'],
    ['ราคาขายหลัก (บาท) — ใช้ในเมนูขายหน้าร้าน', 'List price (THB) — used in Store sale', '标准售价（泰铢）— 用于门店销售'],
    ['ราคาขายหลัก', 'List price', '标准售价'],
    ['ยังไม่ได้ตั้ง', 'not set', '未设置'],
    ['บาท', 'THB', '泰铢'],
    ['ตั้ง/แก้ได้เฉพาะผู้ดูแลระบบ', 'only admins can set/edit', '仅管理员可设置/修改'],
    ['เปิดใช้งานสินค้านี้', 'Product is active', '启用此商品'],
    ['ยกเลิก', 'Cancel', '取消'],
    ['จำนวนต้องเป็นจำนวนเต็มมากกว่า', 'Quantity must be a whole number greater than', '数量必须是大于以下值的整数'],
    ['ระบุจำนวน', 'Enter quantity', '输入数量'],
    ['เพิ่มลงรายการ', 'Add to list', '加入列表'],
    ['พิมพ์ชื่อหรือรหัสสินค้าอย่างน้อย 2 ตัวอักษร', 'Type at least 2 characters of a name or code', '请输入至少 2 个字符的名称或编码'],
    ['ค้นหาชื่อสินค้า / SKU', 'Search product name / SKU', '搜索商品名称 / SKU'],
    ['ค้นหาชื่อสินค้า', 'Search product name', '搜索商品名称'],
    ['ปิดใช้งาน', 'inactive', '已停用'],
    ['ยังไม่มีราคาขาย', 'No sale price yet', '尚无售价'],
    ['ค้นหาสินค้า', 'Search products', '搜索商品'],
    ['สแกน / พิมพ์รหัสสินค้า แล้วกด Enter', 'Scan / type product code, then press Enter', '扫描 / 输入商品编码后按 Enter'],
    ['สแกน / พิมพ์รหัสสินค้า แล้วกด', 'Scan / type product code, then press', '扫描 / 输入商品编码后按'],
    ['รหัสสินค้า', 'Product code', '商品编码'],
    ['เปิดกล้องสแกน', 'Open camera to scan', '打开相机扫描'],
    ['สแกนบาร์โค้ด', 'Scan barcode', '扫描条码'],
    ['ค้นหาจากชื่อ', 'Search by name', '按名称搜索'],
    ['สินค้า', 'Product', '商品'],
    ['สินค้า|count', '', ''],
    ['ถูกปิดใช้งาน', 'is inactive', '已停用'],
    ['ยังไม่มีสินค้า — กดปุ่มกล้องเพื่อสแกน', 'No items yet — tap the camera button to scan', '还没有商品 — 点相机按钮扫描'],
    ['จำนวน', 'Quantity', '数量'],
    ['ลบ', 'Remove', '删除'],
    ['เกินยอดคงเหลือ', 'Over stock by', '超出库存'],
    ['ลด', 'Decrease', '减少'],
    ['เพิ่ม', 'Increase', '增加'],
    ['สแกนแล้วกรอกจำนวน', 'Scan, then enter quantity', '扫描后输入数量'],
    ['สแกนทีละชิ้น', 'Scan each piece', '逐件扫描'],
    ['สแกนสินค้า', 'Scan products', '扫描商品'],
    ['ใกล้หมด (จุดแจ้งเตือน', 'Running low (alert at', '库存偏低（提醒值'],
    ['คงเหลือ', 'Balance', '结余'],
    ['รอตรวจ', 'to inspect', '待检'],
    ['ของคืนเสียหาย', 'damaged return', '退货损坏'],
    ['ตรวจไม่ผ่าน', 'Failed inspection', '检验不合格'],
    ['ตรวจผ่าน', 'Passed inspection', '检验合格'],
    ['นับได้เพิ่ม', 'counted more', '盘盈'],
    ['นับได้ลด', 'counted less', '盘亏'],
    ['ยอดคงเหลือหลังบันทึก', 'Balance after saving', '保存后结余'],
    ['หน้าหลัก', 'Home', '首页'],
    ['ทำรายการต่อ', 'Continue', '继续操作'],

    // หน้าหลัก
    ['รับสินค้าเข้า', 'Stock in', '商品入库'],
    ['สแกนรับของเข้าคลัง', 'Scan goods into the warehouse', '扫描入库'],
    ['ขายหน้าร้าน', 'Store sale', '门店销售'],
    ['ขายตรง ราคาขึ้นเอง ออกบิล', 'Direct sale, auto price, cash bill', '直销，自动带价，开单'],
    ['ขายสินค้าออก', 'Platform sale', '平台出库'],
    ['ออเดอร์แพลตฟอร์ม แพ็กของ', 'Platform orders, packing', '平台订单打包'],
    ['รับคืนสินค้า', 'Customer return', '客户退货'],
    ['ลูกค้าคืนของ', 'Goods back from customer', '客户退回商品'],
    ['ส่งคืนสินค้า', 'Return goods', '退回商品'],
    ['คืนซัพพลายเออร์', 'Back to supplier', '退回供应商'],
    ['ตัดสินค้าเสีย', 'Write off', '商品报损'],
    ['แตก ชำรุด หาย หมดอายุ', 'Broken, damaged, lost, expired', '破损、损坏、丢失、过期'],
    ['เช็กสต๊อก', 'Check stock', '查库存'],
    ['สแกนดูยอดคงเหลือ', 'Scan to see balance', '扫描查看结余'],
    ['ตรวจนับสินค้า', 'Stock count', '盘点'],
    ['นับจริงและปรับยอด', 'Count and adjust', '实盘并调整'],
    ['ประวัติรายการ', 'History', '流水记录'],
    ['ค้นหาการเคลื่อนไหว', 'Search movements', '查询库存变动'],
    ['ผลตรวจสอบ', 'Inspection result', '检验结果'],
    ['ย้ายของรอตรวจ', 'Move inspected goods', '处理待检商品'],
    ['คืนสต๊อกออเดอร์', 'Return order stock', '订单库存回退'],
    ['บิลและเอกสาร', 'Bills & documents', '单据与文件'],
    ['ยอดขายวันนี้ พิมพ์ซ้ำ', "Today's sales, reprint", '今日销售，补打'],
    ['สรุปภาพรวม', 'Overview', '概览'],
    ['การเงิน', 'Finance', '财务'],
    ['ต้นทุน ยอดเงิน กำไร', 'Cost, payments, profit', '成本、收款、利润'],
    ['ตั้งค่าระบบ', 'Settings', '系统设置'],
    ['ช่องทาง พนักงาน สินค้า', 'Channels, staff, products', '渠道、员工、商品'],
    ['ระบบคลังสินค้า', 'Warehouse system', '仓库管理系统'],
    ['มีรายการที่ยังไม่ทราบผลการบันทึก แตะเพื่อตรวจสอบ', 'An entry has an unknown save result — tap to check', '有记录的保存结果未知，点此检查'],

    // รับเข้า / ส่งคืน / ตัดเสีย
    ['จากยอดพร้อมขาย', 'From available', '从可售'],
    ['จากยอดรอตรวจสอบ', 'From inspection', '从待检'],
    ['ตรวจสอบและยืนยัน', 'Review & confirm', '核对并确认'],
    ['สแกนสินค้าก่อน', 'Scan products first', '请先扫描商品'],
    ['มีไม่พอ', 'not enough stock', '库存不足'],
    ['กรุณาแก้จำนวนก่อนยืนยัน', 'Please fix the quantity before confirming', '请先修改数量再确认'],
    ['ตัดจากสถานะ', 'Take from status', '扣减状态'],
    ['ยืนยันรับสินค้าเข้า', 'Confirm stock in', '确认入库'],
    ['รับสินค้าล็อตถัดไป', 'Next batch', '下一批入库'],
    ['ประเภทการรับเข้า', 'Stock-in type', '入库类型'],
    ['หมายเหตุ (ถ้ามี', 'Note (optional', '备注（选填'],
    ['เช่น เลขใบส่งของ / ชื่อผู้ส่ง', 'e.g. delivery note no. / sender', '例如 送货单号 / 发货人'],
    ['เลือก "อื่น ๆ" กรุณาระบุหมายเหตุ', 'You chose "Other" — please add a note', '选择了“其他”，请填写备注'],
    ['ประเภท', 'Type', '类型'],
    ['หมายเหตุ', 'Note', '备注'],
    ['ยืนยันส่งคืนซัพพลายเออร์', 'Confirm return to supplier', '确认退回供应商'],
    ['ส่งคืนรายการใหม่', 'New supplier return', '新的退货'],
    ['ซัพพลายเออร์', 'Supplier', '供应商'],
    ['ชื่อร้าน/โรงงาน', 'Shop / factory name', '店铺/工厂名称'],
    ['เลขอ้างอิงการส่งคืน', 'Return reference no.', '退货参考号'],
    ['เช่น RMA / เลขพัสดุ', 'e.g. RMA / tracking no.', '例如 RMA / 快递单号'],
    ['เหตุผล', 'Reason', '原因'],
    ['กรุณาระบุชื่อซัพพลายเออร์', 'Please enter the supplier name', '请填写供应商名称'],
    ['ตัดจาก', 'Taken from', '扣减自'],
    ['เลขอ้างอิง', 'Reference no.', '参考号'],
    ['ยืนยันตัดสินค้าเสีย', 'Confirm write-off', '确认报损'],
    ['ยืนยันตัดเสีย', 'Confirm write-off', '确认报损'],
    ['ตัดเสียรายการใหม่', 'New write-off', '新的报损'],
    ['รายละเอียดเพิ่มเติม', 'More details', '更多说明'],

    // ขายออก (แพลตฟอร์ม)
    ['ขายตรง · เลขบิลจากระบบ', 'Direct · system bill no.', '直销 · 系统生成单号'],
    ['แพลตฟอร์ม · สแกนเลขออเดอร์จริง', 'Platform · scan real order no.', '平台 · 扫描真实订单号'],
    ['สแกนเลขออเดอร์', 'Scan order no.', '扫描订单号'],
    ['สแกน / พิมพ์เลขออเดอร์ แล้วกด Enter', 'Scan / type order no., then press Enter', '扫描 / 输入订单号后按 Enter'],
    ['สแกน / พิมพ์เลขออเดอร์ แล้วกด', 'Scan / type order no., then press', '扫描 …10936 tokens truncated…nt given', '共给予折扣'],
    ['ไม่นับบิลที่ยกเลิก', 'Cancelled bills not counted:', '不计已取消单据：'],
    ['ใบ', '', '张'],
    ['กำไรประมาณ', 'Approx. profit', '估计利润'],
    ['ยังไม่รวม', 'excludes', '不含'],
    ['บิลที่สินค้ายังไม่มีต้นทุน — กรอกต้นทุนได้ที่เมนูการเงิน', 'bills with products that have no cost — enter costs in the Finance menu', '张商品尚无成本的单据 — 可在财务菜单填写成本'],
    ['กำไร: ยังคำนวณไม่ได้ เพราะสินค้าในบิลยังไม่มีต้นทุน (กรอกได้ที่เมนูการเงิน', 'Profit: cannot calculate yet because the products have no cost (enter it in the Finance menu', '利润：暂时无法计算，因为单据中的商品没有成本（可在财务菜单填写'],
    ['ทุกวัน', 'all dates', '全部日期'],
    ['ไม่พบบิล', 'No bills found', '未找到单据'],
    ['ยังไม่มีบิลขายตรงในวันนี้', 'No direct-sale bills on this day', '当天还没有直销单据'],
    ['ยกเลิก|badge', 'Cancelled', '已取消'],
    ['มีส่วนลด', 'Discounted', '有折扣'],
    ['พิมพ์สำเนา', 'Print copy', '打印副本'],
    ['บิลเงินสด', 'Cash bill', '现金单'],
    ['บิลนี้ถูกยกเลิกแล้ว (พิมพ์ได้โดยมีตรา "ยกเลิกแล้ว', 'This bill is cancelled (it prints with a "Cancelled" stamp', '此单已取消（打印时带“已取消”印章'],
    ['มีการรับคืนสินค้าจากบิลนี้แล้ว — บิลแสดงรายการตอนขาย', 'Items from this bill were returned — the bill shows the original sale', '此单已有退货 — 单据显示销售时的内容'],
    ['ใบรายการสินค้า', 'Item list', '商品清单'],
    ['ออเดอร์นี้ถูกยกเลิกแล้ว', 'This order is cancelled', '此订单已取消'],
    ['เอกสารที่พิมพ์ออกเป็นภาษาไทย', 'Printed documents are in Thai', '打印的单据为泰文'],

    // ราคาขายหลัก
    ['เช่น ราคาโปรเดือนนี้', "e.g. this month's promo price", '例如 本月促销价'],
    ['บันทึกราคาขาย', 'Save price', '保存售价'],
    ['ราคาขาย', 'Sale price', '售价'],
    ['ราคาขายต่อ', 'Sale price per', '售价 / '],
    ['ราคานี้ขึ้นอัตโนมัติในเมนูขายหน้าร้าน พนักงานยังแก้ราคา/ให้ส่วนลดในแต่ละบิลได้', 'This price fills in automatically in Store sale. Staff can still change prices or give discounts on each bill.', '此价格会在门店销售中自动带出，员工仍可在每单中改价或打折。'],
    ['รายการยังไม่มีราคาขายหลัก', 'products have no list price yet', '项商品尚无标准售价'],
    ['สินค้าทุกตัวมีราคาขายแล้ว', 'Every product has a price', '所有商品都已有售价'],

    // ตั้งค่าระบบ
    ['ตั้งค่า', 'Settings', '设置'],
    ['ตรวจระบบ', 'System check', '系统检查'],
    ['เพิ่มช่องทางขาย', 'Add sales channel', '添加销售渠道'],
    ['ขายตรง · บิลเงินสด เลข', 'Direct · cash bill no.', '直销 · 现金单号'],
    ['แพลตฟอร์ม · ใบรายการสินค้า', 'Platform · item list', '平台 · 商品清单'],
    ['เปิด', 'On', '启用'],
    ['ปิด|state', 'Off', '停用'],
    ['พนักงานใหม่ให้เปิดเมนูคลังสินค้าใน LINE หนึ่งครั้ง แล้วชื่อจะขึ้นที่นี่ในสถานะ "รออนุมัติ', 'New staff: open the warehouse menu in LINE once, then the name appears here as "Pending approval', '新员工在 LINE 中打开一次仓库菜单后，名字会以“待审批”状态显示在这里'],
    ['ใช้งาน', 'Active', '使用中'],
    ['รออนุมัติ/ปิด', 'Pending/off', '待审批/停用'],
    ['สแกน/พิมพ์ SKU ใหม่', 'Scan/type new SKU', '扫描/输入新 SKU'],
    ['ถัดไป', 'Next', '下一步'],
    ['สแกน SKU ใหม่', 'Scan new SKU', '扫描新 SKU'],
    ['สแกนด้วยกล้อง', 'Scan with camera', '用相机扫描'],
    ['สร้างสินค้าแล้ว', 'Product created', '商品已创建'],
    ['ค้นหาและแก้ไขสินค้า', 'Find and edit products', '查找并编辑商品'],
    ['ว่าง', 'empty', '空'],
    ['ล็อก', 'Locked', '锁定'],
    ['เวอร์ชัน', 'Version', '版本'],
    ['เวอร์ชันหน้าจอ', 'Screen version', '界面版本'],
    ['ยอดสต๊อกตรงกับประวัติธุรกรรมทุก SKU (', 'All SKUs match the transaction history (', '所有 SKU 库存与交易记录一致（'],
    ['ตรวจเมื่อ', 'checked at', '检查时间'],
    ['พบยอดไม่ตรง', 'Mismatches found:', '发现不一致：'],
    ['รายการค้าง', 'pending entries', '待处理记录'],
    ['ตรวจความถูกต้องของยอดสต๊อก', 'Verify stock balances', '核对库存准确性'],
    ['ชื่อที่แสดง', 'Display name', '显示名称'],
    ['คำนำหน้าเลขบิล', 'Bill number prefix', '单号前缀'],
    ['แพลตฟอร์ม', 'Platform', '平台'],
    ['สแกนเลขออเดอร์จริง · ใบรายการสินค้า', 'Scan real order no. · item list', '扫描真实订单号 · 商品清单'],
    ['ขายตรง', 'Direct sale', '直销'],
    ['ระบบออกเลขบิล · บิลเงินสด', 'System issues bill no. · cash bill', '系统生成单号 · 现金单'],
    ['บันทึก', 'Save', '保存'],
    ['บันทึกช่องทาง', 'Save channel', '保存渠道'],
    ['แก้ไขช่องทางขาย', 'Edit sales channel', '编辑销售渠道'],
    ['รหัสช่องทาง', 'Channel code', '渠道编码'],
    ['ชื่อช่องทาง', 'Channel name', '渠道名称'],
    ['ประเภทช่องทาง', 'Channel type', '渠道类型'],
    ['เปิดใช้งาน', 'Active', '启用'],
    ['ทำรายการสต๊อกได้', 'Can do stock work', '可操作库存'],
    ['ทำได้ทุกอย่าง', 'Can do everything', '全部权限'],
    ['ดูยอด/รายงาน', 'View stock/reports', '查看库存/报表'],
    ['บันทึก / อนุมัติ', 'Save / approve', '保存 / 审批'],
    ['บันทึกพนักงาน', 'Save staff', '保存员工'],
    ['ข้อมูลพนักงาน', 'Staff details', '员工信息'],
    ['ชื่อที่แสดงในประวัติ', 'Name shown in history', '记录中显示的名称'],
    ['บทบาท', 'Role', '角色'],
    ['อนุญาตให้ใช้งาน', 'Allow access', '允许使用'],
    ['บิลทั่วไป ประหยัดกระดาษ', 'Normal bills, saves paper', '普通单据，省纸'],
    ['เต็มแผ่น เหมาะกับรายการยาว', 'Full sheet, for long lists', '整张纸，适合长清单'],
    ['เว้นว่างได้', 'Can be left blank', '可留空'],
    ['คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค', 'separate items with a comma', '各项之间用逗号分隔'],
    ['คัดลอกแล้ว', 'Copied', '已复制'],
    ['คัดลอกไม่ได้ กรุณาจดรหัส', 'Cannot copy — please write the code down', '无法复制，请抄下编码'],
    ['คัดลอกรหัส', 'Copy code', '复制编码'],
    ['ลองใหม่', 'Try again', '重试'],
    ['ยังไม่ได้ตั้งค่าการเชื่อมต่อ', 'Connection not set up', '尚未配置连接'],
    ['ผู้ดูแลระบบต้องแก้ไฟล์ config.js ใส่ LIFF_ID และ API_URL ก่อนใช้งาน (ดูคู่มือติดตั้ง ขั้นตอนที่ 7)', 'An admin must edit config.js and set LIFF_ID and API_URL before use (see the install guide, step 7)', '管理员需先在 config.js 中填写 LIFF_ID 和 API_URL（见安装手册第 7 步）'],
    ['รอผู้ดูแลอนุมัติ', 'Waiting for admin approval', '等待管理员审批'],
    ['ระบบลงทะเบียนชื่อ LINE ของคุณ', 'Your LINE name', '您的 LINE 名称'],
    ['แล้ว\nกรุณาแจ้งผู้ดูแลระบบให้อนุมัติในเมนู ตั้งค่าระบบ > พนักงาน', 'has been registered.\nPlease ask an admin to approve you in Settings > Staff', '已登记。\n请联系管理员在 系统设置 > 员工 中审批'],
    ['รหัสผู้ใช้ LINE ของคุณ', 'Your LINE user ID', '您的 LINE 用户编号'],
    ['เปิดระบบไม่สำเร็จ', 'Could not open the system', '系统打开失败'],

    // ภาษา
    ['ภาษา', 'Language', '语言'],
    ['เลือกภาษาหน้าจอ', 'Choose screen language', '选择界面语言'],
    ['เปลี่ยนเฉพาะข้อความบนหน้าจอ ข้อมูลในระบบ (ชื่อสินค้า ช่องทาง เหตุผล) แสดงตามที่บันทึกไว้ และบิลที่พิมพ์ออกเป็นภาษาไทย', 'Only screen text changes. Data you saved (product names, channels, reasons) shows as saved, and printed bills stay in Thai.', '只更改界面文字。系统中保存的数据（商品名称、渠道、原因）按原样显示，打印单据保持泰文。'],
    ['ข้อความจากระบบ (ภาษาไทย)', 'System message (Thai)', '系统原文（泰文）'],
    ['ระบบแจ้งข้อผิดพลาด', 'The system reported an error', '系统报告错误'],

    // ค่าที่มักใช้ในรายการเหตุผล/ประเภท (แปลเฉพาะตอนแสดง ค่าที่บันทึกยังเป็นภาษาไทย)
    ['อื่น ๆ', 'Other', '其他'],
    ['อื่นๆ', 'Other', '其他'],
    ['ซื้อเข้า', 'Purchase', '采购入库'],
    ['สั่งซื้อ', 'Purchase', '采购'],
    ['นำเข้าจากจีน', 'Imported from China', '从中国进口'],
    ['สินค้าแตก', 'Broken', '破损'],
    ['แตก', 'Broken', '破损'],
    ['ชำรุด', 'Damaged', '损坏'],
    ['สูญหาย', 'Lost', '丢失'],
    ['หาย', 'Lost', '丢失'],
    ['หมดอายุ', 'Expired', '过期'],
    ['ลูกค้ายกเลิก', 'Customer cancelled', '客户取消'],
    ['สินค้าหมด', 'Out of stock', '缺货'],
    ['ที่อยู่ผิด', 'Wrong address', '地址错误'],
    ['ส่งไม่สำเร็จ', 'Delivery failed', '配送失败'],
    ['นับผิด', 'Miscount', '点错数'],
    ['บันทึกผิด', 'Entry mistake', '录入错误'],
    ['สินค้าผิดรุ่น', 'Wrong model', '型号错误'],
    ['ผิดรุ่น', 'Wrong model', '型号错误'],
    ['สินค้าไม่ตรงปก', 'Not as described', '与描述不符'],
    ['ตรวจนับประจำรอบ', 'Routine count', '例行盘点'],
    ['ตรวจนับประจำเดือน', 'Monthly count', '月度盘点'],
    ['รับคืนจากลูกค้า', 'Customer return', '客户退货'],
    ['ยกยอดมา', 'Opening balance', '期初结转'],
    ['ยอดยกมา', 'Opening balance', '期初结转']
  ];

  /* ข้อความจากเซิร์ฟเวอร์ (Code.gs เป็นภาษาไทย) → แปลจากรหัสผิดพลาด */
  var ERR = {
    AUTH_REQUIRED: ['Please sign in again', '请重新登录'],
    AUTH_EXPIRED: ['Your sign-in has expired, please sign in again', '登录已过期，请重新登录'],
    AUTH_INVALID: ['Sign-in could not be verified', '登录验证失败'],
    USER_PENDING: ['Waiting for admin approval', '等待管理员审批'],
    USER_INACTIVE: ['This user is not allowed to use the system', '此用户未被允许使用系统'],
    FORBIDDEN: ['You do not have permission for this', '您没有此操作的权限'],
    VALIDATION: ['Some information is missing or invalid', '部分信息缺失或无效'],
    BAD_REQUEST: ['Some information is missing or invalid', '部分信息缺失或无效'],
    INVALID: ['Some information is missing or invalid', '部分信息缺失或无效'],
    NOT_FOUND: ['Not found', '未找到'],
    SKU_NOT_FOUND: ['Product not found', '未找到商品'],
    PRODUCT_NOT_FOUND: ['Product not found', '未找到商品'],
    PRODUCT_INACTIVE: ['This product is inactive', '此商品已停用'],
    SKU_EXISTS: ['This SKU already exists', '此 SKU 已存在'],
    DUPLICATE_SKU: ['This SKU already exists', '此 SKU 已存在'],
    INSUFFICIENT_STOCK: ['Not enough stock for this entry', '库存不足，无法完成'],
    DUPLICATE_ORDER: ['This order number was already recorded', '此订单号已登记过'],
    ORDER_NOT_FOUND: ['Order not found', '未找到订单'],
    ORDER_CANCELLED: ['This order is cancelled', '此订单已取消'],
    ALREADY_CANCELLED: ['This order is already cancelled', '此订单已取消'],
    RETURN_EXCEEDS: ['Return quantity is more than what can be returned', '退货数量超过可退数量'],
    STALE_BALANCE: ['Stock changed while you were counting. The latest balance will be reloaded — please check and save again.', '盘点期间库存已变化，将重新加载最新数量，请核对后再保存。'],
    BUSY: ['The system is busy, please try again', '系统繁忙，请重试'],
    LOCK_TIMEOUT: ['The system is busy, please try again', '系统繁忙，请重试'],
    COST_MISSING: ['Some products have no cost yet — please enter costs', '部分商品尚无成本，请先填写成本'],
    USE_POS: ['This is a direct-sale channel — use "Store sale"', '这是直销渠道，请使用“门店销售”'],
    NOT_DIRECT: ['This is a platform channel — use "Platform sale"', '这是平台渠道，请使用“平台出库”'],
    CHANNEL_NOT_FOUND: ['Sales channel not found', '未找到销售渠道'],
    CHANNEL_INACTIVE: ['This sales channel is inactive', '此销售渠道已停用'],
    CHANNEL_EXISTS: ['This channel code already exists', '此渠道编码已存在'],
    TOTAL_MISMATCH: ['The total changed — please review the bill and confirm again', '合计金额有变化，请核对后重新确认'],
    PRICE_MISMATCH: ['The total changed — please review the bill and confirm again', '合计金额有变化，请核对后重新确认'],
    CASH_SHORT: ['Cash received is less than the total', '收款金额小于应收合计'],
    BILL_NOT_FOUND: ['Bill not found', '未找到单据'],
    SETUP_REQUIRED: ['The system is not set up yet', '系统尚未完成设置'],
    NOT_CONFIGURED: ['The system is not set up yet', '系统尚未完成设置'],
    UNKNOWN_ACTION: ['This screen version does not match the server — please reload', '界面版本与服务器不匹配，请重新加载'],
    NETWORK: ['Cannot reach the server. Please check your internet.', '无法连接服务器，请检查网络。'],
    BAD_RESPONSE: ['The server returned an invalid response', '服务器响应无效'],
    UNCERTAIN: ['Save result not known yet', '保存结果未知'],
    INTERNAL: ['A system error occurred, please try again', '系统出错，请重试'],
    SERVER_ERROR: ['A system error occurred, please try again', '系统出错，请重试']
  };

  /* หน่วยสินค้า (ข้อมูลในระบบ) — แปลตอนแสดงเท่านั้น */
  var UNIT = {
    'ชิ้น': ['pcs', '件'], 'อัน': ['pcs', '个'], 'ตัว': ['pcs', '个'], 'เครื่อง': ['units', '台'], 'กล่อง': ['boxes', '盒'],
    'ลัง': ['cartons', '箱'], 'แพ็ก': ['packs', '包'], 'แพ็ค': ['packs', '包'], 'ห่อ': ['packs', '包'], 'ชุด': ['sets', '套'],
    'คู่': ['pairs', '双'], 'ม้วน': ['rolls', '卷'], 'แผ่น': ['sheets', '张'], 'ใบ': ['pcs', '张'], 'เส้น': ['pcs', '条'],
    'ขวด': ['bottles', '瓶'], 'ถุง': ['bags', '袋'], 'ซอง': ['sachets', '袋'], 'หลอด': ['tubes', '支'], 'กระป๋อง': ['cans', '罐'],
    'โหล': ['dozen', '打'], 'กิโลกรัม': ['kg', '公斤'], 'กก.': ['kg', '公斤'], 'กรัม': ['g', '克'], 'เมตร': ['m', '米'],
    'ลิตร': ['L', '升'], 'ด้าม': ['pcs', '支'], 'แท่ง': ['bars', '根'], 'ก้อน': ['pcs', '块'], 'ลูก': ['pcs', '个']
  };

  /* คำอธิบายช่องตั้งค่า (ตาม key) */
  var SETTING = {
    COMPANY_NAME: ['Company name (shown on top of the home screen)', '公司名称（显示在首页顶部）'],
    TIMEZONE: ['Time zone', '时区'],
    SCAN_MODE: ['Default scan mode', '默认扫描方式'],
    DEFAULT_MIN_STOCK: ['Default low-stock alert level', '默认库存提醒值'],
    MIN_STOCK_DEFAULT: ['Default low-stock alert level', '默认库存提醒值'],
    LOW_STOCK_DEFAULT: ['Default low-stock alert level', '默认库存提醒值'],
    STOCK_IN_TYPES: ['Stock-in types', '入库类型'],
    SUPPLIER_RETURN_REASONS: ['Reasons for returning to supplier', '退回供应商原因'],
    WRITE_OFF_REASONS: ['Write-off reasons', '报损原因'],
    CANCEL_REASONS: ['Order cancel reasons', '订单取消原因'],
    ADJUST_REASONS: ['Stock count adjustment reasons', '盘点调整原因'],
    PAPER_SIZE: ['Paper size for bills / item lists', '单据/清单纸张尺寸'],
    SHOP_NAME: ['Shop name on bills', '单据上的店名'],
    SHOP_ADDRESS: ['Shop address on bills', '单据上的店铺地址'],
    SHOP_PHONE: ['Shop phone on bills', '单据上的店铺电话'],
    SHOP_TAX_ID: ['Tax ID on bills', '单据上的税号'],
    BILL_FOOTER: ['Footer text on cash bills', '现金单底部文字'],
    ADMIN_NOTIFY: ['Admin notifications', '管理员通知'],
    SCHEMA_VERSION: ['Database version', '数据库版本']
  };

  var D = { en: {}, zh: {} };
  T.forEach(function (r) { D.en[r[0]] = r[1]; D.zh[r[0]] = r[2]; });
  var idx = lang === 'en' ? 0 : 1;
  var TH = /[฀-๿]/;
  var missing = {};

  /** แปลข้อความบนหน้าจอ: ตรงทั้งข้อความก่อน แล้วค่อยแปลเฉพาะส่วนไทย (คงช่องว่าง/วงเล็บ/ตัวเลขรอบนอกไว้) */
  function t(s, ctx) {
    if (lang === 'th' || typeof s !== 'string' || !TH.test(s)) return s;
    var d = D[lang];
    if (ctx && d[s + '|' + ctx] != null) return d[s + '|' + ctx];
    if (!ctx && d[s] != null) return d[s];
    var a = /^[^฀-๿]*/.exec(s)[0];
    var b = /[^฀-๿]*$/.exec(s)[0];
    var core = s.slice(a.length, s.length - b.length);
    if (ctx && d[core + '|' + ctx] != null) return a + d[core + '|' + ctx] + b;
    if (d[core] != null) return a + d[core] + b;
    missing[s] = 1;
    return s;
  }
  /** ข้อมูลจากฐานข้อมูล (เหตุผล ประเภท สภาพ): แปลเฉพาะเมื่อรู้จักคำนั้นทั้งคำ ไม่รู้จัก = แสดงตามที่บันทึก */
  function data(s) {
    if (lang === 'th' || typeof s !== 'string') return s;
    var k = s.trim(), d = D[lang];
    return d[k] != null && d[k] !== '' ? d[k] : s;
  }
  /** หน่วยสินค้า */
  function unit(u) {
    if (lang === 'th' || typeof u !== 'string') return u;
    var m = UNIT[u.trim()];
    return m ? m[idx] : u;
  }
  /** ข้อความสำเร็จจากเซิร์ฟเวอร์: ภาษาไทยแสดงตามเดิม ภาษาอื่นใช้ข้อความกลางที่แปลแล้ว */
  function srv(msg, fallbackTh) {
    if (lang === 'th') return msg || fallbackTh;
    if (typeof msg === 'string' && D[lang][msg.trim()]) return D[lang][msg.trim()];
    if (typeof msg === 'string' && msg && !TH.test(msg)) return msg;
    return t(fallbackTh);
  }
  /** ข้อความผิดพลาดจากเซิร์ฟเวอร์ → แปลจากรหัส + แนบข้อความต้นฉบับไว้ให้ส่งต่อผู้ดูแล */
  function err(code, msg) {
    if (lang === 'th') return msg;
    var s = String(msg == null ? '' : msg);
    if (D[lang][s.trim()]) return D[lang][s.trim()];
    if (!TH.test(s)) return s || (ERR[code] ? ERR[code][idx] : t('ทำรายการไม่สำเร็จ'));
    var head = ERR[code] ? ERR[code][idx] : t('ระบบแจ้งข้อผิดพลาด') + (code ? ' (' + code + ')' : '');
    return head + '\n\n' + t('ข้อความจากระบบ (ภาษาไทย)') + ':\n' + s;
  }
  function setting(key, desc) {
    if (lang === 'th') return desc;
    var m = SETTING[key];
    return m ? m[idx] : (data(desc) !== desc ? data(desc) : key);
  }
  function set(l) {
    if (l !== 'th' && l !== 'en' && l !== 'zh') return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* */ }
    lang = l;
  }

  window.I18N = {
    version: VERSION, lang: lang, langs: LANGS, t: t, d: data, u: unit, srv: srv, err: err, setting: setting, set: set,
    missing: function () { return Object.keys(missing); }
  };
  window._t = t;
  window._u = unit;

  try {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    document.documentElement.setAttribute('data-lang', lang);
    var bootP = document.querySelector('#app .boot p');
    if (bootP && lang !== 'th') bootP.textContent = lang === 'en' ? 'Opening the warehouse system…' : '正在打开仓库管理系统…';
  } catch (e) { /* */ }
})();

