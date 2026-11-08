import ts from 'typescript';

/** Bind only unshadowed global timer names. Never rewrite local/imported bindings. */
export function lowerTimers(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const host = {
    getSourceFile: name => name === fileName ? file : undefined,
    getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: name => name === fileName,
    readFile: name => name === fileName ? source : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const program = ts.createProgram([fileName], { noLib: true, noResolve: true }, host);
  const checker = program.getTypeChecker();
  const names = new Map([['setTimeout', '__anseronuiSetTimeout'], ['clearTimeout', '__anseronuiClearTimeout']]);
  // Avoid collisions with user identifiers, including unused local declarations.
  for (const [name, value] of names) {
    let alias = value;
    while (new RegExp('\\b' + alias + '\\b').test(source)) alias += '_';
    names.set(name, alias);
  }
  const used = new Set();
  const transformed = ts.transform(file, [context => {
    const f = context.factory;
    const ref = name => { used.add(name); return f.createIdentifier(names.get(name)); };
    const visit = node => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === 'globalThis' && !checker.getSymbolAtLocation(node.expression)?.declarations?.length && names.has(node.name.text)) return ref(node.name.text);
      if (ts.isShorthandPropertyAssignment(node) && names.has(node.name.text) && !checker.getShorthandAssignmentValueSymbol(node)) {
        return f.createPropertyAssignment(node.name.text, ref(node.name.text));
      }
      if (ts.isIdentifier(node) && names.has(node.text) && !checker.getSymbolAtLocation(node)) {
        const parent = node.parent;
        const propertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertySignature(parent)) && parent.name === node);
        if (!propertyName) return ref(node.text);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return input => {
      const output = ts.visitEachChild(input, visit, context);
      if (!used.size) return output;
      const binding = f.createImportDeclaration(undefined, f.createImportClause(false, undefined,
        f.createNamedImports([...used].map(name => f.createImportSpecifier(false, f.createIdentifier(name), f.createIdentifier(names.get(name)))))),
        f.createStringLiteral('@anseronui/ui'));
      return f.updateSourceFile(output, [binding, ...output.statements]);
    };
  }]);
  const output = ts.createPrinter().printFile(transformed.transformed[0]);
  transformed.dispose();
  return output;
}
