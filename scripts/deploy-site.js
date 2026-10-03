#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { stageSite } = require("./stage-site");

/** Fresh public assets only; never reads or deploys .vercel/output.
 * Vercel API reference: https://vercel.com/docs/rest-api/deployments/create-a-new-deployment */
function deployment(workspace, args = []) {
  if (args.some((arg) => !["--prod", "--dry-run"].includes(arg))) throw new Error("用法：npm run deploy -- [--prod] [--dry-run]");
  const root = path.resolve(workspace);
  const project = JSON.parse(fs.readFileSync(path.join(root, ".vercel", "project.json"), "utf8"));
  if (!project.projectId || !project.orgId) throw new Error("根目录 .vercel/project.json 缺少项目关联");
  const site = stageSite(root);
  const team = project.orgId.startsWith("team_") ? "?teamId=" + encodeURIComponent(project.orgId) : "";
  const files = site.files.map((file) => ({ file: file.split(path.sep).join("/"),
    data: fs.readFileSync(path.join(site.directory, file)).toString("base64"), encoding: "base64" }));
  const body = { name: project.projectName || "coding-plan-comparison", project: project.projectId, files,
    projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: "." },
    ...(args.includes("--prod") ? { target: "production" } : {}) };
  return { url: "https://api.vercel.com/v13/deployments" + team, team, body, files: site.files };
}

/** Read only the known Windows CLI auth location; tokens never enter messages or artifacts.
 * @param {{token?:string}} options
 * @param {NodeJS.ProcessEnv} environment */
function resolveDeploymentToken(options = {}, environment = process.env) {
  if (environment.VERCEL_TOKEN) return environment.VERCEL_TOKEN;
  if (options.token) return options.token;
  if (!environment.APPDATA) return undefined;
  const file = path.join(environment.APPDATA, "com.vercel.cli", "Data", "auth.json");
  try {
    const auth = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof auth.token === "string" && auth.token.trim() ? auth.token : undefined;
  } catch { return undefined; }
}

/** @param {{token?:string,fetcher?:typeof fetch,wait?:typeof delay}} options */
async function deploySite(workspace, args = [], options = {}) {
  const token = args.includes("--dry-run") ? undefined : resolveDeploymentToken(options);
  if (!args.includes("--dry-run") && !token) throw new Error("部署需要 VERCEL_TOKEN、调用者 token 或已登录的 Windows Vercel CLI；--dry-run 只验证公共文件清单");
  const job = deployment(workspace, args);
  if (args.includes("--dry-run")) return { dryRun: true, files: job.files };
  const fetcher = options.fetcher || fetch;
  const wait = options.wait || delay;
  const redact = (value) => String(value).split(token).join("[redacted]");
  try {
    const request = async (url, init = {}) => {
      const response = await fetcher(url, { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
      const result = /** @type {{id?:string,readyState?:string,url?:string,errorMessage?:string,error?:{message?:string},dryRun?:boolean,files?:string[]}} */ (JSON.parse(redact(JSON.stringify(await response.json()))));
      if (!response.ok) throw new Error("Vercel " + response.status + "：" + (result.error?.message || "请求失败"));
      return result;
    };
    let result = await request(job.url, { method: "POST", body: JSON.stringify(job.body) });
    if (!result.id) throw new Error("Vercel 未返回部署 ID");
    for (let attempt = 0; attempt <= 120; attempt++) {
      if (result.readyState === "READY") return result;
      if (["ERROR", "CANCELED"].includes(result.readyState)) throw new Error("Vercel 部署未成功：" + (result.errorMessage || result.readyState));
      if (attempt === 120) break;
      await wait(2000);
      result = await request("https://api.vercel.com/v13/deployments/" + encodeURIComponent(result.id) + job.team);
    }
    throw new Error("部署尚未 READY，请到 Vercel 项目检查状态：" + result.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(token)) throw error;
    const safeError = new Error(redact(message));
    if (error instanceof Error) safeError.name = error.name;
    throw safeError;
  }
}
if (require.main === module) deploySite(path.resolve(__dirname, ".."), process.argv.slice(2))
  .then((result) => console.log(result.dryRun ? "✅ 已验证 " + result.files.length + " 个公共文件；未发起部署" : "✅ READY：https://" + result.url))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { deployment, deploySite, resolveDeploymentToken };
