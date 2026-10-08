"use strict";
const dns = require("node:dns/promises");
const net = require("node:net");
const MAX_BYTES = 2 * 1024 * 1024;

function publicIPv4(address) {
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
function publicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return publicIPv4(address);
  if (family !== 6) return false;
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const dotted = normalized.slice(normalized.lastIndexOf(":") + 1);
    const octets = dotted.split(".").map(Number);
    normalized = normalized.slice(0, normalized.lastIndexOf(":") + 1) + ((octets[0] << 8) | octets[1]).toString(16) + ":" + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [], right = halves[1] ? halves[1].split(":") : [];
  const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right].map((word) => parseInt(word, 16)) : left.map((word) => parseInt(word, 16));
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return publicIPv4([words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join("."));
  }
  return words[0] >= 0x2000 && words[0] < 0x4000 && words[0] !== 0x2002 && !(words[0] === 0x2001 && (words[1] === 0 || words[1] === 0xdb8));
}

function publicURL(raw, httpsOnly = false) {
  const url = new URL(raw);
  if (!(httpsOnly ? url.protocol === "https:" : ["https:", "http:"].includes(url.protocol)) || url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) throw new Error("拒绝不安全的来源 URL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(hostname) || (!net.isIP(hostname) && !hostname.includes(".")) || (net.isIP(hostname) && !publicAddress(hostname))) throw new Error("拒绝私有或本地来源地址");
  return url;
}
function proxyAddress(address) { return net.isIP(address) === 4 && /^198\.(?:18|19)\./.test(address); }

/** System proxies can return synthetic 198.18/15 addresses. Verify the public DNS answer
 * through a fixed HTTPS resolver, while leaving the actual source request on the user's network.
 * @param {string} hostname
 * @param {{signal?:AbortSignal,lookup?:(hostname:string,options:{all:true,verbatim:true})=>Promise<Array<{address:string}>>,fetcher?:typeof fetch}} options
 * @returns {Promise<Array<{address:string}>>} */
async function resolveHost(hostname, options = {}) {
  const entries = options.lookup
    ? await options.lookup(hostname, { all: true, verbatim: true })
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!entries.length || !entries.every((entry) => proxyAddress(entry.address))) return entries;
  const signal = options.signal || AbortSignal.timeout(10000);
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const endpoint = new URL("https://cloudflare-dns.com/dns-query");
    endpoint.searchParams.set("name", hostname);
    endpoint.searchParams.set("type", type);
    const response = await (options.fetcher || fetch)(endpoint.href, {
      headers: { accept: "application/dns-json" }, redirect: "error", signal,
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("代理 DNS 复核 HTTP " + response.status); }
    const reader = response.body?.getReader(), chunks = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) throw new Error("代理 DNS 复核响应过大");
          chunks.push(Buffer.from(value));
        }
      } catch (error) { reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (data.Status !== 0 || data.TC || (data.Answer !== undefined && !Array.isArray(data.Answer))) throw new Error("代理 DNS 复核未成功");
    return (data.Answer || []).filter((answer) => answer.type === 1 || answer.type === 28).map((answer) => {
      if (typeof answer.data !== "string" || !net.isIP(answer.data)) throw new Error("代理 DNS 复核地址无效");
      return { address: answer.data };
    });
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("代理 DNS 复核指向私有或非公开地址");
  return addresses;
}

/** @param {string} raw
 * @param {(hostname:string)=>Promise<Array<{address:string}>>} resolver */
async function validateSourceURL(raw, resolver = resolveHost) {
  const url = publicURL(raw, true), hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await resolver(hostname);
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("来源 DNS 指向私有或非公开地址");
  return url;
}

/** @param {string} raw
 * @param {{fetcher?:typeof fetch,resolver?:(hostname:string)=>Promise<Array<{address:string}>>,headers?:Record<string,string>,timeoutMs?:number,maxBytes?:number}} options */
async function fetchSource(raw, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new Error("来源响应限额无效");
  const sizeLabel = maxBytes === MAX_BYTES ? "2 MiB" : maxBytes + " bytes";
  const fetcher = options.fetcher || fetch;
  const controller = new AbortController(), signal = controller.signal;
  const resolver = options.resolver || ((hostname) => resolveHost(hostname, { signal }));
  const timer = setTimeout(() => controller.abort(new Error("来源请求超时")), options.timeoutMs || 15000);
  /** Include DNS and streaming bodies in the same deadline, including injected fetch implementations. */
  function bounded(promise) {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  let current = raw;
  try { for (let redirects = 0; redirects <= 5; redirects++) {
    const url = await bounded(validateSourceURL(current, resolver));
    const response = await bounded(fetcher(url.href, { redirect: "manual", headers: options.headers || {}, signal }));
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (response.body) await bounded(response.body.cancel());
      if (!location || redirects === 5) throw new Error("来源重定向无效或次数超限");
      current = new URL(location, url).href;
      continue;
    }
    if (response.status === 304) return { response, text: "", finalURL: url.href };
    if (!response.ok) { if (response.body) await bounded(response.body.cancel()); throw new Error("来源 HTTP " + response.status); }
    if (Number(response.headers.get("content-length")) > maxBytes) { if (response.body) await bounded(response.body.cancel()); throw new Error("来源响应超过 " + sizeLabel); }
    const chunks = [], reader = response.body?.getReader();
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await bounded(reader.read());
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await bounded(reader.cancel()); throw new Error("来源响应超过 " + sizeLabel); }
          chunks.push(Buffer.from(value));
        }
      } catch (error) { reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
    }
    const bytes = Buffer.concat(chunks);
    const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(response.headers.get("content-type") || "")?.[1] || "utf-8";
    return { response, text: new TextDecoder(charset).decode(bytes), bytes, finalURL: url.href };
  }
  throw new Error("来源重定向次数超限");
  } finally { clearTimeout(timer); }
}

module.exports = { publicURL, publicAddress, validateSourceURL, fetchSource, resolveHost, MAX_BYTES };
