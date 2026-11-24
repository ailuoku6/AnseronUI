import ts from "typescript";
import { hostTemplate, localComponentReturn, type OptimizationReport } from "./templates.js";
export type { OptimizationReport } from "./templates.js";
import { originalSource, printMapped, type MappedSource } from "./source-map.js";

export interface CompileDiagnostic { code: string; message: string; line: number; column: number }
export interface CompileResult { source: string; diagnostics: CompileDiagnostic[]; mapped: MappedSource; optimizations: OptimizationReport[] }

/** P0 TSX lowering. It preserves TS type syntax for the subsequent static compiler. */
export function lowerTSX(source: string, fileName = "page.tsx", options: { devtools?: boolean; program?: ts.Program; optimize?: boolean } = {}): CompileResult {
  const file = options.program?.getSourceFile(fileName) ?? options.program?.getSourceFile(ts.sys.resolvePath(fileName)) ?? ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const optimizations: OptimizationReport[] = [];
  const checker = options.program?.getTypeChecker();
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
    const plans: ts.VariableStatement[] = [];
    const visit: ts.Visitor = node => {
      if (options.devtools && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "definePage" && node.arguments.length === 2) {
        const component = node.arguments[1];
        const name = ts.isIdentifier(component) || ts.isPropertyAccessExpression(component) ? component.getText(file) : "PageComponent";
        return factory.updateCallExpression(node, node.expression, node.typeArguments, [
          ...node.arguments.map(argument => ts.visitNode(argument, visit) as ts.Expression),
          factory.createStringLiteral(name),
        ]);
      }
      if (checker && options.program && options.optimize !== false && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
        if (localComponentReturn(file, node, checker, options.program)) {
          const plan = hostTemplate(file, node, checker, factory, expression => ts.visitNode(expression, visit) as ts.Expression, plans.length);
          if (plan) { plans.push(plan.declaration); optimizations.push(plan.report); usedJSX = true; return ts.setSourceMapRange(plan.expression, node); }
          optimizations.push({ siteId: file.fileName + ':' + node.pos, mode: 'fallback', reason: 'dynamic-structure-or-unknown-value', nodes: 0, slots: 0 });
        }
      }
      if (ts.isJsxElement(node)) return ts.setSourceMapRange(makeElement(node.openingElement.tagName, node.openingElement.attributes, node.children, node.openingElement.typeArguments), node);
      if (ts.isJsxSelfClosingElement(node)) return ts.setSourceMapRange(makeElement(node.tagName, node.attributes, [], node.typeArguments), node);
      if (ts.isJsxFragment(node)) return ts.setSourceMapRange(makeElement(undefined, undefined, node.children), node);
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
          ...(plans.length ? [factory.createImportSpecifier(false, factory.createIdentifier("template"), factory.createIdentifier("__anseronuiTemplate")), factory.createImportSpecifier(true, factory.createIdentifier("HostTemplate"), factory.createIdentifier("__anseronuiHostTemplate"))] : []),
        ])), factory.createStringLiteral("@anseronui/ui/jsx-runtime"));
      return factory.updateSourceFile(transformed, [importDeclaration, ...plans, ...transformed.statements]);
    };
  };
  const result = ts.transform(file, [transformer]);
  const mapped = printMapped(result.transformed[0], originalSource(source, fileName));
  const output = mapped.source;
  result.dispose();
  for (const diagnostic of (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []) {
    const location = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    diagnostics.push({ code: "TSX_PARSE", message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), line: location.line + 1, column: location.character + 1 });
  }
  return { source: output, diagnostics, mapped, optimizations };
}

/** Build one symbol context for staging. Aliases resolve to the actual UI
 * declarations; single-file callers without this context stay conservative. */
export function createCompileProgram(files: string[], options: ts.CompilerOptions = {}): ts.Program {
  return ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.Preserve, skipLibCheck: true, ...options });
}
