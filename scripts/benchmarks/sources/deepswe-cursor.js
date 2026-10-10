// @ts-check
'use strict';

const ts = require('typescript');
const {elements, stripElements} = require('../../news/html-scan');
const {plainText} = require('../../news/feed');

/** @typedef {{text:string,url:string,hash:string,checkedAt:string}} Download */
/** @typedef {(url:string)=>Promise<Download>} Get */
/** @typedef {Record<string, unknown>} RecordValue */

/** @param {unknown} value @returns {value is RecordValue} */
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** @param {unknown} value @param {string} field */
function string(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}`);
  return value;
}
/** @param {unknown} value @param {string} field */
function number(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field}`);
  return value;
}
/** @param {unknown} value @param {string} field */
function optionalNumber(value, field) {
  return value == null ? null : number(value, field);
}
/** @param {unknown} value @param {string} field */
function optionalString(value, field) {
  return value == null ? null : string(value, field);
}
/** @param {unknown} value @param {string} field */
function date(value, field) {
  const text = string(value, field);
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error(`Invalid ${field}`);
  return text.slice(0, 10);
}

// Only inspect literal syntax. Never execute a downloaded script, even in a VM.
/** @param {import('typescript').Node} node @returns {unknown} */
function readLiteral(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node)) {
    const value = readLiteral(node.operand);
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !value;
    if (node.operator === ts.SyntaxKind.MinusToken && typeof value === 'number') return -value;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(readLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    /** @type {RecordValue} */
    const value = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) throw new Error('Non-literal property');
      if (['__proto__', 'prototype', 'constructor'].includes(prop.name.text)) throw new Error('Unsafe literal property');
      value[prop.name.text] = readLiteral(prop.initializer);
    }
    return value;
  }
  throw new Error('Non-literal syntax');
}
/** @param {string} source @param {(value:unknown)=>boolean} matches */
function findLiteral(source, matches) {
  const ast = ts.createSourceFile('official-source.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {unknown[]} */
  const found = [];
  /** @param {import('typescript').Node} node */
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      try {
        const value = readLiteral(node.initializer);
        if (matches(value)) found.push(value);
      } catch { /* Other module declarations are deliberately not interpreted. */ }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (found.length !== 1) throw new Error(`Expected one official data literal; found ${found.length}`);
  return found[0];
}
/** @param {string} path @param {string} origin @param {string} prefix */
function officialScript(path, origin, prefix) {
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith(prefix) || !url.pathname.endsWith('.js')) throw new Error('Unexpected official script URL');
  return url.href;
}
/** @param {RecordValue} row @param {RecordValue} rates @param {string} version */
function adjustedCost(row, rates, version) {
  const raw = optionalNumber(row.mean_cost_usd, 'DeepSWE mean_cost_usd');
  const model = string(row.model, 'DeepSWE model').split('/').pop().replace(/[._]/g, '-').toLowerCase();
  const choice = rates[model];
  const rate = record(choice) && record(choice.from) ? choice : record(choice) ? choice[`v${version}`] : null;
  if (raw == null || !record(rate) || !record(rate.from) || !record(rate.to)) return {cost:raw, adjusted:false};
  const input = number(row.mean_input_tokens, 'DeepSWE mean_input_tokens');
  const cached = row.mean_cache_tokens == null ? 0 : number(row.mean_cache_tokens, 'DeepSWE mean_cache_tokens');
  const output = number(row.mean_output_tokens, 'DeepSWE mean_output_tokens');
  if (cached > input) throw new Error('DeepSWE cache tokens exceed input tokens');
  /** @param {RecordValue} prices */
  const priced = prices => (input - cached) * number(prices.input, 'input rate') + cached * number(prices.cached, 'cached rate') + output * number(prices.output, 'output rate');
  const oldCost = priced(rate.from);
  if (oldCost <= 0) throw new Error('Invalid official price adjustment denominator');
  return {cost:raw * priced(rate.to) / oldCost, adjusted:true};
}

/** @param {Get} get */
async function collectDeepSWE(get) {
  const pageUrl = 'https://deepswe.datacurve.ai/';
  const versions = ['1.1', '1'];
  const [page, revision, ...artifacts] = await Promise.all([
    get(pageUrl), get(pageUrl + 'blog/deepswe-v1-1'),
    ...versions.map(version => get(`${pageUrl}artifacts/v${version}/leaderboard-live.json`))
  ]);
  if (!revision.text.includes('Isolated Verification') || !revision.text.includes('Structured test reports')) throw new Error('Missing DeepSWE version protocol evidence');
  const scriptPath = page.text.match(/import\("(\/assets\/index-[^"\s]+\.js)"\)/)?.[1];
  if (!scriptPath) throw new Error('Missing DeepSWE official pricing module');
  const script = await get(officialScript(scriptPath, 'https://deepswe.datacurve.ai', '/assets/'));
  const rates = findLiteral(script.text, value => record(value) && record(value['gpt-5-6-sol']) && record(value['deepseek-v4-pro']) && record(value['gpt-5-6-sol'].from));
  if (!record(rates)) throw new Error('Missing DeepSWE price adjustment rates');
  const datasets = artifacts.map((artifact, index) => deepSWEDataset(artifact, rates, versions[index], pageUrl));
  return {benchmarks:datasets.flatMap(data => data.benchmarks), scores:datasets.flatMap(data => data.scores)};
}

