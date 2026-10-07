"use strict";
const assert = require("node:assert/strict");
const { resolveHost, validateSourceURL } = require("../news/network");

async function testProxyDNS() {
  const fakeLookup = async () => [{ address: "198.18.0.5", family: 4 }];
  const calls = [];
  const publicFetcher = /** @type {typeof fetch} */ (async (raw, init) => {
    const endpoint = new URL(String(raw));
    assert.equal(endpoint.origin + endpoint.pathname, "https://cloudflare-dns.com/dns-query");
    assert.equal(endpoint.searchParams.get("name"), "example.com");
    assert.equal(init.redirect, "error");
    calls.push(endpoint.searchParams.get("type"));
    return Response.json({ Status: 0, Answer: endpoint.searchParams.get("type") === "A" ? [{ type: 1, data: "93.184.216.34" }] : [] });
  });
  assert.deepEqual(await resolveHost("example.com", { lookup: fakeLookup, fetcher: publicFetcher }), [{ address: "93.184.216.34" }]);
  assert.deepEqual(calls.sort(), ["A", "AAAA"]);

  const neverFetch = /** @type {typeof fetch} */ (async () => { throw new Error("DoH must not run"); });
  const localLookup = async () => [{ address: "127.0.0.1", family: 4 }];
  await assert.rejects(validateSourceURL("https://example.com/", (name) => resolveHost(name, { lookup: localLookup, fetcher: neverFetch })), /非公开/);
  await assert.rejects(validateSourceURL("https://example.com/", async () => [{ address: "198.18.0.5" }]), /非公开/);

  const privateFetcher = /** @type {typeof fetch} */ (async () => Response.json({ Status: 0, Answer: [{ type: 1, data: "192.168.0.1" }] }));
  await assert.rejects(resolveHost("example.com", { lookup: fakeLookup, fetcher: privateFetcher }), /非公开/);
  const failedFetcher = /** @type {typeof fetch} */ (async () => Response.json({ Status: 2 }));
  await assert.rejects(resolveHost("example.com", { lookup: fakeLookup, fetcher: failedFetcher }), /未成功/);
  const oversizedFetcher = /** @type {typeof fetch} */ (async () => new Response("x".repeat(65537)));
  await assert.rejects(resolveHost("example.com", { lookup: fakeLookup, fetcher: oversizedFetcher }), /响应过大/);
  console.log("代理 DNS 回归：Fake-IP 复核、公网结果、私有地址、失败与响应上限通过");
}

if (require.main === module) testProxyDNS().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { testProxyDNS };
