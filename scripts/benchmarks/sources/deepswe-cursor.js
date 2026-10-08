// @ts-check
'use strict';

const ts = require('typescript');

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
/** @param {RecordValue} row @param {RecordValue} rates */
function adjustedCost(row, rates) {
  const raw = optionalNumber(row.mean_cost_usd, 'DeepSWE mean_cost_usd');
  const model = string(row.model, 'DeepSWE model').split('/').pop().replace(/[._]/g, '-').toLowerCase();
  const choice = rates[model];
  const rate = record(choice) && record(choice.from) ? choice : record(choice) ? choice['v1.1'] : null;
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
  const artifactUrl = 'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json';
  const [page, artifact] = await Promise.all([get(pageUrl), get(artifactUrl)]);
  const data = JSON.parse(artifact.text);
  if (!record(data) || !Array.isArray(data.rows) || data.rows.length === 0) throw new Error('Missing DeepSWE leaderboard rows');
  const scriptPath = page.text.match(/import\("(\/assets\/index-[^"\s]+\.js)"\)/)?.[1];
  if (!scriptPath) throw new Error('Missing DeepSWE official pricing module');
  const script = await get(officialScript(scriptPath, 'https://deepswe.datacurve.ai', '/assets/'));
  const rates = findLiteral(script.text, value => record(value) && record(value['gpt-5-6-sol']) && record(value['deepseek-v4-pro']) && record(value['gpt-5-6-sol'].from));
  if (!record(rates)) throw new Error('Missing DeepSWE price adjustment rates');
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
    const cost = adjustedCost(row, rates);
    const lo = optionalNumber(row.ci_lo, 'DeepSWE ci_lo');
    const hi = optionalNumber(row.ci_hi, 'DeepSWE ci_hi');
    if ((lo == null) !== (hi == null) || (lo != null && hi != null && (lo > hi || hi > 1))) throw new Error('Invalid DeepSWE confidence interval');
    return {
      id:'', benchmarkId:'deepswe-v1-1', model:string(row.model, 'DeepSWE model'),
      reasoning:optionalString(row.reasoning_effort, 'DeepSWE reasoning_effort'), agent:string(row.harness, 'DeepSWE harness'), score:fraction * 100,
      costUSD:cost.cost, costNote:cost.cost == null ? null : cost.adjusted ? '平均每个计分 rollout 成本；按官方页面价格修正表及同一行平均输入/缓存/输出 token 折算，原始 JSON 成本已另存审计。' : '官方 JSON 平均每个计分 rollout 成本；官网没有对此模型应用价格修正。',
      uncertainty:lo == null || hi == null ? null : `${(lo * 100).toFixed(2)}%–${(hi * 100).toFixed(2)}%；${optionalString(row.ci_method, 'DeepSWE ci_method') || '区间方法未公开'}`,
      tokens:optionalNumber(row.mean_output_tokens, 'DeepSWE mean_output_tokens'), steps:optionalNumber(row.mean_agent_steps, 'DeepSWE mean_agent_steps'),
      sourceUrl:pageUrl, checkedAt:artifact.checkedAt
    };
  });
  return {benchmarks:[{
    id:'deepswe-v1-1', family:'deepswe', name:'DeepSWE v1.1', version:'1.1', category:'coding', metric:'pass@1', unit:'%',
    description:'Datacurve 原创长程软件工程任务；计分 rollout 的通过率。provider/verifier/network 错误排除，上下文失败及 agent 超时计失败；不能与 pass@4 混用。',
    configuration:'mini-swe-agent；同一 bash 工具与共享 prompt。推理档位逐行保留。v1.1 在独立容器中验证已提交补丁。',
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
  return {benchmarks:[{
    id:`cursorbench-${version.replace(/\./g, '-')}`, family:'cursorbench', name:`CursorBench ${version}`, version, category:'coding', metric:'Solution correctness', unit:'%',
    description:'Cursor 发布的真实 Cursor 会话、多文件且可能含歧义的软件工程任务正确性评测；任务集随版本更换，同一版本内比较。',
    configuration:'官方内部评测；当前榜单未公开 harness 版本、system prompt、grader 配置及任务数，agent 保留未知。推理档位按官方原文保留。',
    scope:`${scores.length} 个模型/推理配置；tokens 为平均输出 token，steps 为平均 agent 步数；完整公开数组包含页面默认隐藏的模型。`,
    sourceUrl:pageUrl, sourceUpdatedAt:newest == null ? null : date(newest, 'CursorBench changelog date'), checkedAt:page.checkedAt
  }], scores};
}

/** @param {Get} get */
async function collect(get) {
  const [deep, cursor] = await Promise.all([collectDeepSWE(get), collectCursorBench(get)]);
  return {benchmarks:[...deep.benchmarks, ...cursor.benchmarks], scores:[...deep.scores, ...cursor.scores]};
}

module.exports = {collect};
