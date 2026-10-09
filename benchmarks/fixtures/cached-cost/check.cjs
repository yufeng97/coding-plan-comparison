const assert = require('node:assert/strict');
const loadSolution = require('../../../scripts/benchmarks/load-solution.cjs');
(async () => {
  const client = await loadSolution(process.argv[2]);
  try {
    const cost = input => client.call('default', [input]);
    const base = {input:1e6,cached:4e5,output:2e5,inputPrice:2,cachePrice:.5,outputPrice:8};
    assert.equal(await cost(base), 3);
    assert.equal(await cost({...base,cached:0}), 3.6);
    assert.equal(await cost({...base,cached:1e6}), 2.1);
    assert.equal(await cost({...base,input:0,cached:0,output:0}), 0);
    await assert.rejects(() => cost({...base,cached:2e6}), {code:'SOLUTION_THROW'});
    await assert.rejects(() => cost({...base,input:-1}), {code:'SOLUTION_THROW'});
    for(const field of Object.keys(base)) {
      for(const value of [-1,Infinity,NaN,undefined,'1']) {
        await assert.rejects(() => cost({...base,[field]:value}), {code:'SOLUTION_THROW'});
      }
    }
    assert.equal(await cost({...base,inputPrice:0,cachePrice:0,outputPrice:0}), 0);
  } finally { client.close(); }
  console.log('BENCHMARK_COMPLETE:'+process.argv[3]);
})().catch(error => { console.error(error); process.exitCode = 1; });
