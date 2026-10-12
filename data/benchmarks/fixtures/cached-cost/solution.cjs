// 返回美元总价；输入/输出单价均为每百万 tokens。修复此实现。
module.exports = function cost({input, cached, output, inputPrice, cachePrice, outputPrice}) {
  return (input * inputPrice + cached * cachePrice + output * outputPrice) / 1e6;
};
