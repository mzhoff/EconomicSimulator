import type { FormulaNode, UnitSpec } from './model';

export const literal = (value: number, unit?: UnitSpec): FormulaNode => ({ type: 'literal', value, unit });
export const ref = (metricId: string): FormulaNode => ({ type: 'metric', metricId });
export const add = (left: FormulaNode, right: FormulaNode): FormulaNode => ({ type: 'binary', operator: 'add', left, right });
export const subtract = (left: FormulaNode, right: FormulaNode): FormulaNode => ({ type: 'binary', operator: 'subtract', left, right });
export const multiply = (left: FormulaNode, right: FormulaNode): FormulaNode => ({ type: 'binary', operator: 'multiply', left, right });
export const divide = (left: FormulaNode, right: FormulaNode): FormulaNode => ({ type: 'binary', operator: 'divide', left, right });
export const negate = (operand: FormulaNode): FormulaNode => ({ type: 'unary', operator: 'negate', operand });
export const abs = (operand: FormulaNode): FormulaNode => ({ type: 'unary', operator: 'abs', operand });
export const round = (operand: FormulaNode): FormulaNode => ({ type: 'unary', operator: 'round', operand });
export const min = (...args: FormulaNode[]): FormulaNode => ({ type: 'function', name: 'min', args });
export const max = (...args: FormulaNode[]): FormulaNode => ({ type: 'function', name: 'max', args });
export const compare = (
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq',
  left: FormulaNode,
  right: FormulaNode,
): FormulaNode => ({ type: 'comparison', operator, left, right });
export const conditional = (
  condition: FormulaNode,
  whenTrue: FormulaNode,
  whenFalse: FormulaNode,
): FormulaNode => ({ type: 'conditional', condition, whenTrue, whenFalse });

export function sum(nodes: FormulaNode[]): FormulaNode {
  if (nodes.length === 0) return literal(0);
  return nodes.slice(1).reduce((total, node) => add(total, node), nodes[0]);
}

export function extractDependencies(node: FormulaNode, dependencies = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'metric':
      dependencies.add(node.metricId);
      break;
    case 'binary':
    case 'comparison':
      extractDependencies(node.left, dependencies);
      extractDependencies(node.right, dependencies);
      break;
    case 'unary':
      extractDependencies(node.operand, dependencies);
      break;
    case 'function':
      node.args.forEach((arg) => extractDependencies(arg, dependencies));
      break;
    case 'conditional':
      extractDependencies(node.condition, dependencies);
      extractDependencies(node.whenTrue, dependencies);
      extractDependencies(node.whenFalse, dependencies);
      break;
    case 'literal':
      break;
  }
  return dependencies;
}
