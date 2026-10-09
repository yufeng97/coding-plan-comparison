const assert = require('node:assert/strict');
const loadSolution = require('../../../scripts/benchmarks/load-solution.cjs');
(async () => {
  const client = await loadSolution(process.argv[2]);
  try {
    const encode = state => client.call('encode', [state]);
    const decode = query => client.call('decode', [query]);
    assert.deepEqual(await decode(''), {budget:'any',region:'all',search:''});
    assert.deepEqual(await decode('budget=100&region=intl'), {budget:'100',region:'intl',search:''});
    const state={budget:'50',region:'cn',search:'编程 & tokens'};
    assert.deepEqual(await decode(await encode(state)), state);
    assert.deepEqual(await decode('budget=999&region=bad'), {budget:'any',region:'all',search:''});
    assert.deepEqual(await decode('other=secret'), {budget:'any',region:'all',search:''});
  } finally { client.close(); }
  console.log('BENCHMARK_COMPLETE:'+process.argv[3]);
})().catch(error => { console.error(error); process.exitCode = 1; });
