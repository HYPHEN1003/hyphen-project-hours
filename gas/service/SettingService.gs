/**
 * SettingService.gs － システム設定の読み書き
 * ------------------------------------------------------------------
 * 設定値（税率・最小入力単位・各閾値・請求プレフィックス等）を
 * 型付きで取得する。閾値は CalcUtil へ注入する形で渡す（ハードコード禁止）。
 */

/** 全設定を key-value 配列で返す（設定画面・bootstrap 用） */
function getSettingsList() {
  var repo = getRepository();
  return repo.findAll('system_settings', { orderBy: 'key' });
}

/** 全設定を { key: value } の生オブジェクトで返す */
function getSettingsMap() {
  var list = getSettingsList();
  var map = {};
  list.forEach(function (r) { map[r.key] = r.value; });
  // 欠落キーは既定で補完
  DEFAULT_SETTINGS.forEach(function (d) { if (map[d.key] === undefined) map[d.key] = d.value; });
  return map;
}

/** 数値化した設定をまとめて返す（計算で使う閾値群） */
function getCalcConfig() {
  var m = getSettingsMap();
  return {
    taxRate: Number(m.tax_rate),
    minInputMinutes: Number(m.min_input_minutes),
    alertWarnRate: Number(m.alert_warn_rate),
    alertOverRate: Number(m.alert_over_rate),
    utilOverRate: Number(m.util_over_rate),
    utilLowRate: Number(m.util_low_rate),
    marginGoodRate: Number(m.margin_good_rate),
    marginWarnRate: Number(m.margin_warn_rate),
    invoicePrefix: m.invoice_prefix || 'INV',
    alertEmail: m.alert_email || ''
  };
}

/** 設定をまとめて更新（設定画面から） */
function updateSettings(patch, actor) {
  return withLock(function () {
    var repo = getRepository();
    Object.keys(patch).forEach(function (k) {
      repo.setSetting(k, patch[k]);
    });
    return getSettingsMap();
  });
}