/** @param {Download} artifact @param {RecordValue} rates @param {string} version @param {string} pageUrl */
function deepSWEDataset(artifact, rates, version, pageUrl) {
  const benchmarkId = `deepswe-v${version.replace(/\./g, '-')}`;
  const data = JSON.parse(artifact.text);
  if (!record(data) || !Array.isArray(data.rows) || data.rows.length === 0) throw new Error('Missing DeepSWE leaderboard rows');
  const seen = new Set();
  const scores = data.rows.map((row, index) => {
    if (!record(row)) throw new Error(`Invalid DeepSWE row ${index}`);
    const config = string(row.config, 'DeepSWE config');
    if (seen.has(config)) throw new Error(`Duplicate DeepSWE configuration: ${config}`);
    seen.add(config);
    const fraction = number(row.pass_at_1, 'DeepSWE pass_at_1');
    if (fraction > 1) throw new Error('DeepSWE pass_at_1 must be a fraction');
    const attempted = number(row.n_attempted, 'DeepSWE n_attempted');
    if (!attempted || Math.abs(fraction - number(row.n_passed, 'DeepSWE n_passed') / attempted) > 1e-9) throw new Error('DeepSWE score/attempt count mismatch');
    const cost = adjustedCost(row, rates, version);
    const lo = optionalNumber(row.ci_lo, 'DeepSWE ci_lo');
    const hi = optionalNumber(row.ci_hi, 'DeepSWE ci_hi');
    if ((lo == null) !== (hi == null) || (lo != null && hi != null && (lo > hi || hi > 1))) throw new Error('Invalid DeepSWE confidence interval');
    return {
      id:'', benchmarkId, model:string(row.model, 'DeepSWE model'),
      reasoning:optionalString(row.reasoning_effort, 'DeepSWE reasoning_effort'), agent:string(row.harness, 'DeepSWE harness'), score:fraction * 100,
      costUSD:cost.cost, costNote:cost.cost == null ? null : cost.adjusted ? '平均每个计分 rollout 成本；按官方页面价格修正表及同一行平均输入/缓存/输出 token 折算，原始 JSON 成本已另存审计。' : '官方 JSON 平均每个计分 rollout 成本；官网没有对此模型应用价格修正。',
      uncertainty:lo == null || hi == null ? null : `${(lo * 100).toFixed(2)}%–${(hi * 100).toFixed(2)}%；${optionalString(row.ci_method, 'DeepSWE ci_method') || '区间方法未公开'}`,
      tokens:optionalNumber(row.mean_output_tokens, 'DeepSWE mean_output_tokens'), steps:optionalNumber(row.mean_agent_steps, 'DeepSWE mean_agent_steps'),
      sourceUrl:pageUrl, checkedAt:artifact.checkedAt
    };
  });
  return {benchmarks:[{
    id:benchmarkId, family:'deepswe', name:`DeepSWE v${version}`, version, category:'coding', metric:'pass@1', unit:'%',
    description:'Datacurve 原创长程软件工程任务；计分 rollout 的通过率。provider/verifier/network 错误排除，上下文失败及 agent 超时计失败；不能与 pass@4 混用。',
    configuration:version === '1.1' ? 'mini-swe-agent；同一 bash 工具与共享 prompt。推理档位逐行保留。v1.1 在独立容器中验证已提交补丁。' : 'mini-swe-agent；同一 bash 工具与共享 prompt。推理档位逐行保留。v1 为原版执行与评分环境；v1.1 改为独立容器验证已提交补丁并输出结构化测试报告，同一任务集的版本分别排名。',
    scope:`${number(data.n_tasks_in_set, 'DeepSWE n_tasks_in_set')} 个任务；${scores.length} 个模型/推理配置；tokens 为每次计分尝试的平均输出 token，steps 为平均 agent 步数。`,
    sourceUrl:pageUrl, sourceUpdatedAt:date(data.generated_at, 'DeepSWE generated_at'), checkedAt:artifact.checkedAt
  }], scores};
}

