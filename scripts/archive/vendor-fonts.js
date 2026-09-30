/* 一次性：把 Remix Icon 与 Google Fonts 下载到 libs/fonts，供页面离线使用。 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "libs", "fonts");
fs.mkdirSync(dir, { recursive: true });

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: headers || {} }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        get(r.headers.location, headers).then(resolve, reject);
        return;
      }
      if (r.statusCode !== 200) {
        reject(new Error(r.statusCode + " " + url));
        return;
      }
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

(async () => {
  const css = (await get("https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css")).toString("utf8");
  const woff = await get("https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.woff2");
  fs.writeFileSync(path.join(dir, "remixicon.woff2"), woff);
  const localCss = css.replace(/src:[^;]+;/, 'src: url("remixicon.woff2") format("woff2");');
  fs.writeFileSync(path.join(dir, "remixicon.css"), localCss);

  const ua = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  let gcss = (await get(
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
    ua
  )).toString("utf8");
  const urls = [...gcss.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
  let i = 0;
  for (const u of urls) {
    const buf = await get(u);
    const name = "gf-" + (i++) + ".woff2";
    fs.writeFileSync(path.join(dir, name), buf);
    gcss = gcss.replace(u, name);
  }
  fs.writeFileSync(path.join(dir, "fonts.css"), gcss);
  console.log("remix woff2", woff.length, "icon css", localCss.length, "webfonts", urls.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
