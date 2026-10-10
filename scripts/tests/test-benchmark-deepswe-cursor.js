// @ts-check
'use strict';
const assert = require('node:assert/strict');
const {collect} = require('../benchmarks/sources/deepswe-cursor');

// Test-only, intentionally tiny protocol fixtures. Labels and Cursor's published
// numeric examples are real; DeepSWE token counts/cost are synthetic to isolate
// the official 80%-cached price-adjustment formula. These are never public scores.
const checkedAt = '2026-10-08T01:00:00.000Z';
const deepPage = 'https://deepswe.datacurve.ai/';
const artifactUrl = deepPage + 'artifacts/v1.1/leaderboard-live.json';
const originalArtifactUrl = deepPage + 'artifacts/v1/leaderboard-live.json';
const revisionUrl = deepPage + 'blog/deepswe-v1-1';
const deepModule = deepPage + 'assets/index-fixture.js';
const cursorPage = 'https://cursor.com/evals';
const cursorModule = 'https://cursor.com/marketing-static/_next/static/chunks/fixture-data.js';
const cursorDependency = 'https://cursor.com/marketing-static/_next/static/chunks/fixture-unused.js';
const cursorRelease = 'https://cursor.com/blog/composer-2';
const cursorMethod = 'https://cursor.com/blog/cursorbench';

