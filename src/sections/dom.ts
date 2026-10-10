/* 模板里读取表单控件的值：事件目标的类型在模板中无法收窄，集中在这里断言。 */
export function targetValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
