const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const types = require('babel-types');
const generate = require('babel-generator').default;

// is there a good way to handle this with babel/ast utilities?
const get = require('lodash.get');

const getStyles = path => generate(path.node.quasi).code.replace(/^`|`$/g, '');

const parse = (code, opts = {}) => {
  const ast = babylon.parse(code, {
    sourceType: 'module',
    ...opts
  });

  let styledComponentsVarName = 'styled';
  let defaultExport;
  let type;
  const imports = [];
  let templateLiteral;
  const styledComponents = [];
  const inlineStyles = [];
  const globalStyles = [];
  let importsEmotion = false;

  const ImportsExports = {
    ImportDeclaration(path) {
      // get imports
      const specifiers = path.get('specifiers');

      const defaultSpecifier = path
        .get('specifiers')
        .find(s => s.isImportDefaultSpecifier());
      const defaultExport =
        defaultSpecifier &&
        defaultSpecifier.node &&
        defaultSpecifier.node.local.name;

      const namespaceSpecifier = path
        .get('specifiers')
        .find(s => s.isImportNamespaceSpecifier());
      const namespaceExport =
        namespaceSpecifier &&
        namespaceSpecifier.node &&
        namespaceSpecifier.node.local.name;

      const names = specifiers
        .filter(s => s.isImportSpecifier())
        .map(s => s.node.local.name);
      const source = path.get('source.value').node;

      imports.push({
        defaultExport,
        namespaceExport,
        names,
        source
      });

      // get styled-components imported variable name
      if (path.get('source.value').node === 'react-emotion') {
        importsEmotion = true;

        // try to figure out what the `styled` import is named (it might be aliased)
        const specifier = path
          .get('specifiers')
          .find(s => s.isImportDefaultSpecifier() || s.isImportSpecifier()); // not sure if this is correct...

        if (specifier) {
          styledComponentsVarName = specifier.node.local.name;
        }
      }
      if (path.get('source.value').node === 'emotion') {
        importsEmotion = true;
      }
    },
    ExportDefaultDeclaration(path) {
      defaultExport = path.node.declaration.name;
    }
  };

  const ComponentInfo = {
    TaggedTemplateExpression(path) {
      if (!importsEmotion) return;

      const obj = get(path, 'node.tag.object');
      const variableDeclarationName = get(path, 'parent.id.name');
      const callee = get(path, 'node.tag.callee.name');

      // is styled component in form styled.div``;
      if (obj && obj.name === styledComponentsVarName) {
        styledComponents.push({
          type: path.node.tag.property.name,
          styles: getStyles(path),
          name: variableDeclarationName
        });
      }

      // is styled component in form styled(Component)``;
      if (callee === styledComponentsVarName) {
        styledComponents.push({
          type:
            path.node.tag.arguments[0].value || path.node.tag.arguments[0].name,
          styles: getStyles(path),
          name: variableDeclarationName
        });
      }

      if (path.node.tag.name === 'css') {
        inlineStyles.push({
          styles: getStyles(path),
          name: variableDeclarationName
        });
      }

      if (path.node.tag.name === 'injectGlobal') {
        globalStyles.push({
          styles: getStyles(path),
          name: variableDeclarationName
        });
      }
    }
  };

  traverse(ast, ImportsExports);
  traverse(ast, ComponentInfo);

  return {
    styledComponents,
    inlineStyles,
    globalStyles,
    imports
  };
};

module.exports = parse;
