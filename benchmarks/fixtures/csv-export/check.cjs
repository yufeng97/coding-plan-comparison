const assert = require('node:assert/strict');
const csv = require('../../../scripts/benchmarks/load-solution.cjs')(process.argv[2]);
assert.equal(csv([['a','b'],['c','d']]), 'a,b\r\nc,d');
assert.equal(csv([['a,b','a"b']]), '"a,b","a""b"');
assert.equal(csv([[null,undefined,0]]), ',,0');
assert.equal(csv([['a\nb']]), '"a\nb"');
assert.equal(csv([['=1+1','+1','-1','@a','\t=1','\r=1']]), "'=1+1,'+1,'-1,'@a,'\t=1,\"'\r=1\"");
assert.throws(()=>csv(['a']));
console.log('BENCHMARK_COMPLETE:'+process.argv[3]);
