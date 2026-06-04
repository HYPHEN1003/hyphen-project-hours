/**
 * IdGenerator.gs － ID採番
 * ------------------------------------------------------------------
 * ID命名規則（REQUIREMENTS §3.1 / SHEETS_SCHEMA）:
 *   PJT-001 / STF-001 / CUS-001 / KND-001 / WRK-001 / KOSU-001 / KEIHI-001
 *   INV-YYYYMM-001（請求書のみ月内連番）
 *
 * 採番は必ず withLock の内側で呼ぶこと（連番重複を構造的に防ぐ）。
 * カウンタは _sequences シートで管理し、Repository.nextSequence で原子的に増分する。
 */

/**
 * 接頭辞つき連番IDを採番する（例: 'CUS' -> 'CUS-001'）。
 * @param {IRepository} repo
 * @param {string} prefix 例 'CUS'
 * @param {number} [pad] ゼロ埋め桁数（既定3。工数等は桁あふれ時に自動拡張）
 * @returns {string}
 */
function generateId(repo, prefix, pad) {
  pad = pad || 3;
  var seqName = prefix; // 接頭辞ごとに1カウンタ
  var n = repo.nextSequence(seqName);
  return prefix + '-' + zeroPad(n, pad);
}

/**
 * 請求番号を採番する（INV-YYYYMM-連番、月内リセット）。
 * @param {IRepository} repo
 * @param {string} prefix 設定の invoice_prefix（既定 'INV'）
 * @param {string} yyyymm 例 '202602'
 * @returns {string}
 */
function generateInvoiceId(repo, prefix, yyyymm) {
  var seqName = 'INV_' + yyyymm; // 月ごとに別カウンタ
  var n = repo.nextSequence(seqName);
  return prefix + '-' + yyyymm + '-' + zeroPad(n, 3);
}

/** 数値を指定桁でゼロ埋め。桁あふれ時はそのまま（桁拡張）。 */
function zeroPad(num, width) {
  var s = String(num);
  while (s.length < width) s = '0' + s;
  return s;
}
