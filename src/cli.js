import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import chalk from 'chalk';
import JSON5 from 'json5';
import { getSourcePaths } from './utils';
import extractUnusedExports from './extractUnusedExports';
import fixExports from './fixExports';
import printReport from './generateReport';
import createContext from './createContext';
import getExports from './getExports';
import getImports from './getImports';

const warn = chalk.yellow;
const info = chalk.green;

export function execute(args) {
  const userConfig = getConfig(args.config);

  const ctx = createContext(userConfig);
  const { config } = ctx;

  printBox(`Current Configuration`);
  console.log(JSON.stringify(ctx.config, null, 2));

  const timeStart = Date.now();

  const sourceFiles = getSourcePaths(config.sourcePaths, config);
  const testFiles = getSourcePaths(config.testPaths, config);
  const exportedNames = getExports(sourceFiles, ctx);
  const importedNames = getImports(sourceFiles, ctx);
  const importedNamesTest = getImports(testFiles, ctx);
  const unusedExports = extractUnusedExports(
    exportedNames,
    importedNames,
    importedNamesTest
  );

  warnForUnknownPackages(ctx.unknownPackages);
  warnForFailedResolutions(ctx.failedResolutions);

  if (args.fix) {
    fixExports(unusedExports, config);
  } else {
    printBox(`Report`);
    printReport(unusedExports);
  }

  const { outDir } = args;

  if (outDir) {
    printBox('Save Results');

    const dirPath = path.resolve(outDir);

    if (path.existsSync(dirPath)) {
      writeToFile(exportedNames, dirPath, 'exports.json');
      writeToFile(importedNames, dirPath, 'imports.json');
      writeToFile(unusedExports, dirPath, 'unused.json');
    } else {
      printWarning(`WARNING: output dir deas not exist - ${dirPath}`);
    }
  }

  const timeEnd = Date.now();
  const timeTook = timeEnd - timeStart;

  const summary = {
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    unusedExports,
    timeTook
  };

  printSummary(summary);
}

function getConfig(conifgPath) {
  if (!_.isString(conifgPath)) {
    return _.isPlainObject(conifgPath) ? conifgPath : {};
  }

  const absolutPath = path.resolve(conifgPath);

  if (!fs.existsSync(conifgPath)) {
    printWarning('Unable to find config file: ' + absolutPath);
    return null;
  }

  return JSON5.parse(fs.readFileSync(absolutPath, 'utf8'));
}

function print(message) {
  console.log(info(message));
}

function printSummary(summary) {
  const { timeTook, sourceFileCount, testFileCount, unusedExports } = summary;

  const unusedExportCount = _.sumBy(
    unusedExports,
    exp => exp.unusedExports.length
  );

  const fileCount = unusedExports.length;

  printBox(`Unused Exports Summary`);
  print(`   Unused export count: ${unusedExportCount}  `);
  print(`   Affected file count: ${fileCount}          `);
  print(`    Total source files: ${sourceFileCount}    `);
  print(`      Total test files: ${testFileCount}      `);
  print(`          Completed in: ${timeTook} ms        `);
}

function printBox(value) {
  const width = 60;
  const empty = '';

  print(`┌${_.pad(empty, width, '─')}┐`);
  print(`|${_.pad(value, width, ' ')}|`);
  print(`└${_.pad(empty, width, '─')}┘`);
}

function printWarning(message) {
  console.log(warn(message));
}

function warnForUnknownPackages(unknownPackages) {
  const unresolvePackages = _.keys(unknownPackages);

  if (unresolvePackages.length === 0) {
    return;
  }

  const message =
    'Unknown packages found. Add package to ' +
    'package.json dependency list or specify an alias';

  printWarning(message);

  unresolvePackages.forEach(pkg => {
    printWarning(`  ${pkg}`);
  });
}

function warnForFailedResolutions(failedResolutions) {
  const importPath = _.sortBy(_.keys(failedResolutions));

  if (importPath.length === 0) {
    return;
  }

  const message = [
    'Unable to resolve following import paths. Please',
    'specify "alias" if needed or add pattern to',
    '"ignoreImportPatterns" in provided config file.'
  ].join(' ');

  printWarning(message);

  importPath.forEach(importPath => {
    printWarning(`  ${importPath}`);
  });
}

function writeToFile(contents, outDir, fileName) {
  const resultsPath = path.join(outDir, fileName);
  print(resultsPath);
  fs.writeFileSync(resultsPath, JSON.stringify(contents, null, 2));
}
