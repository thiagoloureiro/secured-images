import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

const root = '/usr/local/lib/node_modules/n8n/node_modules';
const patches = '/tmp/npm-patches';
const pnpm = path.join(root, '.pnpm');

const tarballs = {
  'simple-git-4.0.1.tgz':
    '9eede907d5a45a7aedd71b0e487c249dab1da99f082718bf3206f02b900cbb49',
  'simple-git-argv-parser-2.0.1.tgz':
    '58e9857626929fcf5e49f137bc035269346657aedcd97bbe74c35f93bcbbb8ed',
  'simple-git-args-pathspec-1.0.4.tgz':
    '110eb1365a8135dc098b872a7ad1752220d6ae4661eeae974279310700d895f2',
  'handlebars-4.7.10.tgz':
    '14f356e6cadb5b064a156d2b39dd843abba8f4b1a38ee036935adecc1a13ad9f',
};

const renames = [
  ['simple-git@3.36.0_supports-color@8.1.1', 'simple-git@4.0.1_supports-color@8.1.1'],
  ['@simple-git+argv-parser@1.1.1', '@simple-git+argv-parser@2.0.1'],
  ['@simple-git+args-pathspec@1.0.3', '@simple-git+args-pathspec@1.0.4'],
  ['handlebars@4.7.9', 'handlebars@4.7.10'],
];

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function replacePackage(linkPath, tarball) {
  const target = fs.realpathSync(linkPath);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  execFileSync('tar', ['-xzf', path.join(patches, tarball), '-C', target, '--strip-components=1']);
  const version = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).version;
  console.log('replaced', path.basename(target), version);
  return target;
}