/** @param {string} html */
function cursorModulePaths(html) {
  // Next's streamed payloads are JSON strings. Decode only that JSON, never scripts.
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)].map(match => JSON.parse(match[1]));
  const payload = chunks.join('');
  const module = payload.match(/I\[\d+,\[([^\]]*)\],"CursorBenchLeaderboard"\]/);
  if (!module) throw new Error('Missing CursorBenchLeaderboard module reference');
  const paths = JSON.parse(`[${module[1]}]`);
  if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string')) throw new Error('Invalid CursorBench module paths');
  return [...new Set(paths)].map(path => officialScript(path, 'https://cursor.com', '/marketing-static/_next/static/chunks/'));
}
/** @param {Get} get */
async function collectCursorBench(get) {
  const pageUrl = 'https://cursor.com/evals';
  const page = await get(pageUrl);
  const version = page.text.match(/<h1\b[^>]*>CursorBench\s+(\d+(?:\.\d+)+)<\/h1>/)?.[1];
  if (!version) throw new Error('Missing CursorBench version');
  const scripts = await Promise.all(cursorModulePaths(page.text).map(get));
  /** @type {unknown[]} */
  const matches = [];
  for (const script of scripts) {
    try { matches.push(findLiteral(script.text, value => Array.isArray(value) && value.length > 0 && value.every(family => record(family) && typeof family.name === 'string' && Array.isArray(family.children) && family.children.length && family.children.every(model => record(model) && typeof model.label === 'string' && Array.isArray(model.runs) && model.runs.length)))); }
    catch (error) { if (!(error instanceof Error) || !error.message.endsWith('found 0')) throw error; }
  }
  if (matches.length !== 1 || !Array.isArray(matches[0])) throw new Error(`Expected one CursorBench score dataset; found ${matches.length}`);
  /** @type {Array<{id:string,benchmarkId:string,model:string,reasoning:string|null,agent:null,score:number,costUSD:number|null,costNote:string|null,uncertainty:string,tokens:number|null,steps:number|null,sourceUrl:string,checkedAt:string}>} */
  const scores = [];
  const seen = new Set();
  for (const family of matches[0]) {
    if (!record(family) || !Array.isArray(family.children)) throw new Error('Invalid CursorBench family');
    for (const model of family.children) {
      if (!record(model) || !Array.isArray(model.runs)) throw new Error('Invalid CursorBench model');
      for (const run of model.runs) {
        if (!record(run)) throw new Error('Invalid CursorBench run');
        const reasoning = optionalString(run.effort, 'CursorBench effort');
        const key = `${string(model.key, 'CursorBench model key')}|${reasoning ?? ''}`;
        if (seen.has(key)) throw new Error(`Duplicate CursorBench run: ${key}`);
        seen.add(key);
        const score = number(run.score, 'CursorBench score');
        if (score > 100) throw new Error('CursorBench score must be a percentage');
        const costUSD = optionalNumber(run.avgCost, 'CursorBench avgCost');
        scores.push({
          id:'', benchmarkId:`cursorbench-${version.replace(/\./g, '-')}`, model:string(model.label, 'CursorBench model label'), reasoning, agent:null, score, costUSD,
          costNote:costUSD == null ? null : '官网平均每任务 USD 成本，按模型公布的输入、缓存读取、缓存写入和输出价格计算；不是订阅套餐价格。',
          uncertainty:'官方提示结果存在波动，小分差未必显著；未公开逐行置信区间。',
          tokens:optionalNumber(run.outputTokens, 'CursorBench outputTokens'), steps:optionalNumber(run.avgSteps, 'CursorBench avgSteps'), sourceUrl:pageUrl, checkedAt:page.checkedAt
        });
      }
    }
  }
  if (!scores.length) throw new Error('Empty CursorBench score dataset');
  const newest = page.text.match(/<time\b[^>]*dateTime="(\d{4}-\d{2}-\d{2})"/i)?.[1] || null;
  const history = await cursorBenchHistory(get, page);
  return {benchmarks:[{
    id:`cursorbench-${version.replace(/\./g, '-')}`, family:'cursorbench', name:`CursorBench ${version}`, version, category:'coding', metric:'Solution correctness', unit:'%',
    description:'Cursor 发布的真实 Cursor 会话、多文件且可能含歧义的软件工程任务正确性评测；任务集随版本更换，同一版本内比较。',
    configuration:'官方内部评测；当前榜单未公开 harness 版本、system prompt、grader 配置及任务数，agent 保留未知。推理档位按官方原文保留。',
    scope:`${scores.length} 个模型/推理配置；tokens 为平均输出 token，steps 为平均 agent 步数；完整公开数组包含页面默认隐藏的模型。`,
    sourceUrl:pageUrl, sourceUpdatedAt:newest == null ? null : date(newest, 'CursorBench changelog date'), checkedAt:page.checkedAt
  }, ...history.benchmarks], scores:[...scores, ...history.scores]};
}