function fixtures() {
  const row = {
    model:'gpt-5-6-sol', harness:'mini-swe-agent', reasoning_effort:'max', config:'test-sol-max',
    pass_at_1:0.75, n_passed:3, n_attempted:4, ci_lo:0.6, ci_hi:0.9, ci_method:'test-only interval',
    mean_cost_usd:1.7, mean_input_tokens:1000000, mean_cache_tokens:800000, mean_output_tokens:10000, mean_agent_steps:12.5
  };
  const rates = {
    'gpt-5-6-sol':{from:{input:5,cached:0.5,output:30},to:{input:4,cached:0.4,output:20}},
    'deepseek-v4-pro':{
      v1:{from:{input:1.74,cached:0.0145,output:3.48},to:{input:0.435,cached:0.003625,output:0.87}},
      'v1.1':{from:{input:0.435,cached:0.003625,output:0.87},to:{input:1.32,cached:0.044,output:3.96}}
    }
  };
  const families = [{key:'fable',name:'Fable',children:[
    {key:'opus55',label:'Opus 5.5',version:'5.5',runs:[
      {effort:'max',score:57.8,avgCost:13.43,outputTokens:218363,avgSteps:184.5},
      {effort:'high',score:56,avgCost:3.97,outputTokens:53078,avgSteps:68.2}
    ]},
    {key:'sonnet55',label:'Sonnet 5.5',version:'5.5',defaultVisible:false,runs:[
      {effort:'max',score:55.5,avgCost:7.05,outputTokens:271920,avgSteps:169.5}
    ]}
  ]}];
  const payload = `9:I[42,["${new URL(cursorDependency).pathname}","${new URL(cursorModule).pathname}"],"CursorBenchLeaderboard"]\n`;
  /** @type {Record<string,string>} */
  const files = {
    [deepPage]:'<script type="module">import("/assets/index-fixture.js")</script>',
    [revisionUrl]:'Test-only protocol evidence: Isolated Verification; Structured test reports',
    [artifactUrl]:JSON.stringify({generated_at:'2026-09-22T06:27:15Z',n_tasks_in_set:113,rows:[row]}),
    [originalArtifactUrl]:JSON.stringify({generated_at:'2026-06-20T17:27:24Z',n_tasks_in_set:113,rows:[{...row,model:'deepseek-v4-pro',config:'test-deepseek-max',pass_at_1:0.5,n_passed:2}]}),
    [deepModule]:`const priceAdjustments=${JSON.stringify(rates)};`,
    [cursorPage]:`<h1>CursorBench 4.0</h1><time dateTime="2026-10-07">Oct 7</time><section aria-labelledby="cursorbench-changelog-2026-05-19">CursorBench 3.1</section><section aria-labelledby="cursorbench-changelog-2026-03-11">CursorBench 3.0</section><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`,
    [cursorModule]:`let families=${JSON.stringify(families)};`,
    [cursorDependency]:'const nonDataset=[1,2,3]; function uncalled(){ throw Error("not data"); }',
    [cursorRelease]:'<h1>Introducing Composer 2</h1><time dateTime="2026-03-19T00:00:00.000Z">Mar 19</time><table><tr><th>Model</th><th>CursorBench</th><th>Terminal-Bench 2.0</th><th>SWE-bench Multilingual</th></tr><tr><td>Composer 2</td><td>61.3</td><td>61.7</td><td>73.7</td></tr><tr><td>Composer 1.5</td><td>44.2</td><td>47.9</td><td>65.9</td></tr><tr><td>Composer 1</td><td>38.0</td><td>40.0</td><td>56.9</td></tr></table>',
    [cursorMethod]:'<p>Initial CursorBench-3 results. Update, May 2026: We updated CursorBench to 3.1 with harder problems; the problem distribution changed.</p>'
  };
  return files;
}
/** @param {(url:string,text:string)=>string} [rewrite] */
function getter(rewrite = (_url, text) => text) {
  const files = fixtures();
  /** @type {string[]} */
  const requested = [];
  /** @param {string} url */
  async function get(url) {
    requested.push(url);
    assert.ok(Object.hasOwn(files, url), `No network allowed: ${url}`);
    return {text:rewrite(url, files[url]),url,hash:'test-only-source-hash',checkedAt};
  }
  return {get,requested};
}
/** @param {(row:Record<string,any>, data:Record<string,any>)=>void} change */
function changeDeep(change) {
  return getter((url, text) => {
    if (url !== artifactUrl) return text;
    const data = JSON.parse(text);
    change(data.rows[0], data);
    return JSON.stringify(data);
  }).get;
}
let passed = 0;
/** @param {string} label @param {()=>Promise<void>} run */
async function test(label, run) {
  await run(); passed++; console.log('✓ ' + label);
}
async function main() {
  await test('公开字面量保持全部推理档位、隐藏模型、原始步数和来源日期', async () => {
    const fixture = getter();
    const data = await collect(fixture.get);
    assert.deepEqual(data.benchmarks.map(board => [board.id,board.version,board.sourceUpdatedAt]), [
      ['deepswe-v1-1','1.1','2026-09-22'], ['deepswe-v1','1','2026-06-20'], ['cursorbench-4-0','4.0','2026-10-07'], ['cursorbench-3-0-release','3.0','2026-03-19']
    ]);
    const cursor = data.scores.filter(row => row.benchmarkId === 'cursorbench-4-0');
    assert.equal(cursor.length, 3);
    assert.deepEqual(cursor.map(row => [row.model,row.reasoning]), [['Opus 5.5','max'],['Opus 5.5','high'],['Sonnet 5.5','max']]);
    assert.equal(cursor[0].steps, 184.5);
    assert.equal(cursor[0].agent, null);
    assert.ok(cursor.every(row => row.sourceUrl === cursorPage && row.checkedAt === checkedAt));
    assert.ok(fixture.requested.includes(cursorDependency) && fixture.requested.includes(cursorModule));
  });
  await test('CursorBench 历史发布节选独立排名，缺失费用与推理设置保持未知', async () => {
    const data = await collect(getter().get);
    const history = data.benchmarks.find(board => board.id === 'cursorbench-3-0-release');
    const rows = data.scores.filter(row => row.benchmarkId === history.id);
    assert.match(history.name, /历史发布节选/);
    assert.match(history.scope, /非完整榜单/);
    assert.deepEqual(rows.map(row => [row.model,row.score]), [['Composer 2',61.3],['Composer 1.5',44.2],['Composer 1',38]]);
    assert.ok(rows.every(row => ['costUSD','costNote','reasoning','agent','tokens','steps'].every(key => row[key] === null)));
    assert.ok(rows.every(row => row.sourceUrl === cursorRelease));
    const duplicateMarkup = await collect(getter((url,text) => url === cursorRelease ? text + text.match(/<table[\s\S]*?<\/table>/)[0] : text).get);
    assert.equal(duplicateMarkup.scores.filter(row => row.benchmarkId === history.id).length, 3);
  });
  await test('CursorBench 历史表格列变更、冲突副本、重复模型或版本证据缺失时失败', async () => {
    await assert.rejects(collect(getter((url,text) => url === cursorRelease ? text.replace('CursorBench','Unrelated') : text).get), /release table/);
    await assert.rejects(collect(getter((url,text) => url === cursorRelease ? text + text.match(/<table[\s\S]*?<\/table>/)[0].replace('61.3','61.4') : text).get), /release table/);
    await assert.rejects(collect(getter((url,text) => url === cursorRelease ? text.replace('Composer 1.5','Composer 2') : text).get), /Duplicate historical/);
    await assert.rejects(collect(getter((url,text) => url === cursorRelease ? text.replace('<td>61.3</td>','<td>100.1</td>') : text).get), /percentage/);
    await assert.rejects(collect(getter((url,text) => url === cursorRelease ? text.replace('<td>61.3</td>','<td>unknown</td>') : text).get), /release row/);
    await assert.rejects(collect(getter((url,text) => url === cursorRelease ? text.replace('2026-03-19','2026-06-19') : text).get), /protocol evidence/);
    await assert.rejects(collect(getter((url,text) => url === cursorPage ? text.replace('CursorBench 3.0','Unknown 3.0') : text).get), /protocol evidence/);
    await assert.rejects(collect(getter((url,text) => url === cursorMethod ? text.replace('updated CursorBench to 3.1 with harder problems','unknown') : text).get), /protocol evidence/);
  });
  await test('DeepSWE 各版本保留独立成绩、日期与价格修正表', async () => {
    const data = await collect(getter().get);
    const old = data.scores.find(row => row.benchmarkId === 'deepswe-v1');
    assert.equal(old.model, 'deepseek-v4-pro');
    assert.equal(old.score, 50);
    assert.ok(Math.abs(old.costUSD - 0.425) < 1e-12, 'v1 applies its official 75% cost reduction, not the v1.1 rate change');
    assert.match(data.benchmarks.find(board => board.id === 'deepswe-v1').configuration, /版本分别排名/);
    const overlapping = await collect(getter((url,text) => url === originalArtifactUrl ? text.replace('"model":"deepseek-v4-pro"','"model":"gpt-5-6-sol"') : text).get);
    const shared = overlapping.scores.filter(row => row.model === 'gpt-5-6-sol');
    assert.deepEqual(shared.map(row => [row.benchmarkId,row.score]), [['deepswe-v1-1',75],['deepswe-v1',50]]);
  });
  await test('DeepSWE 分数仅换算一次；官方费用折算区分80%缓存输入与输出', async () => {
    const data = await collect(getter().get);
    const row = data.scores.find(row => row.benchmarkId === 'deepswe-v1-1');
    assert.equal(row.score, 75);
    // Old: 0.2M*5 + 0.8M*0.5 + .01M*30 = $1.70.
    // New: 0.2M*4 + 0.8M*0.4 + .01M*20 = $1.32.
    assert.ok(Math.abs(row.costUSD - 1.32) < 1e-12);
    assert.match(row.costNote, /价格修正/);
    assert.equal(row.agent, 'mini-swe-agent');
    assert.equal(row.reasoning, 'max');
    assert.match(row.uncertainty, /60\.00%–90\.00%/);
  });
  await test('远程顶层 throw/副作用、函数调用与 getter 均不执行', async () => {
    const original = Math.random;
    let called = false;
    Math.random = () => { called = true; throw Error('must not execute'); };
    try {
      const safe = await collect(getter((url,text) => /\.js$/.test(url) ? 'Math.random(); throw Error("no remote execution");\n' + text : text).get);
      assert.equal(safe.scores.length, 8);
      for (const injected of ['Math.random()', '(()=>{Math.random();return 57.8})()']) {
        await assert.rejects(collect(getter((url,text) => url === cursorModule ? text.replace('"score":57.8', '"score":' + injected) : text).get), /score dataset/);
      }
      await assert.rejects(collect(getter((url,text) => url === cursorModule ? text.replace('"score":57.8', 'get score(){return Math.random()}') : text).get), /score dataset/);
      assert.equal(called, false);
    } finally { Math.random = original; }
  });
  await test('原型污染键使真实数据字面量失败，不能生成空榜或污染Object原型', async () => {
    for (const key of ['__proto__','prototype','constructor']) {
      await assert.rejects(collect(getter((url,text) => url === cursorModule ? text.replace('"name":"Fable"', `"name":"Fable","${key}":{"testOnlyPollution":true}`) : text).get), /score dataset/);
    }
    assert.equal(Object.hasOwn(Object.prototype, 'testOnlyPollution'), false);
  });
  await test('DeepSWE 重复配置、空数组和遗漏必要字段被拒绝', async () => {
    await assert.rejects(collect(changeDeep((row,data) => data.rows.push({...row}))), /Duplicate DeepSWE/);
    await assert.rejects(collect(changeDeep((_row,data) => { data.rows = []; })), /Missing DeepSWE/);
    for (const key of ['model','harness','config','pass_at_1','n_attempted']) {
      await assert.rejects(collect(changeDeep(row => { delete row[key]; })), /Missing|Invalid/);
    }
  });
  await test('非法 fraction、通过数量矛盾、缓存超输入和反转置信区间被拒绝', async () => {
    for (const value of [-0.01,1.01,'0.75',null]) {
      await assert.rejects(collect(changeDeep(row => { row.pass_at_1 = value; })), /Invalid|fraction/);
    }
    await assert.rejects(collect(changeDeep(row => { row.n_passed = 2; })), /count mismatch/);
    await assert.rejects(collect(changeDeep(row => { row.mean_cache_tokens = 1000001; })), /cache tokens exceed/);
    await assert.rejects(collect(changeDeep(row => { row.ci_lo = 0.95; })), /confidence interval/);
  });
  await test('Cursor 重复推理配置、缺模型键和非百分比分数被拒绝', async () => {
    await assert.rejects(collect(getter((url,text) => url === cursorModule ? text.replace('"effort":"high"','"effort":"max"') : text).get), /Duplicate CursorBench/);
    await assert.rejects(collect(getter((url,text) => url === cursorModule ? text.replace('"key":"opus55",','') : text).get), /model key/);
    await assert.rejects(collect(getter((url,text) => url === cursorModule ? text.replace('"score":57.8','"score":100.1') : text).get), /percentage/);
  });
  await test('模块引用和基准版本缺失时失败，绝不返回空表或猜构建路径', async () => {
    await assert.rejects(collect(getter((url,text) => url === cursorPage ? text.replace('CursorBench 4.0','unknown') : text).get), /Missing CursorBench version/);
    await assert.rejects(collect(getter((url,text) => url === cursorPage ? text.replace('CursorBenchLeaderboard','UnknownModule') : text).get), /module reference/);
    await assert.rejects(collect(getter((url,text) => url === cursorModule ? 'let empty=[];' : text).get), /score dataset/);
    await assert.rejects(collect(getter((url,text) => url === deepPage ? text.replace('/assets/index-fixture.js','/other/index-fixture.js') : text).get), /pricing module/);
    await assert.rejects(collect(getter((url,text) => url === originalArtifactUrl ? text.replace('"pass_at_1":0.5','"pass_at_1":1.5') : text).get), /fraction/);
    await assert.rejects(collect(getter((url,text) => url === revisionUrl ? text.replace('Isolated Verification','unknown') : text).get), /protocol evidence/);
  });
  console.log(`DeepSWE / CursorBench parser：${passed} 项离线回归通过`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
