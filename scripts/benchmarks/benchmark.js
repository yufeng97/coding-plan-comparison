#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { publicURL } = require("../news/network");
const { readPublic } = require("./public-scores");
const { withFileLockSync } = require("../lib/file-lock");
const root = path.resolve(__dirname, "../..");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const runnerFiles = ["load-solution.cjs", "solution-worker.cjs", "solution-values.cjs"];
const lockFile = workspace => path.join(workspace, "audit/benchmark-sources/.benchmark.lock");
const lockOptions = { busyMessage: "测评正在采集、验收导入或构建，或存在遗留锁" };
function tasks(workspace = root) {
  const data = JSON.parse(fs.readFileSync(path.join(workspace, "benchmarks/tasks.json"), "utf8"));
  if (data.schemaVersion !== 1 || !Array.isArray(data.tasks)) throw new Error("任务格式无效");
  const ids = new Set();
  for (const task of data.tasks) {
    if (!/^[a-z0-9-]+$/.test(task.id) || task.fixture !== task.id || ids.has(task.id) || !Number.isInteger(task.version) || task.version < 1) throw new Error("任务 ID/版本无效");
    for (const key of ["title", "description", "acceptance"]) textField(task[key], key, 2000);
    ids.add(task.id);
    const dir = path.join(workspace, "benchmarks/fixtures", task.fixture);
    task.fixtureHash = digest(JSON.stringify([
      ...["solution.cjs","check.cjs"].map(file=>[file,fs.readFileSync(path.join(dir,file)).toString("base64")]),
      ...runnerFiles.map(file=>[file,fs.readFileSync(path.join(workspace,"scripts/benchmarks",file)).toString("base64")]),
    ]));
  }
  return data.tasks;
}
function textField(value, name, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008]/.test(value)) throw new Error(`${name} 无效`);
}
function validateRuns(data, catalog = tasks()) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.runs)) throw new Error("测评数据格式无效");
  const ids = new Set();
  for (const run of data.runs) {
    for (const key of ["id", "taskId", "model", "tool", "environment", "reviewedBy"]) textField(run[key], key);
    if (ids.has(run.id) || !/^run-[a-f0-9]{24}$/.test(run.id)) throw new Error("重复或无效测评 ID");
    ids.add(run.id);
    const task = catalog.find(item => item.id === run.taskId);
    if (!task || run.taskVersion !== task.version || run.fixtureHash !== task.fixtureHash || !/^[a-f0-9]{64}$/.test(run.solutionHash)) throw new Error("任务版本或证据哈希不匹配");
    for (const key of ["measuredAt", "reviewedAt"]) {
      if (typeof run[key] !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(run[key]) || !Number.isFinite(Date.parse(run[key])) || new Date(run[key]).toISOString() !== run[key]) throw new Error(`${key} 必须为有效 UTC ISO 时间`);
    }
    if (Date.parse(run.reviewedAt) < Date.parse(run.measuredAt)) throw new Error("审核时间不能早于测评时间");
    publicURL(run.evidence,true);
    if (!Number.isInteger(run.repeats) || run.repeats < 3 || run.repeats > 10 || !Array.isArray(run.attempts) || run.attempts.length !== run.repeats) throw new Error("每组验收重复次数应为 3–10");
    for (const attempt of run.attempts) {
      if (typeof attempt.passed !== "boolean" || typeof attempt.completed !== "boolean" || typeof attempt.solutionUnchanged !== "boolean" || (attempt.passed && (!attempt.completed || !attempt.solutionUnchanged)) || !Number.isFinite(attempt.durationSeconds) || attempt.durationSeconds < 0 || !/^[a-f0-9]{64}$/.test(attempt.outputHash)) throw new Error("验收记录无效");
    }
    const average = run.attempts.reduce((sum,item)=>sum+item.durationSeconds,0)/run.repeats;
    if (run.passed !== run.attempts.every(item=>item.passed) || !Number.isFinite(run.durationSeconds) || Math.abs(run.durationSeconds-average) > .001) throw new Error("汇总与验收记录不一致");
    if (run.generationSeconds !== null && (!Number.isFinite(run.generationSeconds) || run.generationSeconds < 0)) throw new Error("生成耗时须为实际秒数或 null");
    if (!["api-receipt", "included-subscription", "unknown"].includes(run.costBasis) || !["USD", "CNY", "INR"].includes(run.currency)) throw new Error("费用口径无效");
    if (run.costBasis === "api-receipt") {
      if (!Number.isFinite(run.cost) || run.cost < 0) throw new Error("API 费用须填真实账单金额");
    } else if (run.cost !== null) throw new Error("订阅内与未知费用应填 null，不得当作零成本");
  }
  return data;
}
// 验收会执行传入的 solution.cjs，仅用于维护者主动选择的可信本机目录。
function runTask(options, workspace = root) {
  const costBasis=options.costBasis||"unknown",currency=options.currency||"CNY";
  if (!["api-receipt","included-subscription","unknown"].includes(costBasis) || !["CNY","USD","INR"].includes(currency)) throw new Error("费用口径或币种无效");
  const numberOption=(value,name)=>{
    if(value===undefined)return null;
    if(!["string","number"].includes(typeof value)||String(value).trim()===""||!Number.isFinite(Number(value))||Number(value)<0)throw new Error(name+"须为有限的非负数字");
    return Number(value);
  };
  const cost=numberOption(options.cost,"--cost"),generationSeconds=numberOption(options.generationSeconds,"--generation-seconds");
  if(costBasis==="api-receipt"&&cost===null)throw new Error("API 账单口径需要 --cost");
  if(costBasis!=="api-receipt"&&cost!==null)throw new Error("订阅内或未知费用不得填单次金额");
  if(options.evidence)publicURL(options.evidence,true);
  const task = tasks(workspace).find(item=>item.id===options.task);
  if (!task) throw new Error("未知任务");
  const repeats = Number(options.repeats ?? 3);
  if (!Number.isInteger(repeats) || repeats < 3 || repeats > 10) throw new Error("--repeats 须为 3–10");
  const solution = path.resolve(options.solution || "");
  const file = path.join(solution, "solution.cjs");
  if (!options.solution || !fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error("请指定含 solution.cjs 的可信解答目录");
  const bytes = fs.readFileSync(file);
  if (bytes.length > 256 * 1024) throw new Error("解答文件过大");
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(temporaryRoot, "coding-benchmark-"));
  const scratchReal = fs.realpathSync(scratch);
  const attempts = [];
  try {
    for (let index=0;index<repeats;index++) {
      const attemptDir=path.join(scratch,String(index));fs.mkdirSync(attemptDir);
      fs.writeFileSync(path.join(attemptDir,"solution.cjs"),bytes);
      const nonce=crypto.randomBytes(16).toString("hex");
      const start = performance.now();
      const outcome = spawnSync(process.execPath, [path.join(workspace, "benchmarks/fixtures", task.fixture, "check.cjs"), attemptDir, nonce], {encoding:"utf8",timeout:10000,maxBuffer:256*1024,shell:false});
      const completed=String(outcome.stdout||"").split(/\r?\n/).includes("BENCHMARK_COMPLETE:"+nonce);
      const snapshot=path.join(attemptDir,"solution.cjs");
      const solutionUnchanged=fs.existsSync(snapshot)&&fs.lstatSync(snapshot).isFile()&&!fs.lstatSync(snapshot).isSymbolicLink()&&digest(fs.readFileSync(snapshot))===digest(bytes);
      attempts.push({passed:outcome.status===0 && !outcome.error&&completed&&solutionUnchanged,completed,solutionUnchanged,durationSeconds:Math.round((performance.now()-start))/1000,outputHash:digest(String(outcome.stdout||"")+String(outcome.stderr||"")+String(outcome.error?.message||""))});
    }
  } finally {
    if (path.dirname(scratchReal) !== temporaryRoot || !path.basename(scratchReal).startsWith("coding-benchmark-") || fs.lstatSync(scratch).isSymbolicLink() || fs.realpathSync(scratch) !== scratchReal) throw new Error("未知验收暂存目录");
    fs.rmSync(scratch,{recursive:true,force:true});
  }
  const measuredAt = new Date().toISOString();
  return {id:"run-"+digest(measuredAt+digest(bytes)+task.id).slice(0,24),taskId:task.id,taskVersion:task.version,fixtureHash:task.fixtureHash,solutionHash:digest(bytes),model:options.model||"未提供",tool:options.tool||"未提供",measuredAt,environment:options.environment||`Node ${process.version}; ${process.platform}/${process.arch}`,cost,currency,costBasis,generationSeconds,evidence:options.evidence||"",repeats,attempts,passed:attempts.every(item=>item.passed),durationSeconds:attempts.reduce((sum,item)=>sum+item.durationSeconds,0)/repeats};
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp = file+".tmp-"+process.pid;
  try { fs.writeFileSync(temp,content); fs.renameSync(temp,file); }
  finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function build(workspace = root, options = {check:false}) {
  return withFileLockSync(lockFile(workspace), () => {
  const data = validateRuns(JSON.parse(fs.readFileSync(path.join(workspace,"benchmarks/results.json"),"utf8")),tasks(workspace));
  const output = {schemaVersion:1,tasks:tasks(workspace),runs:data.runs,methodology:"固定任务与版本；同一解答在独立暂存目录重复验收至少 3 次，不代表独立模型尝试。断言由独立于解答的 checker 执行，导入须提供原解答并复验其哈希与通过状态。生成耗时由贡献者记录，展示的验收耗时为导入时本机重跑结果；费用为生成该解答的真实 API 账单金额，订阅内/未知不记零。解答仅运行维护者选择的可信本机代码，独立进程不构成恶意代码安全沙箱。不同工具、任务、版本和费用口径分别比较。",generatedAt:data.runs.reduce((date,run)=>run.reviewedAt.slice(0,10)>date?run.reviewedAt.slice(0,10):date,"2026-10-08")};
  const snapshot = { ...output, public: readPublic(workspace) };
  const content = "/* 自动生成：npm run benchmark:build */\nconst BENCHMARKS = "+JSON.stringify(snapshot,null,2)+";\n";
  const file = path.join(workspace,"js/benchmark-data.js");
  if (!fs.existsSync(file) || fs.readFileSync(file,"utf8")!==content) {
    if (options.check) throw new Error("测评公共数据过期，请运行 npm run benchmark:build");
    atomicWrite(file,content);
  }
  return snapshot;
  }, lockOptions);
}
function importRun(options, workspace = root) {
  if (!options.input || !options.reviewer || !options.solution) throw new Error("import 需要 --input、--reviewer 与原解答 --solution");
  return withFileLockSync(lockFile(workspace), () => {
    const supplied=JSON.parse(fs.readFileSync(path.resolve(options.input),"utf8"));
    if (!supplied.model || supplied.model==="未提供" || !supplied.tool || supplied.tool==="未提供") throw new Error("先补齐真实模型与工具信息");
    const claimed={...supplied,reviewedBy:options.reviewer,reviewedAt:new Date().toISOString()};
    validateRuns({schemaVersion:1,runs:[claimed]},tasks(workspace));
    const solutionFile=path.join(path.resolve(options.solution),"solution.cjs");
    if (!fs.lstatSync(solutionFile).isFile() || fs.lstatSync(solutionFile).isSymbolicLink() || digest(fs.readFileSync(solutionFile))!==claimed.solutionHash) throw new Error("原解答与导入记录的 solutionHash 不匹配");
    const verified=runTask({
      task:claimed.taskId,solution:options.solution,repeats:claimed.repeats,
      model:claimed.model,tool:claimed.tool,evidence:claimed.evidence,
      costBasis:claimed.costBasis,currency:claimed.currency,
      ...(claimed.cost!==null?{cost:claimed.cost}:{}),
      ...(claimed.generationSeconds!==null?{generationSeconds:claimed.generationSeconds}:{}),
    },workspace);
    if (verified.solutionHash!==claimed.solutionHash || verified.fixtureHash!==claimed.fixtureHash || verified.passed!==claimed.passed ||
        verified.attempts.some((attempt,index)=>["passed","completed","solutionUnchanged"].some(key=>attempt[key]!==claimed.attempts[index][key]))) {
      throw new Error("原解答重跑与导入记录的验收状态不一致");
    }
    // Random completion nonces prevent historical output hashes from matching.
    const run={...claimed,attempts:verified.attempts,passed:verified.passed,durationSeconds:verified.durationSeconds,
      measuredAt:verified.measuredAt,environment:verified.environment,originalEnvironment:claimed.environment,
      originalMeasuredAt:claimed.measuredAt,reviewedAt:new Date().toISOString()};
    const file=path.join(workspace,"benchmarks/results.json");
    const data=JSON.parse(fs.readFileSync(file,"utf8"));
    data.runs.push(run);validateRuns(data,tasks(workspace));
    atomicWrite(file,JSON.stringify(data,null,2)+"\n");
    return run;
  },lockOptions);
}
function main(argv) {
  const command = argv.shift();
  const options = {};
  for (let index=0;index<argv.length;index+=2) {
    const key = argv[index];
    if (!/^--[a-z-]+$/.test(key) || !argv[index+1] || argv[index+1].startsWith("--")) throw new Error("参数需要 --键 值");
    const names={"cost-basis":"costBasis","generation-seconds":"generationSeconds"};
    if (!["task","solution","model","tool","cost","currency","cost-basis","generation-seconds","evidence","environment","repeats","input","reviewer"].includes(key.slice(2))) throw new Error("未知参数："+key);
    options[names[key.slice(2)]||key.slice(2)]=argv[index+1];
  }
  if (command === "build") return build();
  if (command === "check") return build(root,{check:true});
  if (command === "validate") { readPublic(); return validateRuns(JSON.parse(fs.readFileSync(path.join(root,"benchmarks/results.json"),"utf8"))); }
  if (command === "run") {
    const run=runTask(options);
    atomicWrite(path.join(root,"audit/benchmarks",run.id+".json"),JSON.stringify(run,null,2)+"\n");
    console.log(`验收${run.passed?"通过":"失败"}：${run.id}；审核后使用 import 发布；本命令不调用模型。`);
    return run;
  }
  if (command === "import") {
    return importRun(options);
  }
  throw new Error("使用 benchmark.js build | validate | run --task ID --solution 目录 [--model 名称 --tool 工具 --evidence HTTPS地址] | import --input 文件 --reviewer 维护者 --solution 原解答目录");
}
if(require.main===module) {try {main(process.argv.slice(2));} catch(error) {console.error(error.message);process.exitCode=1;}}
module.exports={tasks,validateRuns,runTask,importRun,build,main};
