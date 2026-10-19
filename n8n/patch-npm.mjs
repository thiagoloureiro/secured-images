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
  'nodemailer-10.1.7.tgz':
    'b9163453a4bf2643f0f7fe398daeb39c4492e548c55c56b2517aec616d2a64cb',
  'markdown-it-14.3.3.tgz':
    '7191a8dc99822f327f6772f19f9ae8992c7b51f557eb85b8a3f9d18e703e2f3f',
  'mdurl-2.1.0.tgz':
    '23fc27c3d70e776c3aa40ec019c2be21ef43ed33b73f8476ada8715c5aabd11d',
  'toml-5.0.1.tgz':
    'e9dd3f26a6f7c5fcfcf3fb13cca67f641da5c7fc144471c7ceec5accedbda323',
  'ip-address-10.7.4.tgz':
    'f9e1d0dd369c002f43770c6ee35942c8078e76d080a1e18e89113eef865f26ff',
};

const renames = [
  ['simple-git@3.36.0_supports-color@8.1.1', 'simple-git@4.0.1_supports-color@8.1.1'],
  ['@simple-git+argv-parser@1.1.1', '@simple-git+argv-parser@2.0.1'],
  ['@simple-git+args-pathspec@1.0.3', '@simple-git+args-pathspec@1.0.4'],
  ['handlebars@4.7.9', 'handlebars@4.7.10'],
  ['nodemailer@8.0.10', 'nodemailer@10.1.7'],
  ['markdown-it@13.0.2', 'markdown-it@14.3.3'],
  ['toml@3.0.0', 'toml@5.0.1'],
  ['ip-address@10.3.1', 'ip-address@10.7.4'],
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
    ['nodemailer', '10.1.7'],
    ['markdown-it', '14.3.3'],
    ['toml', '5.0.1'],
    ['ip-address', '10.7.4'],
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
replacePackage(path.join(root, 'nodemailer'), 'nodemailer-10.1.7.tgz');
const markdownItDir = replacePackage(path.join(pnpm, 'node_modules/markdown-it'), 'markdown-it-14.3.3.tgz');
replacePackage(path.join(pnpm, 'node_modules/toml'), 'toml-5.0.1.tgz');
replacePackage(path.join(pnpm, 'node_modules/ip-address'), 'ip-address-10.7.4.tgz');
const markdownItModules = path.dirname(markdownItDir);
function pointAt(name, relativeTarget) {
  const link = path.join(markdownItModules, name);
  fs.rmSync(link, { recursive: true, force: true });
  fs.symlinkSync(relativeTarget, link);
  const version = JSON.parse(fs.readFileSync(path.join(link, 'package.json'), 'utf8')).version;
  console.log('linked', name, version);
}
// 14.3.3 needs entities 4, uc.micro 2, and punycode.js. Those copies are already
// in the image. mdurl 2 is not, so it is unpacked beside markdown-it.
pointAt('entities', '../../entities@4.5.0/node_modules/entities');
pointAt('uc.micro', '../../uc.micro@2.1.0/node_modules/uc.micro');
pointAt('punycode.js', '../../punycode.js@2.3.1/node_modules/punycode.js');
const mdurlDir = path.join(markdownItModules, 'mdurl');
fs.rmSync(mdurlDir, { recursive: true, force: true });
fs.mkdirSync(mdurlDir);
execFileSync('tar', ['-xzf', path.join(patches, 'mdurl-2.1.0.tgz'), '-C', mdurlDir, '--strip-components=1']);

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

const n8nRequire = createRequire('/usr/local/lib/node_modules/n8n/package.json');
const nodemailer = n8nRequire('nodemailer');
const MailComposer = n8nRequire('nodemailer/lib/mail-composer');
const addressparser = n8nRequire('nodemailer/lib/addressparser');
const composer = importDefault(MailComposer).default;
const parseAddress = importDefault(addressparser).default;
if (typeof nodemailer.createTransport !== 'function' || typeof composer !== 'function' || typeof parseAddress !== 'function') {
  throw new Error('nodemailer exports are not callable');
}
const addresses = parseAddress('Alice <alice@example.com>', { flatten: true });
if (addresses[0]?.address !== 'alice@example.com') throw new Error('addressparser failed');
const built = await new composer({
  from: 'a@example.com',
  to: 'b@example.com',
  subject: 'hi',
  text: 'hello',
}).compile().build();
if (!built.includes('Subject: hi')) throw new Error('mail composer failed');
const sent = await nodemailer.createTransport({ jsonTransport: true }).sendMail({
  from: 'a@example.com',
  to: 'b@example.com',
  subject: 'hi',
  text: 'hello',
});
if (!sent.message.includes('"subject":"hi"')) throw new Error('json transport failed');

const MarkdownIt = require(path.join(pnpm, 'node_modules/markdown-it'));
const pluginDir = (prefix) => {
  const name = fs.readdirSync(pnpm).find((entry) => entry.startsWith(prefix));
  return path.join(pnpm, name, 'node_modules', prefix.slice(0, -1));
};
const linkAttributes = require(pluginDir('markdown-it-link-attributes@'));
const emoji = require(pluginDir('markdown-it-emoji@'));
const taskLists = require(pluginDir('markdown-it-task-lists@'));
const rendered = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
  .use(linkAttributes, { attrs: { target: '_blank' } })
  .use(emoji)
  .use(taskLists)
  .render('Hello **world** https://example.com\n\n- [ ] task');
if (!rendered.includes('<strong>world</strong>') || !rendered.includes('task-list-item')) {
  throw new Error('markdown-it render failed');
}

const snowflakeDir = fs.readdirSync(pnpm).find((name) => name.startsWith('snowflake-sdk@'));
const toml = createRequire(
  path.join(pnpm, snowflakeDir, 'node_modules/snowflake-sdk/package.json'),
)('toml');
const config = toml.parse('account = "xy12345"\n[connections.default]\nuser = "n8n"\nport = 443\n');
if (config.account !== 'xy12345' || config.connections.default.port !== 443) {
  throw new Error('toml parse failed');
}
let nested = '1';
for (let i = 0; i < 800; i += 1) nested = `[${nested}]`;
try {
  toml.parse(`a = ${nested}`);
  throw new Error('deep toml nesting was accepted');
} catch (error) {
  if (error instanceof RangeError || String(error.message).includes('deep toml nesting was accepted')) {
    throw error;
  }
}

const socksDir = fs.readdirSync(pnpm).find((name) => name.startsWith('socks@'));
const { Address4, Address6 } = createRequire(path.join(pnpm, socksDir, 'node_modules/socks/package.json'))(
  'ip-address',
);
if (new Address4('8.8.8.8').correctForm() !== '8.8.8.8') throw new Error('Address4 failed');
const fromBytes = Address6.fromByteArray([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
if (!fromBytes.canonicalForm().startsWith('2001:0db8:')) throw new Error('Address6.fromByteArray failed');
if (Address4.isValid('012.0.0.1')) throw new Error('leading-zero Address4 was accepted');
if (!new Address6('64:ff9b:1::1').isPrivate()) throw new Error('NAT64 local-use was not private');

console.log('npm patches ok');
