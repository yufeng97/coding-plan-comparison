/* 模板里读取表单控件的值：事件目标的类型在模板中无法收窄，集中在这里断言。 */
/** @param {Event} event @returns {string} */
export function targetValue(event) {
  return /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target).value;
}
