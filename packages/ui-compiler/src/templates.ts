import ts from 'typescript';
export interface OptimizationReport { siteId: string; mode: 'template' | 'fallback'; reason?: string; nodes: number; slots: number }
export interface TemplateLowering { expression: ts.Expression; declaration: ts.VariableStatement; report: OptimizationReport }
function literal(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)) return ts.isNumericLiteral(node.operand);
  if (ts.isObjectLiteralExpression(node)) return node.properties.every(p => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && p.name.getText() !== '__proto__' && literal(p.initializer));
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(p => ts.isExpression(p) && literal(p));
  return false;
}
function origin(checker: ts.TypeChecker, node: ts.Node): string | null {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  if (!symbol?.declarations?.some(d => /packages\/ui\/src\/index\.ts$/.test(d.getSourceFile().fileName.replaceAll('\\', '/')))) return null;
  return symbol.name;
}
function primitive(checker: ts.TypeChecker, node: ts.Expression): boolean {
  const check = (type: ts.Type): boolean => type.isUnion() ? type.types.every(check) : Boolean(type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined));
  return check(checker.getTypeAtLocation(node));
}
/** Limit allocation elimination to local components whose only references in
 * the Program are JSX tags and definePage registration. Unknown/escaped values
 * keep normal JSX objects. Type annotations alone never prove getter purity. */
