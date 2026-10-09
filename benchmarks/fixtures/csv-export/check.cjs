const assert = require('node:assert/strict');
const loadSolution = require('../../../scripts/benchmarks/load-solution.cjs');
(async () => {
  const client = await loadSolution(process.argv[2]);
  try {
    const csv = rows => client.call('default', [rows]);
    assert.equal(await csv([['a','b'],['c','d']]), 'a,b\r\nc,d');
    assert.equal(await csv([['a,b','a"b']]), '"a,b","a""b"');
    assert.equal(await csv([[null,undefined,0]]), ',,0');
    assert.equal(await csv([['a\nb']]), '"a\nb"');
    assert.equal(await csv([['=1+1','+1','-1','@a','\t=1','\r=1']]), "'=1+1,'+1,'-1,'@a,'\t=1,\"'\r=1\"");
    await assert.rejects(() => csv(['a']), {code:'SOLUTION_THROW'});
  } finally { client.close(); }
  console.log('BENCHMARK_COMPLETE:'+process.argv[3]);
})().catch(error => { console.error(error); process.exitCode = 1; });