function replaceOnce(file, from, to) {
  const text = fs.readFileSync(file, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${file}: expected 1 match, found ${count}`);
  }
  fs.writeFileSync(file, text.replace(from, to));
}

function rewriteSymlinks(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const current = fs.readlinkSync(full);
      let next = current;
      for (const [from, to] of renames) next = next.replaceAll(from, to);
      if (next !== current) {
        fs.unlinkSync(full);
        fs.symlinkSync(next, full);
      }
    } else if (entry.isDirectory()) {
      rewriteSymlinks(full);
    }
  }
}

function assertVersions() {
  const expected = new Map([
    ['simple-git', '4.0.1'],
    ['@simple-git/argv-parser', '2.0.1'],
    ['@simple-git/args-pathspec', '1.0.4'],
    ['handlebars', '4.7.10'],
  ]);
  const seen = new Map();
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'package.json') {
        const pkg = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (!expected.has(pkg.name)) continue;
        const want = expected.get(pkg.name);
        if (pkg.version !== want) {
          throw new Error(`${full} is ${pkg.name}@${pkg.version}, expected ${want}`);
        }
        seen.set(pkg.name, (seen.get(pkg.name) ?? 0) + 1);
      }
    }
  }
  walk(root);
  for (const name of expected.keys()) {
    if (!seen.has(name)) throw new Error(`no installed copy of ${name}`);
    console.log('verified', name, expected.get(name), 'copies', seen.get(name));
  }
}

for (const [file, sum] of Object.entries(tarballs)) {
  const got = sha256(path.join(patches, file));
  if (got !== sum) throw new Error(`${file} checksum ${got} != ${sum}`);
}

const simpleGitDir = replacePackage(path.join(root, 'simple-git'), 'simple-git-4.0.1.tgz');
replacePackage(
  path.join(pnpm, 'node_modules/@simple-git/argv-parser'),
  'simple-git-argv-parser-2.0.1.tgz',
);
replacePackage(
  path.join(pnpm, 'node_modules/@simple-git/args-pathspec'),
  'simple-git-args-pathspec-1.0.4.tgz',
);
const handlebarsDir = replacePackage(path.join(root, 'handlebars'), 'handlebars-4.7.10.tgz');

fs.appendFileSync(
  path.join(simpleGitDir, 'dist/index.cjs'),
  '\nexports.default = exports.simpleGit;\nObject.defineProperty(exports, "__esModule", { value: true });\n',
);

const protoAccess = fs.readFileSync(
  path.join(handlebarsDir, 'lib/handlebars/internal/proto-access.js'),
  'utf8',
);
if (!protoAccess.includes('function isPrototypeConstructor')) {
  throw new Error('handlebars 4.7.10 is missing the prototype constructor guard');
}

const nodesBase = fs.readdirSync(pnpm).find((name) => name.startsWith('n8n-nodes-base@'));
const gitNode = path.join(
  pnpm,
  nodesBase,
  'node_modules/n8n-nodes-base/dist/nodes/Git/Git.node.js',
);
replaceOnce(
  gitNode,
  `                    config: gitConfig,
                    ...(Object.keys(unsafe).length > 0 && { unsafe }),`,
  `                    config: gitConfig,
                    allowEnvironment: ['GIT_TERMINAL_PROMPT', 'GIT_ALLOW_PROTOCOL'],
                    ...(Object.keys(unsafe).length > 0 && { unsafe }),`,
);

const sourceControl = '/usr/local/lib/node_modules/n8n/dist/modules/source-control.ee/source-control-git.service.ee.js';
replaceOnce(
  sourceControl,
  `                config,
                unsafe: { allowUnsafeCredentialHelper: true },`,
  `                config,
                allowEnvironment: ['GIT_TERMINAL_PROMPT'],
                unsafe: { allowUnsafeCredentialHelper: true },`,
);
replaceOnce(
  sourceControl,
  `                ...this.gitOptions,
                unsafe: { allowUnsafeSshCommand: true },`,
  `                ...this.gitOptions,
                allowEnvironment: ['GIT_SSH_COMMAND', 'GIT_TERMINAL_PROMPT'],
                unsafe: { allowUnsafeSshCommand: true },`,
);

const promotions = '/usr/local/lib/node_modules/n8n/dist/modules/promotions.ee/promotions-git.service.js';
replaceOnce(
  promotions,
  `                    config,
                    unsafe: { allowUnsafeCredentialHelper: true },`,
  `                    config,
                    allowEnvironment: ['GIT_TERMINAL_PROMPT'],
                    unsafe: { allowUnsafeCredentialHelper: true },`,
);
replaceOnce(
  promotions,
  `                    ...options,
                    unsafe: { allowUnsafeSshCommand: true },`,
  `                    ...options,
                    allowEnvironment: ['GIT_SSH_COMMAND', 'GIT_TERMINAL_PROMPT'],
                    unsafe: { allowUnsafeSshCommand: true },`,
);

rewriteSymlinks(root);
for (const [from, to] of renames) {
  const source = path.join(pnpm, from);
  const dest = path.join(pnpm, to);
  if (!fs.existsSync(source)) throw new Error(`missing pnpm directory ${from}`);
  // Overlay filesystems reject rename across layers, so copy then remove.
  execFileSync('cp', ['-a', source, dest]);
  fs.rmSync(source, { recursive: true, force: true });
}

assertVersions();

const simpleGit = require(path.join(root, 'simple-git'));
function importDefault(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
if (typeof importDefault(simpleGit).default !== 'function' || typeof simpleGit.simpleGit !== 'function') {
  throw new Error('simple-git exports are not callable');
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-git-'));
const cleanEnv = Object.create(null);
cleanEnv.GIT_TERMINAL_PROMPT = '0';
cleanEnv.GIT_ALLOW_PROTOCOL = 'file:git:http:https:ssh';
await importDefault(simpleGit)
  .default({
    baseDir: repo,
    config: ['core.hooksPath=/dev/null'],
    unsafe: { allowUnsafeHooksPath: true },
    allowEnvironment: ['GIT_TERMINAL_PROMPT', 'GIT_ALLOW_PROTOCOL'],
  })
  .env(cleanEnv)
  .init();
try {
  await simpleGit.simpleGit({ baseDir: repo, config: ['trailer.audit.cmd=true'] }).status();
  throw new Error('trailer.cmd was not blocked');
} catch (error) {
  if (!String(error.message).includes('trailer.cmd')) throw error;
}
try {
  await simpleGit.simpleGit(repo).env('VISUAL', '/tmp/evileditor').status();
  throw new Error('VISUAL was not blocked');
} catch (error) {
  if (!String(error.message).includes('VISUAL')) throw error;
}

const handlebars = require(path.join(root, 'handlebars'));
if (handlebars.compile('Hello {{name}}')({ name: 'n8n' }) !== 'Hello n8n') {
  throw new Error('handlebars compile failed');
}

console.log('npm patches ok');
