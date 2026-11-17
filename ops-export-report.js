/**
 * Shared styled Excel exports for 3E Operations chapters.
 */
(function (global) {
  'use strict';

  var TEAL = '#76B8B1';
  var GOLD = '#FFD100';
  var CHARCOAL = '#161616';
  var MUTED = '#56565A';
  var PAPER = '#FAFAF8';
  var ZEBRA = '#F4F3EF';

  function xlArgb(hex) {
    return String(hex || '').replace('#', '').toUpperCase();
  }

  function fileStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function exportTimestamp() {
    return new Date().toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function sheetTitleBlock(ws, title, subtitle, colCount) {
    colCount = Math.max(1, colCount || 1);
    ws.mergeCells(1, 1, 1, colCount);
    var titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: xlArgb(CHARCOAL) } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb(GOLD) } };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, colCount);
    var subCell = ws.getCell(2, 1);
    subCell.value = subtitle || '';
    subCell.font = { name: 'Calibri', size: 10, color: { argb: xlArgb(MUTED) } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb(PAPER) } };
    ws.getRow(2).height = subtitle && subtitle.length > 100 ? 40 : 22;
  }

  function writeTableHeader(ws, rowNum, headers) {
    var row = ws.getRow(rowNum);
    row.height = 22;
    headers.forEach(function (label, i) {
      var cell = row.getCell(i + 1);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb(TEAL) } };
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: xlArgb(GOLD) } } };
    });
  }

  function writeTableRows(ws, startRow, rows, colAlignments) {
    (rows || []).forEach(function (cells, idx) {
      var row = ws.getRow(startRow + idx);
      row.height = 20;
      var alt = idx % 2 === 1;
      (cells || []).forEach(function (val, i) {
        var cell = row.getCell(i + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 11, color: { argb: xlArgb(CHARCOAL) } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: alt ? xlArgb(ZEBRA) : 'FFFFFFFF' }
        };
        var align = colAlignments && colAlignments[i] ? colAlignments[i] : (i === 0 ? 'left' : 'right');
        cell.alignment = { vertical: 'middle', horizontal: align };
      });
    });
  }

  function writeSectionBanner(ws, rowNum, label, colCount) {
    ws.mergeCells(rowNum, 1, rowNum, colCount);
    var cell = ws.getCell(rowNum, 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: xlArgb(CHARCOAL) } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: xlArgb(GOLD) } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(rowNum).height = 22;
  }

  /**
   * @param {object} wb ExcelJS workbook
   * @param {object} opts name, tabColor, sectionTitle, docTitle, subtitle, headers, rows, colWidths, colAlign
   */
  function addDataSheet(wb, opts) {
    var headers = opts.headers || [];
    var colCount = Math.max(1, headers.length);
    var ws = wb.addWorksheet(String(opts.name || 'Sheet').slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      properties: { tabColor: { argb: xlArgb(opts.tabColor || TEAL) } }
    });
    (opts.colWidths || []).forEach(function (w, i) {
      ws.getColumn(i + 1).width = w;
    });
    var title = opts.docTitle || '3E Operations';
    if (opts.sectionTitle) title += ' — ' + opts.sectionTitle;
    sheetTitleBlock(ws, title, opts.subtitle || '', colCount);
    writeTableHeader(ws, 4, headers);
    writeTableRows(ws, 5, opts.rows || [], opts.colAlign);
    return ws;
  }

  /**
   * Single sheet with all blocks stacked (metrics + tables together).
   * @param {Array<{title, headers, rows, colAlign, colWidths}>} blocks
   */
  function addConsolidatedSheet(wb, opts) {
    var blocks = opts.blocks || [];
    if (!blocks.length) return null;
    var maxCols = 1;
    blocks.forEach(function (b) {
      maxCols = Math.max(maxCols, (b.headers || []).length);
    });
    var ws = wb.addWorksheet(String(opts.name || 'All Together').slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      properties: { tabColor: { argb: xlArgb(opts.tabColor || GOLD) } }
    });
    blocks.forEach(function (b) {
      (b.colWidths || []).forEach(function (w, i) {
        var cur = ws.getColumn(i + 1).width || 0;
        if (!cur || w > cur) ws.getColumn(i + 1).width = w;
      });
    });
    sheetTitleBlock(ws, opts.docTitle || '3E Operations', opts.subtitle || '', maxCols);
    var row = 4;
    blocks.forEach(function (block, blockIdx) {
      var headers = block.headers || [];
      var colCount = Math.max(1, headers.length);
      if (blockIdx > 0) row += 1;
      writeSectionBanner(ws, row, block.title || 'Section', colCount);
      row += 1;
      writeTableHeader(ws, row, headers);
      row += 1;
      writeTableRows(ws, row, block.rows || [], block.colAlign);
      row += (block.rows || []).length;
    });
    return ws;
  }

  function downloadWorkbook(wb, filename) {
    if (typeof ExcelJS === 'undefined') {
      return Promise.reject(new Error('ExcelJS not loaded'));
    }
    return wb.xlsx.writeBuffer().then(function (buffer) {
      downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        filename
      );
    });
  }

  function createWorkbook(creator) {
    var wb = new ExcelJS.Workbook();
    wb.creator = creator || '3E Operations';
    wb.created = new Date();
    wb.modified = new Date();
    return wb;
  }

  global.OpsExportReport = {
    TEAL: TEAL,
    GOLD: GOLD,
    xlArgb: xlArgb,
    fileStamp: fileStamp,
    exportTimestamp: exportTimestamp,
    downloadBlob: downloadBlob,
    addDataSheet: addDataSheet,
    addConsolidatedSheet: addConsolidatedSheet,
    downloadWorkbook: downloadWorkbook,
    createWorkbook: createWorkbook,
    sheetTitleBlock: sheetTitleBlock,
    writeTableHeader: writeTableHeader,
    writeTableRows: writeTableRows
  };
})(typeof window !== 'undefined' ? window : this);
