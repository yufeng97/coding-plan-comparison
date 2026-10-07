"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {tasks,runTask,validateRuns,build} = require("../benchmarks/benchmark");
const catalog=tasks();
const root=path.resolve(__dirname,"../..");
for(const task of catalog) {
  const result=runTask({task:task.id,solution:path.join(root,"benchmarks/fixtures",task.id)});
  assert.equal(result.passed,false,"起始实现应无法通过全部验收");
  assert.equal(result.attempts.length,3);
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"coding-benchmark-test-"));
try {
  fs.writeFileSync(path.join(dir,"solution.cjs"), `module.exports=({input,cached,output,inputPrice,cachePrice,outputPrice})=>{const a=[input,cached,output,inputPrice,cachePrice,outputPrice];if(a.some(v=>!Number.isFinite(v)||v<0)||cached>input)throw Error('invalid');return ((input-cached)*inputPrice+cached*cachePrice+output*outputPrice)/1e6;};`);
  const run=runTask({task:"cached-cost",solution:dir,model:"test-only",tool:"fixture",evidence:"https://example.com/repro",generationSeconds:2});
  assert.equal(run.passed,true);
  run.reviewedBy="test"; run.reviewedAt=new Date().toISOString();
  assert.doesNotThrow(()=>validateRuns({schemaVersion:1,runs:[run]}));
  const references = {
    "csv-export": `module.exports=rows=>{if(!Array.isArray(rows)||rows.some(row=>!Array.isArray(row)))throw Error();return rows.map(row=>row.map(value=>{let text=String(value??'');if(/^[=+\\-@\\t\\r]/.test(text))text="'"+text;return /[,"\\r\\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}).join(',')).join('\\r\\n');};`,
    "url-state": `module.exports={decode:q=>{const p=new URLSearchParams(q);return {budget:['any','50','100'].includes(p.get('budget'))?p.get('budget'):'any',region:['all','cn','intl'].includes(p.get('region'))?p.get('region'):'all',search:p.get('search')||''};},encode:s=>new URLSearchParams({budget:s.budget,region:s.region,search:s.search}).toString()};`
  };
  for (const [task,source] of Object.entries(references)) {
    fs.writeFileSync(path.join(dir,"solution.cjs"),source);
    assert.equal(runTask({task,solution:dir}).passed,true,task+"有效解答应通过");
  }
  for(const patch of [{cost:0},{repeats:1},{passed:false},{fixtureHash:"bad"},{measuredAt:"2026-02-30T00:00:00.000Z"},{evidence:"http://example.com"},{generationSeconds:-1}]) {
    assert.throws(()=>validateRuns({schemaVersion:1,runs:[{...run,...patch}]}));
  }
  assert.throws(()=>validateRuns({schemaVersion:1,runs:[run,run]}),/重复/);
  for(const evidence of ["https://192.168.1.10/repro","https://10.0.0.1/repro","https://169.254.169.254/repro","https://[::1]/repro"]) assert.throws(()=>validateRuns({schemaVersion:1,runs:[{...run,evidence}]}));
  for(const options of [{generationSeconds:"oops"},{generationSeconds:-1},{cost:"oops"},{cost:0},{costBasis:"bad"},{currency:"bad"},{costBasis:"api-receipt"}]) assert.throws(()=>runTask({task:"cached-cost",solution:dir,...options}));
  assert.throws(()=>runTask({task:"cached-cost",solution:dir,repeats:0}));
  for(const source of ['process.exit(0);', "require('node:fs').writeFileSync(__filename,'process.exit(0)');", "module.exports=({input,cached,output,inputPrice,cachePrice,outputPrice})=>{if(cached>input||input<0)throw Error();return ((input-cached)*inputPrice+cached*cachePrice+output*outputPrice)/1e6;}"]) {
    fs.writeFileSync(path.join(dir,"solution.cjs"),source);
    const invalid=runTask({task:"cached-cost",solution:dir});
    assert.equal(invalid.passed,false);
    assert.ok(invalid.attempts.every(item=>!item.passed));
    assert.equal(fs.readFileSync(path.join(dir,"solution.cjs"),"utf8"),source);
  }
  assert.equal(build().runs.length,JSON.parse(fs.readFileSync(path.join(root,"benchmarks/results.json"),"utf8")).runs.length);
  const workspace=path.join(dir,"workspace");
  fs.mkdirSync(path.join(workspace,"scripts/benchmarks"),{recursive:true});
  fs.cpSync(path.join(root,"benchmarks"),path.join(workspace,"benchmarks"),{recursive:true});
  fs.copyFileSync(path.join(root,"scripts/benchmarks/load-solution.cjs"),path.join(workspace,"scripts/benchmarks/load-solution.cjs"));
  fs.writeFileSync(path.join(workspace,"benchmarks/results.json"),JSON.stringify({schemaVersion:1,runs:[]}));
  build(workspace);
  const publicFile=path.join(workspace,"js/benchmark-data.js");
  fs.writeFileSync(publicFile,"stale-public-data");
  assert.throws(()=>build(workspace,{check:true}),/过期/);
  assert.equal(fs.readFileSync(publicFile,"utf8"),"stale-public-data","检查模式必须只读");
  build(workspace);
  assert.doesNotThrow(()=>build(workspace,{check:true}));
} finally {
  if(path.dirname(dir)!==fs.realpathSync(os.tmpdir())||!path.basename(dir).startsWith("coding-benchmark-test-"))throw Error("未知测试目录");
  fs.rmSync(dir,{recursive:true,force:true});
}
console.log("✓ 固定任务失败/通过、版本哈希、费用与时间口径、重复记录及真实记录校验");
