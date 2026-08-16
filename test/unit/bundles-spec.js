const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const srcMarked = require('../../src/marked.js');
const srcRules = require('../../src/rules.js');
const cubicDef = require('../specs/redos/cubic_def.js');
const libMarked = require('../../lib/marked.js');
const minMarked = require('../../marked.min.js');

const esmBundle = path.resolve(__dirname, '..', '..', 'lib', 'marked.esm.js');
const reflinkRedos = fs.readFileSync(path.resolve(__dirname, '..', 'specs', 'redos', 'reflink_redos.md'), 'utf8');

// lib/marked.js (the "browser" entry point), lib/marked.esm.js and marked.min.js
// are generated from ./src, but they are committed to the repo and published
// as-is, so a rule fix that only landed in ./src would leave every browser, CDN
// and bundler consumer of the package on the vulnerable regexes.
const bundles = {
  'lib/marked.js': libMarked,
  'lib/marked.esm.js': null, // ESM, loaded in beforeAll
  'marked.min.js': minMarked
};

function millisTaken(fn) {
  const before = process.hrtime();
  fn();
  const elapsed = process.hrtime(before);
  return elapsed[0] * 1e3 + elapsed[1] * 1e-6;
}

describe('generated bundles', () => {
  beforeAll(async() => {
    // Node only parses a file as ESM when it ends in .mjs (this package is not
    // "type": "module"), so import the bundle through a temporary copy.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-esm-'));
    const file = path.join(dir, 'marked.esm.mjs');
    fs.copyFileSync(esmBundle, file);
    bundles['lib/marked.esm.js'] = (await import(pathToFileURL(file).href)).default;
  });

  Object.keys(bundles).forEach(name => {
    describe(name, () => {
      it('builds the same def and reflink rules as ./src', () => {
        const rules = bundles[name].Lexer.rules;
        expect(rules.block.def.source).toBe(srcRules.block.def.source);
        expect(rules.block._label.source).toBe(srcRules.block._label.source);
        expect(rules.inline.reflink.source).toBe(srcRules.inline.reflink.source);
        expect(rules.inline.nolink.source).toBe(srcRules.inline.nolink.source);
        expect(rules.inline.reflinkSearch.source).toBe(srcRules.inline.reflinkSearch.source);
      });

      it('does not backtrack cubically on a long def', () => {
        let html;
        const ms = millisTaken(() => {
          html = bundles[name](cubicDef.markdown);
        });
        expect(html).toBe(srcMarked(cubicDef.markdown));
        expect(ms).toBeLessThan(1000);
      });

      it('does not backtrack exponentially on a nested reflink', () => {
        let html;
        const ms = millisTaken(() => {
          html = bundles[name](reflinkRedos);
        });
        expect(html).toBe(srcMarked(reflinkRedos));
        expect(ms).toBeLessThan(1000);
      });
    });
  });
});
