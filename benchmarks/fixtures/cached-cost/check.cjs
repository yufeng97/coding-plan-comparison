const assert = require('node:assert/strict');
const cost = require('../../../scripts/benchmarks/load-solution.cjs')(process.argv[2]);
const base = {input:1e6,cached:4e5,output:2e5,inputPrice:2,cachePrice:.5,outputPrice:8};
assert.equal(cost(base), 3);
assert.equal(cost({...base,cached:0}), 3.6);
assert.equal(cost({...base,cached:1e6}), 2.1);
assert.equal(cost({...base,input:0,cached:0,output:0}), 0);
assert.throws(()=>cost({...base,cached:2e6}));
assert.throws(()=>cost({...base,input:-1}));
for(const field of Object.keys(base)) {
  for(const value of [-1,Infinity,NaN,undefined,'1']) assert.throws(()=>cost({...base,[field]:value}));
}
assert.equal(cost({...base,inputPrice:0,cachePrice:0,outputPrice:0}),0);
console.log('BENCHMARK_COMPLETE:'+process.argv[3]);