/** @param {Get} get @param {Download} current */
async function cursorBenchHistory(get, current) {
  const pageUrl = 'https://cursor.com/blog/composer-2';
  const methodUrl = 'https://cursor.com/blog/cursorbench';
  const [release, method] = await Promise.all([get(pageUrl), get(methodUrl)]);
  const visible = stripElements(release.text, ['script', 'style', 'template']);
  const headings = [...elements(visible, ['h1'])].map(heading => plainText(heading.inner));
  if (!headings.length || headings.some(heading => heading !== 'Introducing Composer 2')) throw new Error('Missing historical CursorBench release article');
  const articleDate = visible.match(/<time\b[^>]*dateTime="(\d{4}-\d{2}-\d{2})T/iu)?.[1];
  const changelog = [...elements(stripElements(current.text, ['script', 'style', 'template']), ['section'])];
  /** @param {string} version */
  function protocolDate(version) {
    const entries = changelog.filter(section => plainText(section.inner).includes(`CursorBench ${version}`));
    const dates = new Set(entries.map(section => section.attrs.match(/aria-labelledby="cursorbench-changelog-(\d{4}-\d{2}-\d{2})"/u)?.[1]).filter(Boolean));
    return dates.size === 1 ? [...dates][0] : null;
  }
  const initial = protocolDate('3.0');
  const revised = protocolDate('3.1');
  const methodText = plainText(method.text);
  if (!initial || !revised || !articleDate || articleDate < initial || articleDate >= revised || !methodText.includes('CursorBench-3') || !methodText.includes('updated CursorBench to 3.1 with harder problems')) throw new Error('Missing historical CursorBench 3.0 protocol evidence');
  const tables = [...elements(visible, ['table'])].map(table => [...elements(table.inner, ['tr'])].map(row => [...elements(row.inner, ['th', 'td'])].map(cell => plainText(cell.inner))));
  const matching = tables.filter(rows => rows[0]?.join('|') === 'Model|CursorBench|Terminal-Bench 2.0|SWE-bench Multilingual');
  const unique = new Map(matching.map(rows => [JSON.stringify(rows), rows]));
  if (unique.size !== 1) throw new Error('Expected one historical CursorBench release table');
  const rows = [...unique.values()][0].slice(1);
  if (!rows.length) throw new Error('Empty historical CursorBench release table');
  const seen = new Set();
  const scores = rows.map(row => {
    if (row.length !== 4 || !/^\d+(?:\.\d+)?$/u.test(row[1])) throw new Error('Invalid historical CursorBench release row');
    const model = string(row[0], 'historical CursorBench model');
    if (seen.has(model)) throw new Error('Duplicate historical CursorBench model');
    seen.add(model);
    const score = number(Number(row[1]), 'historical CursorBench score');
    if (score > 100) throw new Error('Historical CursorBench score must be a percentage');
    return {
      id:'', benchmarkId:'cursorbench-3-0-release', model, reasoning:null, agent:null, score, costUSD:null, costNote:null,
      uncertainty:'历史发布文章未公开逐行置信区间；节选成绩不能代表完整榜单名次。',
      tokens:null, steps:null, sourceUrl:pageUrl, checkedAt:release.checkedAt
    };
  });
  return {benchmarks:[{
    id:'cursorbench-3-0-release', family:'cursorbench', name:'CursorBench 3.0（历史发布节选）', version:'3.0', category:'coding', metric:'Solution correctness', unit:'%',
    description:'2026 年 3 月 Composer 2 官方发布文章中的 CursorBench-3 正确性成绩节选；仅比较该表公开的模型，不代表当时的完整公开排行。',
    configuration:'原版 CursorBench-3；初始任务关注编辑、重构和修复缺陷。3.1 改变问题分布，3.2 增加指令遵循与工具使用，4.0 增加长程任务，各版本分别排名。发布表未披露推理档位、agent/harness 版本、样本数和逐任务成本，缺失保留未知。',
    scope:`历史发布节选：${scores.length} 个模型，仅覆盖 Composer 2 发布文章表格，非完整榜单；未公开费用、输出 tokens 与步数。`,
    sourceUrl:pageUrl, sourceUpdatedAt:date(articleDate, 'historical CursorBench release date'), checkedAt:release.checkedAt
  }], scores};
}

/** @param {Get} get */
async function collect(get) {
  const [deep, cursor] = await Promise.all([collectDeepSWE(get), collectCursorBench(get)]);
  return {benchmarks:[...deep.benchmarks, ...cursor.benchmarks], scores:[...deep.scores, ...cursor.scores]};
}

module.exports = {collect};
