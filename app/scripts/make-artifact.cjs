// Turns the Vite build into an artifact page plus a map of every file it needs.
//
// The publish skeleton supplies doctype/html/head/body, so artifact.html carries only
// the page's own content. Everything else under dist/ — hashed js and css, the pdf
// worker, the body mesh — is listed in artifact-files.json with its media type, so the
// publish step never has to guess what changed.
//
//   node scripts/make-artifact.cjs --inline-body   # what `npm run build:artifact` runs: the
//                                                   # artifact host serves no .bin, so the mesh
//                                                   # travels base64-encoded inside body.json
//   node scripts/make-artifact.cjs                 # keep body.bin separate (any ordinary host)
const fs = require('fs');
const path = require('path');

const DIST = 'dist';
const TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (process.argv.includes('--inline-body')) {
  const manifestPath = path.join(DIST, 'body', 'body.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.data = fs.readFileSync(path.join(DIST, 'body', 'body.bin')).toString('base64');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.unlinkSync(path.join(DIST, 'body', 'body.bin'));
  console.log('body.bin inlined into body.json');
}

const files = {};
for (const abs of walk(DIST)) {
  const rel = path.relative(DIST, abs).split(path.sep).join('/');
  if (rel === 'index.html' || rel === 'artifact.html' || rel === 'artifact-files.json') continue;
  const type = TYPES[path.extname(rel)];
  if (!type) throw new Error(`no media type for ${rel}`);
  files[rel] = type;
}

const js = Object.keys(files).filter((f) => /^assets\/index-.*\.js$/.test(f));
const css = Object.keys(files).filter((f) => /^assets\/index-.*\.css$/.test(f));
if (js.length !== 1 || css.length !== 1) throw new Error(`expected one entry js and css, got ${js} ${css}`);

fs.writeFileSync(path.join(DIST, 'artifact.html'), `<title>Body Atlas</title>
<link rel="stylesheet" href="${css[0]}">
<div id="root"></div>
<script type="module" src="${js[0]}"></script>
`);
fs.writeFileSync(path.join(DIST, 'artifact-files.json'), JSON.stringify(files, null, 2) + '\n');
console.log('artifact.html ->', { js: js[0], css: css[0] });
console.log('artifact-files.json ->', Object.keys(files).length, 'files:', Object.keys(files).join(', '));
