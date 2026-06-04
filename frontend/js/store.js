/**
 * store.js － bootstrap キャッシュ（マスタ・設定）と参照ヘルパ
 * ------------------------------------------------------------------
 * アプリ起動時に bootstrap を1回取得し、セレクト即時描画・ID→名称変換に使う。
 * マスタ更新後は reload() で再取得する。
 */
App.store = (function () {
  var data = {
    customers: [], staff: [], projectTypes: [], workItems: [], settings: {}
  };

  function load() {
    return App.api.get('bootstrap').then(function (d) {
      data.customers = d.customers || [];
      data.staff = d.staff || [];
      data.projectTypes = d.projectTypes || [];
      data.workItems = d.workItems || [];
      data.settings = d.settings || {};
      return data;
    });
  }
  function reload() { return load(); }

  function get() { return data; }
  function setting(key) { return data.settings[key]; }

  // ---- 参照ヘルパ ----
  function customerName(id) { return nameOf(data.customers, 'customer_id', id, 'name'); }
  function staffName(id) { return nameOf(data.staff, 'staff_id', id, 'name'); }
  function typeName(id) { return nameOf(data.projectTypes, 'type_id', id, 'name'); }
  function workItemName(id) { return nameOf(data.workItems, 'work_item_id', id, 'name'); }
  function nameOf(list, idKey, id, nameKey) {
    var r = list.filter(function (x) { return x[idKey] === id; })[0];
    return r ? r[nameKey] : '';
  }

  // ---- セレクト用 options ----
  function customerOptions() { return data.customers.map(function (c) { return { value: c.customer_id, label: c.name }; }); }
  function staffOptions() { return data.staff.filter(function (s){return s.status==='在籍';}).map(function (s) { return { value: s.staff_id, label: s.name }; }); }
  function typeOptions() { return data.projectTypes.map(function (t) { return { value: t.type_id, label: t.name }; }); }
  function workItemOptions() { return data.workItems.map(function (w) { return { value: w.work_item_id, label: w.name, billing: w.default_billing_type }; }); }

  return {
    load: load, reload: reload, get: get, setting: setting,
    customerName: customerName, staffName: staffName, typeName: typeName, workItemName: workItemName,
    customerOptions: customerOptions, staffOptions: staffOptions, typeOptions: typeOptions, workItemOptions: workItemOptions
  };
})();
