/**
 * SheetRepository.gs － IRepository のスプレッドシート実装（MVP）
 * ------------------------------------------------------------------
 * 【このファイルだけが SpreadsheetApp を直接呼んでよい】
 * 行⇔オブジェクト変換、is_deleted フィルタ、orderBy/limit のメモリ処理、
 * 監査列の自動付与、採番カウンタ管理を担う。
 *
 * 列の解決は「1行目の日本語ヘッダ名」で行う（列順変更に強い）。
 * Schema の key(物理名) ⇔ label(日本語) の対応で橋渡しする。
 *
 * 対象スプレッドシートは Script Property 'SPREADSHEET_ID' で指定。
 * 未設定時はアクティブなスプレッドシート（バインド型）を使う。
 */

function createSheetRepository() {
  var _ssCache = null;
  var _sheetCache = {};   // table -> Sheet
  var _headerCache = {};  // table -> { labelToIndex, keyToIndex, headers[] }

  /** 対象スプレッドシートを返す */
  function ss() {
    if (_ssCache) return _ssCache;
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    _ssCache = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!_ssCache) throw new AppError('INTERNAL_ERROR', 'スプレッドシートが見つかりません。Setup を実行してください。');
    return _ssCache;
  }

  /** シート取得（無ければエラー） */
  function sheet(table) {
    if (_sheetCache[table]) return _sheetCache[table];
    var sh = ss().getSheetByName(table);
    if (!sh) throw new AppError('INTERNAL_ERROR', 'シートが存在しません: ' + table + '（Setup 未実行の可能性）');
    _sheetCache[table] = sh;
    return sh;
  }

  /** ヘッダ情報（label→列index, key→列index）を構築・キャッシュ */
  function headerInfo(table) {
    if (_headerCache[table]) return _headerCache[table];
    var def = getTableDef(table);
    var sh = sheet(table);
    var lastCol = sh.getLastColumn();
    var headers = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var labelToIndex = {};
    headers.forEach(function (h, i) { labelToIndex[String(h)] = i; });
    var keyToIndex = {};
    def.columns.forEach(function (col) {
      var idx = labelToIndex[col.label];
      if (idx !== undefined) keyToIndex[col.key] = idx;
    });
    _headerCache[table] = { labelToIndex: labelToIndex, keyToIndex: keyToIndex, headers: headers, def: def };
    return _headerCache[table];
  }

  function invalidate(table) {
    delete _sheetCache[table];
    delete _headerCache[table];
  }

  /** セル値 → schema 型に応じた JS 値へ変換（読み取り時） */
  function coerceRead(value, type) {
    if (value === '' || value === null || value === undefined) return null;
    switch (type) {
      case 'int': return value === '' ? null : Math.round(Number(value));
      case 'num': return Number(value);
      case 'bool': return value === true || value === 'TRUE' || value === 'true' || value === 1;
      case 'date':
        return (value instanceof Date) ? Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd') : String(value);
      case 'time':
        return (value instanceof Date) ? Utilities.formatDate(value, 'Asia/Tokyo', 'HH:mm') : String(value);
      case 'datetime':
        return (value instanceof Date) ? Utilities.formatDate(value, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX") : String(value);
      default: return String(value);
    }
  }

  /** JS 値 → セルへ書く値へ変換（書き込み時。null は空文字） */
  function coerceWrite(value, type) {
    if (value === null || value === undefined || value === '') return '';
    if (type === 'bool') return value === true || value === 'true' || value === 1 ? true : false;
    if (type === 'int') return Math.round(Number(value));
    if (type === 'num') return Number(value);
    return value; // text/date/time/datetime は文字列のまま
  }

  /** 1行（配列）→ エンティティ（物理名キーの object） */
  function rowToEntity(table, row) {
    var info = headerInfo(table);
    var e = {};
    info.def.columns.forEach(function (col) {
      var idx = info.keyToIndex[col.key];
      e[col.key] = (idx === undefined) ? null : coerceRead(row[idx], col.type);
    });
    return e;
  }

  /** エンティティ → 1行（配列。ヘッダ列順に合わせる） */
  function entityToRow(table, entity) {
    var info = headerInfo(table);
    var def = info.def;
    var row = new Array(info.headers.length).fill('');
    def.columns.forEach(function (col) {
      var idx = info.keyToIndex[col.key];
      if (idx === undefined) return;
      row[idx] = coerceWrite(entity[col.key], col.type);
    });
    return row;
  }

  /** 全データ行をエンティティ配列で取得（ヘッダ除く） */
  function readAll(table) {
    var sh = sheet(table);
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return [];
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var out = [];
    for (var i = 0; i < values.length; i++) {
      out.push(rowToEntity(table, values[i]));
    }
    return out;
  }

  /** 監査列を持つテーブルか */
  function isAudited(table) { return getTableDef(table).audited; }

  /** 主キー列の key 名 */
  function pkKey(table) { return getTableDef(table).pk; }

  // ---- フィルタ/ソートのヘルパ ----
  function applyWhere(rows, where) {
    if (!where) return rows;
    return rows.filter(function (r) {
      return Object.keys(where).every(function (k) {
        return String(r[k]) === String(where[k]);
      });
    });
  }
  function applyDateRange(rows, opts) {
    if (!opts || !opts.dateField) return rows;
    return rows.filter(function (r) {
      var v = r[opts.dateField];
      if (!v) return false;
      if (opts.from && v < opts.from) return false;
      if (opts.to && v > opts.to) return false;
      return true;
    });
  }
  function applyOrder(rows, opts) {
    if (!opts || !opts.orderBy) return rows;
    var k = opts.orderBy, desc = !!opts.desc;
    rows.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (av < bv ? -1 : 1) * (desc ? -1 : 1);
    });
    return rows;
  }
  function applyPaging(rows, opts) {
    if (!opts) return rows;
    var start = opts.offset || 0;
    var end = opts.limit ? start + opts.limit : undefined;
    return rows.slice(start, end);
  }

  // ============ IRepository 実装 ============
  return {
    findById: function (table, id, opts) {
      opts = opts || {};
      var pk = pkKey(table);
      var rows = readAll(table);
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][pk]) === String(id)) {
          if (isAudited(table) && !opts.includeDeleted && rows[i].is_deleted === true) return null;
          return rows[i];
        }
      }
      return null;
    },

    findWhere: function (table, where, opts) {
      opts = opts || {};
      var rows = readAll(table);
      if (isAudited(table) && !opts.includeDeleted) {
        rows = rows.filter(function (r) { return r.is_deleted !== true; });
      }
      rows = applyWhere(rows, where);
      rows = applyDateRange(rows, opts);
      rows = applyOrder(rows, opts);
      rows = applyPaging(rows, opts);
      return rows;
    },

    findAll: function (table, opts) {
      return this.findWhere(table, null, opts);
    },

    insert: function (table, entity, opts) {
      opts = opts || {};
      var e = shallowCopy(entity);
      if (isAudited(table)) {
        var now = nowIso();
        e.is_deleted = false;
        e.created_at = now;
        e.created_by = opts.actor || '';
        e.updated_at = now;
        e.updated_by = opts.actor || '';
      }
      var row = entityToRow(table, e);
      sheet(table).appendRow(row);
      return e;
    },

    insertMany: function (table, entities, opts) {
      opts = opts || {};
      if (!entities.length) return [];
      var now = nowIso();
      var prepared = entities.map(function (entity) {
        var e = shallowCopy(entity);
        if (isAudited(table)) {
          e.is_deleted = false; e.created_at = now; e.created_by = opts.actor || '';
          e.updated_at = now; e.updated_by = opts.actor || '';
        }
        return e;
      });
      var rows = prepared.map(function (e) { return entityToRow(table, e); });
      var sh = sheet(table);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      return prepared;
    },

    update: function (table, id, patch, opts) {
      opts = opts || {};
      var pk = pkKey(table);
      var sh = sheet(table);
      var info = headerInfo(table);
      var lastRow = sh.getLastRow();
      if (lastRow < 2) throw new AppError('NOT_FOUND', '対象が見つかりません: ' + id);
      var pkIdx = info.keyToIndex[pk];
      var values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][pkIdx]) === String(id)) {
          var current = rowToEntity(table, values[i]);
          // 楽観ロック（任意）: opts.expectedUpdatedAt が指定され不一致なら CONFLICT
          if (opts.expectedUpdatedAt && current.updated_at && current.updated_at !== opts.expectedUpdatedAt) {
            throw new AppError('CONFLICT', '他のユーザーが先に更新しました。最新を取得して再編集してください。');
          }
          var merged = shallowCopy(current);
          Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
          if (isAudited(table)) {
            merged.updated_at = nowIso();
            merged.updated_by = opts.actor || '';
          }
          var newRow = entityToRow(table, merged);
          sh.getRange(i + 2, 1, 1, newRow.length).setValues([newRow]);
          return merged;
        }
      }
      throw new AppError('NOT_FOUND', '対象が見つかりません: ' + id);
    },

    softDelete: function (table, id, opts) {
      if (!isAudited(table)) {
        return this.hardDelete(table, id);
      }
      this.update(table, id, { is_deleted: true }, opts);
    },

    /** 物理削除（原則未使用。集計シートや内部用途のみ） */
    hardDelete: function (table, id) {
      var pk = pkKey(table);
      var sh = sheet(table);
      var info = headerInfo(table);
      var lastRow = sh.getLastRow();
      if (lastRow < 2) return;
      var pkIdx = info.keyToIndex[pk];
      var values = sh.getRange(2, 1, lastRow - 1, 1 + pkIdx).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][pkIdx]) === String(id)) {
          sh.deleteRow(i + 2);
          return;
        }
      }
    },

    replaceAll: function (table, entities) {
      var sh = sheet(table);
      var lastRow = sh.getLastRow();
      if (lastRow > 1) {
        sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      }
      if (entities && entities.length) {
        var rows = entities.map(function (e) { return entityToRow(table, e); });
        sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      }
    },

    upsertByKeys: function (table, keys, entity) {
      var sh = sheet(table);
      var info = headerInfo(table);
      var lastRow = sh.getLastRow();
      var values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues() : [];
      for (var i = 0; i < values.length; i++) {
        var ent = rowToEntity(table, values[i]);
        var match = keys.every(function (k) { return String(ent[k]) === String(entity[k]); });
        if (match) {
          var newRow = entityToRow(table, entity);
          sh.getRange(i + 2, 1, 1, newRow.length).setValues([newRow]);
          return;
        }
      }
      sh.appendRow(entityToRow(table, entity));
    },

    getSetting: function (key) {
      var row = this.findById('system_settings', key, { includeDeleted: true });
      return row ? row.value : null;
    },

    setSetting: function (key, value) {
      var existing = this.findById('system_settings', key, { includeDeleted: true });
      if (existing) {
        this.update('system_settings', key, { value: String(value) });
      } else {
        this.insert('system_settings', { key: key, value: String(value), description: '' });
      }
    },

    /** 採番カウンタを +1 して返す（withLock 内で呼ぶこと） */
    nextSequence: function (seqName) {
      var sh = sheet('_sequences');
      var info = headerInfo('_sequences');
      var lastRow = sh.getLastRow();
      var nameIdx = info.keyToIndex['seq_name'];
      var curIdx = info.keyToIndex['current'];
      var values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues() : [];
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][nameIdx]) === String(seqName)) {
          var next = Math.round(Number(values[i][curIdx])) + 1;
          sh.getRange(i + 2, curIdx + 1).setValue(next);
          return next;
        }
      }
      // 新規カウンタ
      var row = entityToRow('_sequences', { seq_name: seqName, current: 1 });
      sh.appendRow(row);
      return 1;
    },

    /** キャッシュ破棄（テスト用） */
    _invalidate: invalidate
  };
}

/** 浅いコピー */
function shallowCopy(obj) {
  var o = {};
  Object.keys(obj).forEach(function (k) { o[k] = obj[k]; });
  return o;
}
