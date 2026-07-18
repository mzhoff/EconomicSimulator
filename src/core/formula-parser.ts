import type { BinaryOperator, FormulaNode, FormulaSpec, MetricDef } from './model';

export const METRIC_ALIAS_PATTERN = /^[a-z][a-z0-9_]*$/;

export class FormulaParseError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} Позиция ${position + 1}.`);
    this.name = 'FormulaParseError';
    this.position = position;
  }
}

type Token =
  | { type: 'number'; value: number; position: number }
  | { type: 'identifier'; value: string; position: number }
  | { type: 'operator'; value: '+' | '-' | '*' | '/'; position: number }
  | { type: 'leftParen' | 'rightParen' | 'end'; position: number };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if ('+-*/'.includes(character)) {
      tokens.push({ type: 'operator', value: character as '+' | '-' | '*' | '/', position });
      position += 1;
      continue;
    }
    if (character === '(' || character === ')') {
      tokens.push({ type: character === '(' ? 'leftParen' : 'rightParen', position });
      position += 1;
      continue;
    }
    const numberMatch = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (numberMatch) {
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) throw new FormulaParseError('Число вне допустимого диапазона.', position);
      tokens.push({ type: 'number', value, position });
      position += numberMatch[0].length;
      continue;
    }
    const identifierMatch = source.slice(position).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifierMatch) {
      tokens.push({ type: 'identifier', value: identifierMatch[0], position });
      position += identifierMatch[0].length;
      continue;
    }
    throw new FormulaParseError(`Недопустимый символ «${character}». Используйте +, −, ×, ÷ и круглые скобки.`, position);
  }
  tokens.push({ type: 'end', position: source.length });
  return tokens;
}

export function validateMetricAlias(alias: string): string | null {
  if (!alias) return 'Alias обязателен.';
  if (!METRIC_ALIAS_PATTERN.test(alias)) {
    return 'Alias должен начинаться с латинской буквы и содержать только строчные буквы, цифры и _.';
  }
  return null;
}

export function findDuplicateAliases(metrics: Record<string, MetricDef>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const metric of Object.values(metrics)) {
    if (seen.has(metric.alias)) duplicates.add(metric.alias);
    seen.add(metric.alias);
  }
  return [...duplicates].sort();
}

export function assertUniqueMetricAlias(
  alias: string,
  metrics: Record<string, MetricDef>,
  exceptMetricId?: string,
): void {
  const validationError = validateMetricAlias(alias);
  if (validationError) throw new Error(validationError);
  const duplicate = Object.values(metrics).find(
    (metric) => metric.alias === alias && metric.id !== exceptMetricId,
  );
  if (duplicate) {
    throw new Error(`Alias «${alias}» уже используется метрикой «${duplicate.name}».`);
  }
}

function aliasIndex(metrics: Record<string, MetricDef>): Map<string, MetricDef> {
  const duplicates = findDuplicateAliases(metrics);
  if (duplicates.length > 0) {
    throw new Error(`Aliases должны быть уникальны. Повторяются: ${duplicates.join(', ')}.`);
  }
  const index = new Map<string, MetricDef>();
  for (const metric of Object.values(metrics)) index.set(metric.alias, metric);
  return index;
}

class Parser {
  private cursor = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly metricsByAlias: Map<string, MetricDef>,
  ) {}

  parse(): FormulaNode {
    const node = this.parseAddition();
    const trailing = this.peek();
    if (trailing.type !== 'end') {
      throw new FormulaParseError(
        trailing.type === 'rightParen' ? 'Лишняя закрывающая скобка.' : 'Ожидался арифметический оператор.',
        trailing.position,
      );
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.cursor];
  }

  private take(): Token {
    const token = this.peek();
    this.cursor += 1;
    return token;
  }

  private parseAddition(): FormulaNode {
    let node = this.parseMultiplication();
    while (this.peek().type === 'operator' && (this.peek() as Extract<Token, { type: 'operator' }>).value.match(/[+-]/)) {
      const operator = this.take() as Extract<Token, { type: 'operator' }>;
      node = {
        type: 'binary',
        operator: operator.value === '+' ? 'add' : 'subtract',
        left: node,
        right: this.parseMultiplication(),
      };
    }
    return node;
  }

  private parseMultiplication(): FormulaNode {
    let node = this.parseUnary();
    while (this.peek().type === 'operator' && (this.peek() as Extract<Token, { type: 'operator' }>).value.match(/[*/]/)) {
      const operator = this.take() as Extract<Token, { type: 'operator' }>;
      node = {
        type: 'binary',
        operator: operator.value === '*' ? 'multiply' : 'divide',
        left: node,
        right: this.parseUnary(),
      };
    }
    return node;
  }

  private parseUnary(): FormulaNode {
    const token = this.peek();
    if (token.type === 'operator' && token.value === '-') {
      this.take();
      return { type: 'unary', operator: 'negate', operand: this.parseUnary() };
    }
    if (token.type === 'operator' && token.value === '+') {
      this.take();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const token = this.take();
    if (token.type === 'number') return { type: 'literal', value: token.value };
    if (token.type === 'identifier') {
      const metric = this.metricsByAlias.get(token.value);
      if (!metric) {
        throw new FormulaParseError(
          `Неизвестный alias «${token.value}». Выберите метрику из подсказок редактора.`,
          token.position,
        );
      }
      return { type: 'metric', metricId: metric.id };
    }
    if (token.type === 'leftParen') {
      const node = this.parseAddition();
      const closing = this.take();
      if (closing.type !== 'rightParen') {
        throw new FormulaParseError('Не хватает закрывающей скобки.', closing.position);
      }
      return node;
    }
    if (token.type === 'end') throw new FormulaParseError('Формула не закончена.', token.position);
    throw new FormulaParseError('Ожидалось число, alias метрики или открывающая скобка.', token.position);
  }
}

export function parseFormulaAst(source: string, metrics: Record<string, MetricDef>): FormulaNode {
  if (!source.trim()) throw new FormulaParseError('Формула не может быть пустой.', 0);
  return new Parser(tokenize(source), aliasIndex(metrics)).parse();
}

export function parseFormula(source: string, metrics: Record<string, MetricDef>): FormulaSpec {
  return { source: source.trim(), ast: parseFormulaAst(source, metrics) };
}

const OPERATOR_SYMBOL: Record<BinaryOperator, string> = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
};

const OPERATOR_PRECEDENCE: Record<BinaryOperator, number> = {
  add: 1,
  subtract: 1,
  multiply: 2,
  divide: 2,
};

export function formatFormulaAst(
  node: FormulaNode,
  metrics: Record<string, MetricDef>,
  parentPrecedence = 0,
): string {
  if (node.type === 'literal') return String(node.value);
  if (node.type === 'metric') return metrics[node.metricId]?.alias ?? node.metricId;
  if (node.type === 'unary') {
    if (node.operator === 'negate') return `-${formatFormulaAst(node.operand, metrics, 3)}`;
    return `${node.operator}(${formatFormulaAst(node.operand, metrics)})`;
  }
  if (node.type === 'binary') {
    const precedence = OPERATOR_PRECEDENCE[node.operator];
    const left = formatFormulaAst(node.left, metrics, precedence);
    const right = formatFormulaAst(
      node.right,
      metrics,
      node.operator === 'subtract' || node.operator === 'divide' ? precedence + 1 : precedence,
    );
    const expression = `${left} ${OPERATOR_SYMBOL[node.operator]} ${right}`;
    return precedence < parentPrecedence ? `(${expression})` : expression;
  }
  if (node.type === 'function') {
    return `${node.name}(${node.args.map((arg) => formatFormulaAst(arg, metrics)).join(', ')})`;
  }
  if (node.type === 'comparison') {
    return `${formatFormulaAst(node.left, metrics)} ${node.operator} ${formatFormulaAst(node.right, metrics)}`;
  }
  return `if(${formatFormulaAst(node.condition, metrics)}, ${formatFormulaAst(node.whenTrue, metrics)}, ${formatFormulaAst(node.whenFalse, metrics)})`;
}