export function localComponentReturn(file: ts.SourceFile, node: ts.Node, checker: ts.TypeChecker, program: ts.Program): boolean {
  let parent = node.parent;
  if (ts.isReturnStatement(parent)) parent = parent.parent;
  if (ts.isBlock(parent)) parent = parent.parent;
  if (!ts.isFunctionDeclaration(parent) && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) return false;
  const declaration = parent;
  let name: ts.Identifier | undefined = ts.isFunctionDeclaration(declaration) && declaration.name ? declaration.name
    : ts.isVariableDeclaration(declaration.parent) && ts.isIdentifier(declaration.parent.name) ? declaration.parent.name : undefined;
  if (!name) return false;
  let statement: ts.Node = declaration;
  while (statement.parent && !ts.isSourceFile(statement.parent)) statement = statement.parent;
  if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword)) return false;
  const owner = checker.getSymbolAtLocation(name); if (!owner) return false;
  let safe = true;
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || source.fileName.includes('node_modules')) continue;
    const scan = (entry: ts.Node): void => {
      if (!safe) return;
      if (ts.isIdentifier(entry) && entry !== name && checker.getSymbolAtLocation(entry) === owner) {
        const p = entry.parent;
        const jsx = (ts.isJsxOpeningElement(p) || ts.isJsxClosingElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === entry;
        const page = ts.isCallExpression(p) && p.arguments[1] === entry && origin(checker, p.expression) === 'definePage';
        if (!jsx && !page) { safe = false; return; }
      }
      ts.forEachChild(entry, scan);
    }; scan(source);
  }
  return safe;
}
export function hostTemplate(file: ts.SourceFile, root: ts.JsxElement | ts.JsxSelfClosingElement, checker: ts.TypeChecker, factory: ts.NodeFactory, lower: (expression: ts.Expression) => ts.Expression, index: number): TemplateLowering | null {
  const inputs: ts.Expression[] = [], fields: ts.Expression[] = [], nodes: ts.Expression[] = [];
  let supported = true;
  const object = (entries: [string, ts.Expression][]): ts.ObjectLiteralExpression => factory.createObjectLiteralExpression(entries.map(([key, value]) => factory.createPropertyAssignment(key, value)), false);
  const number = (value: number): ts.Expression => factory.createNumericLiteral(value);
  const slot = (node: number, field: string, expression: ts.Expression): void => {
    fields.push(object([['node', number(node)], ['field', factory.createStringLiteral(field)], ['input', number(inputs.length)]])); inputs.push(lower(expression));
  };
  const build = (element: ts.JsxElement | ts.JsxSelfClosingElement): number => {
    const opening = ts.isJsxElement(element) ? element.openingElement : element;
    const tag = origin(checker, opening.tagName);
    if (!tag || !['View', 'Text', 'TextInput', 'RichText', 'ScrollView'].includes(tag)) { supported = false; return 0; }
    const id = nodes.length; nodes.push(factory.createNull());
    const props: ts.ObjectLiteralElementLike[] = []; let key: ts.Expression = factory.createNull();
    for (const attr of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) { supported = false; continue; }
      const name = attr.name.text;
      const value = !attr.initializer ? factory.createTrue() : ts.isStringLiteral(attr.initializer) ? factory.createStringLiteral(attr.initializer.text)
        : ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : undefined;
      if (!value || name === 'children') { supported = false; continue; }
      if (name === 'key') { if (!literal(value)) supported = false; else key = value; }
      else if (literal(value)) props.push(factory.createPropertyAssignment(name, value));
      else slot(id, name, value);
    }
    const children: ts.Expression[] = [];
    const content: ts.Expression[] = [];
    const sourceChildren = ts.isJsxElement(element) ? element.children : [];
    // An opaque child or custom component is a structural input. Its JSX and
    // closures are evaluated normally; only this host's output list reconciles.
    const structural = tag !== 'Text' && sourceChildren.some(child =>
      ts.isJsxExpression(child) && Boolean(child.expression) ||
      (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && !['View', 'Text', 'TextInput', 'RichText', 'ScrollView'].includes(origin(checker, (ts.isJsxElement(child) ? child.openingElement : child).tagName) ?? '') || ts.isJsxFragment(child));
    if (structural) {
      for (const child of sourceChildren) {
        if (ts.isJsxText(child)) { const text = child.getText(file).replace(/\s*\n\s*/g, ' '); if (text.trim()) content.push(factory.createStringLiteral(text)); }
        else if (ts.isJsxExpression(child)) { if (child.expression) content.push(child.expression); }
        else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) content.push(child);
      }
      slot(id, 'children', factory.createArrayLiteralExpression(content));
    } else for (const child of sourceChildren) {
      if (ts.isJsxText(child)) { const text = child.getText(file).replace(/\s*\n\s*/g, ' '); if (text.trim()) content.push(factory.createStringLiteral(text)); }
      else if (ts.isJsxExpression(child)) { if (child.expression) { if (!primitive(checker, child.expression)) supported = false; content.push(child.expression); } }
      else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) children.push(number(build(child)));
      else supported = false;
    }
    let staticText: ts.Expression | undefined;
    if (!structural && content.length) {
      if (tag !== 'Text' || children.length) supported = false;
      else if (content.every(value => ts.isStringLiteral(value))) staticText = factory.createStringLiteral(content.map(value => (value as ts.StringLiteral).text).join(''));
      else slot(id, 'children', content.length === 1 ? content[0] : factory.createArrayLiteralExpression(content));
    }
    nodes[id] = object([['tag', factory.createStringLiteral(tag)], ['key', key], ['props', factory.createObjectLiteralExpression(props)], ['children', factory.createArrayLiteralExpression(children)], ...(staticText ? [['text', staticText] as [string, ts.Expression]] : [])]);
    return id;
  };
  build(root); if (!supported) return null;
  const siteId = file.fileName + ':' + root.pos;
  const name = factory.createIdentifier('__anseronuiPlan' + index);
  const declaration = factory.createVariableStatement(undefined, factory.createVariableDeclarationList([
    factory.createVariableDeclaration(name, undefined, factory.createTypeReferenceNode('__anseronuiHostTemplate'), object([['siteId', factory.createStringLiteral(siteId)], ['nodes', factory.createArrayLiteralExpression(nodes)], ['fields', factory.createArrayLiteralExpression(fields)]])),
  ], ts.NodeFlags.Const));
  const expression = factory.createCallExpression(factory.createIdentifier('__anseronuiTemplate'), undefined, [name, factory.createArrayLiteralExpression(inputs)]);
  return { expression, declaration, report: { siteId, mode: 'template', nodes: nodes.length, slots: inputs.length } };
}
