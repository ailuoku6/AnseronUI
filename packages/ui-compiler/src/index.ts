import ts from "typescript";

export interface CompileDiagnostic { code: string; message: string; line: number; column: number }
export interface CompileResult { source: string; diagnostics: CompileDiagnostic[] }

/** P0 TSX lowering. It preserves TS type syntax for the subsequent static compiler. */
export function lowerTSX(source: string, fileName = "page.tsx", options: { devtools?: boolean } = {}): CompileResult {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const diagnostics: CompileDiagnostic[] = [];
  let usedJSX = false;
  const report = (node: ts.Node, code: string, message: string): void => {
    const location = file.getLineAndCharacterOfPosition(node.getStart(file));
    diagnostics.push({ code, message, line: location.line + 1, column: location.character + 1 });
  };

  const inspectHooks = (node: ts.Node, inFunction = false, guarded = false): void => {
    const isFunction = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
    if (isFunction) {
      const name = node.name && ts.isIdentifier(node.name) ? node.name.text
        : ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : "";
      // A named component/custom Hook returned by a factory has its own Hook
      // order. Ordinary nested callbacks still cannot call Hooks.
      const ownScope = !inFunction || /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
      ts.forEachChild(node, child => inspectHooks(child, true, !ownScope));
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^use[A-Z]/.test(node.expression.text)) {
      if (!inFunction) report(node, "HOOK_OUTSIDE_COMPONENT", "Hooks require a component or custom Hook");
      else if (guarded) report(node, "HOOK_NOT_TOP_LEVEL", "Hooks must run in a fixed top-level order");
    }
    const isGuard = ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node) || ts.isTryStatement(node);
    ts.forEachChild(node, child => inspectHooks(child, inFunction, guarded || isGuard));
  };
  inspectHooks(file);

  const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
    const factory = context.factory;
    const visit: ts.Visitor = node => {
      if (options.devtools && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "definePage" && node.arguments.length === 2) {
        const component = node.arguments[1];
        const name = ts.isIdentifier(component) || ts.isPropertyAccessExpression(component) ? component.getText(file) : "PageComponent";
        return factory.updateCallExpression(node, node.expression, node.typeArguments, [...node.arguments, factory.createStringLiteral(name)]);
      }
      if (ts.isJsxElement(node)) return makeElement(node.openingElement.tagName, node.openingElement.attributes, node.children, node.openingElement.typeArguments);
      if (ts.isJsxSelfClosingElement(node)) return makeElement(node.tagName, node.attributes, [], node.typeArguments);
      if (ts.isJsxFragment(node)) return makeElement(undefined, undefined, node.children);
      return ts.visitEachChild(node, visit, context);
    };
    const tagExpression = (name: ts.JsxTagNameExpression | undefined): ts.Expression => {
      if (!name) return factory.createIdentifier("__anseronuiFragment");
      if (ts.isIdentifier(name)) {
        if (/^[a-z]/.test(name.text)) report(name, "DYNAMIC_TAG", "Use a statically named component");
        return factory.createIdentifier(name.text);
      }
      if (ts.isPropertyAccessExpression(name) && ts.isIdentifier(name.expression)) {
        return factory.createPropertyAccessExpression(factory.createIdentifier(name.expression.text), name.name.text);
      }
      report(name, "DYNAMIC_TAG", "Unsupported JSX tag shape");
      return factory.createIdentifier("__unsupportedTag");
    };
    const makeChildren = (children: readonly ts.JsxChild[]): ts.Expression | undefined => {
      const values: ts.Expression[] = [];
      for (const child of children) {
        if (ts.isJsxText(child)) {
          const value = child.getText(file).replace(/\s*\n\s*/g, " ");
          if (value.trim()) values.push(factory.createStringLiteral(value));
        } else if (ts.isJsxExpression(child)) {
          if (child.expression) values.push(ts.visitNode(child.expression, visit) as ts.Expression);
        } else values.push(ts.visitNode(child, visit) as ts.Expression);
      }
      if (values.length === 0) return undefined;
      return values.length === 1 ? values[0] : factory.createArrayLiteralExpression(values);
    };
    const makeElement = (name: ts.JsxTagNameExpression | undefined, attributes: ts.JsxAttributes | undefined, children: readonly ts.JsxChild[], typeArguments?: readonly ts.TypeNode[]): ts.Expression => {
      usedJSX = true;
      const fields: ts.ObjectLiteralElementLike[] = [];
      let key: ts.Expression | undefined;
      for (const attribute of attributes?.properties ?? []) {
        if (ts.isJsxSpreadAttribute(attribute)) {
          report(attribute, "DYNAMIC_SPREAD", "P0 requires explicit, statically named props");
          continue;
        }
        if (!ts.isIdentifier(attribute.name)) {
          report(attribute, "DYNAMIC_PROP", "Namespaced JSX props are unsupported");
          continue;
        }
        const name = attribute.name.text;
        let value: ts.Expression;
        if (!attribute.initializer) value = factory.createTrue();
        else if (ts.isStringLiteral(attribute.initializer)) value = factory.createStringLiteral(attribute.initializer.text);
        else if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) value = ts.visitNode(attribute.initializer.expression, visit) as ts.Expression;
        else if (!ts.isJsxExpression(attribute.initializer)) value = ts.visitNode(attribute.initializer, visit) as ts.Expression;
        else value = factory.createIdentifier("undefined");
        if (name === "key") key = value;
        else fields.push(factory.createPropertyAssignment(name, value));
      }
      const content = makeChildren(children);
      if (content) fields.push(factory.createPropertyAssignment("children", content));
      const tag = tagExpression(name);
      const component = typeArguments?.length ? factory.createExpressionWithTypeArguments(tag, [...typeArguments]) : tag;
      const argumentsList: ts.Expression[] = [component, factory.createObjectLiteralExpression(fields, true)];
      if (key || options.devtools) argumentsList.push(key ?? factory.createIdentifier("undefined"));
      if (options.devtools) argumentsList.push(factory.createStringLiteral(name?.getText(file) ?? "Fragment"));
      return factory.createCallExpression(factory.createIdentifier("__anseronuiJSX"), undefined, argumentsList);
    };
    return sourceFile => {
      const transformed = ts.visitEachChild(sourceFile, visit, context);
      if (!usedJSX) return transformed;
      const importDeclaration = factory.createImportDeclaration(undefined,
        factory.createImportClause(false, undefined, factory.createNamedImports([
          factory.createImportSpecifier(false, factory.createIdentifier("jsx"), factory.createIdentifier("__anseronuiJSX")),
          factory.createImportSpecifier(false, factory.createIdentifier("Fragment"), factory.createIdentifier("__anseronuiFragment")),
        ])), factory.createStringLiteral("@anseronui/ui/jsx-runtime"));
      return factory.updateSourceFile(transformed, [importDeclaration, ...transformed.statements]);
    };
  };
  const result = ts.transform(file, [transformer]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const output = printer.printFile(result.transformed[0]);
  result.dispose();
  for (const diagnostic of (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []) {
    const location = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    diagnostics.push({ code: "TSX_PARSE", message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), line: location.line + 1, column: location.character + 1 });
  }
  return { source: output, diagnostics };
}
