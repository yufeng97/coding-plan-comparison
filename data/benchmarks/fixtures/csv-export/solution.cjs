// 返回 CRLF 分隔的 CSV 字符串。实现此函数。
module.exports = function encodeCSV(rows) { return rows.map(row=>row.join(',')).join('\r\n'); };
