// Turns the Vite build into an artifact page: the publish skeleton supplies
// doctype/html/head/body, so only the page's own content ships.
const fs = require('fs');
const html = fs.readFileSync('dist/index.html', 'utf8');
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];

fs.writeFileSync('dist/artifact.html', `<title>Body Atlas</title>
<link rel="stylesheet" href="${css}">
<div id="root"></div>
<script type="module" src="${js}"></script>
`);
console.log('artifact.html ->', { js, css });
