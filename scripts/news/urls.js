"use strict";
const { publicURL } = require("./network");

function normalizeURL(raw) {
  const url = publicURL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|igshid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
module.exports = { normalizeURL };
