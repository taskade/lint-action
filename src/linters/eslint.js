const fs = require('fs');
const path = require('path');

const commandExists = require("../../vendor/command-exists");
const { run } = require("../utils/action");
const { initLintResult } = require("../utils/lint-result");
const { removeTrailingPeriod } = require("../utils/string");

/**
 * https://eslint.org
 */
class ESLint {
  static get name() {
    return "ESLint";
  }

  /**
   * Verifies that all required programs are installed. Throws an error if programs are missing
   * @param {string} dir - Directory to run the linting program in
   */
  static async verifySetup(dir) {
    // Verify that NPM is installed (required to execute ESLint)
    if (!(await commandExists("npm"))) {
      throw new Error("NPM is not installed");
    }

    // Verify that ESLint is installed
    try {
      run("npx --no-install eslint -v", { dir });
    } catch (err) {
      throw new Error(`${this.name} is not installed`);
    }
  }

  /**
   * Runs the linting program and returns the command output
   * @param {string} dir - Directory to run the linter in
   * @param {string[]} extensions - File extensions which should be linted
   * @param {string} args - Additional arguments to pass to the linter
   * @param {boolean} fix - Whether the linter should attempt to fix code style issues automatically
   * @returns {{status: number, stdout: string, stderr: string}} - Output of the lint command
   */
  static lint(dir, extensions, args = "", fix = false) {
    const extensionsArg = extensions.map(ext => `.${ext}`).join(",");
    const fixArg = fix ? "--fix" : "";

    let status = 0;
    let stdout = [];

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === '.eslintrc.json') {
        continue;
      }

      let output;

      const itemPath = path.join(dir, item);
      if (fs.lstatSync(itemPath).isDirectory()) {
        console.log('RUNNING: ',
          `npx --no-install eslint --ext ${extensionsArg} ${fixArg} --no-color --format json ${args} "."`,
        );
        output = run(
          `npx --no-install eslint --ext ${extensionsArg} ${fixArg} --no-color --format json ${args} "."`,
          {
            itemPath,
            ignoreErrors: true,
          },
        );
      } else {
        console.log('RUNNING: ',
          `npx --no-install eslint --ext ${extensionsArg} ${fixArg} --no-color --format json ${args} "${item}"`,
        );
        output = run(
          `npx --no-install eslint --ext ${extensionsArg} ${fixArg} --no-color --format json ${args} "${item}"`,
          {
            dir,
            ignoreErrors: true,
          },
        );
      }

      if (status === 0 && output.status !== 0) {
        status = output.status;
      }

      console.log('STDOUT: ', output.stdout);

      stdout = stdout.concat(JSON.parse(output.stdout));
    }

    return {
      status,
      stdout: JSON.stringify(stdout),
      stderr: null,
    }
  }

  /**
   * Parses the output of the lint command. Determines the success of the lint process and the
   * severity of the identified code style violations
   * @param {string} dir - Directory in which the linter has been run
   * @param {{status: number, stdout: string, stderr: string}} output - Output of the lint command
   * @returns {{isSuccess: boolean, warning: [], error: []}} - Parsed lint result
   */
  static parseOutput(dir, output) {
    const lintResult = initLintResult();
    lintResult.isSuccess = output.status === 0;

    console.log(output.stdout);

    const outputJson = JSON.parse(output.stdout);
    for (const violation of outputJson) {
      const { filePath, messages } = violation;
      const path = filePath.substring(dir.length + 1);
      for (const msg of messages) {
        const { line, message, ruleId, severity } = msg;
        const entry = {
          path,
          firstLine: line,
          lastLine: line,
          message: `${removeTrailingPeriod(message)} (${ruleId})`,
        };
        if (severity === 1) {
          lintResult.warning.push(entry);
        }
        if (severity === 2) {
          lintResult.error.push(entry);
        }
      }
    }

    return lintResult;
  }
}

module.exports = ESLint;
