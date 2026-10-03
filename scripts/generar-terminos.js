// Genera TERMINOS.md a partir de www/js/terminos.js (la misma fuente que muestra la app).
// Uso: node scripts/generar-terminos.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'www/js/terminos.js'), 'utf8'), ctx);
const T = ctx.window.ML_TYC;
const [y, m, d] = T.vigencia.split('-');
const out = [
  '# Términos y Condiciones de Uso y Licencia de MotorLog', '',
  `**Versión ${T.version}** · vigente desde el ${d}/${m}/${y}  `,
  `**Titular:** ${T.titular} · ${T.email}`, '',
  '> Este texto es el mismo que la aplicación muestra y que el usuario acepta en su primer uso.', '',
];
for (const s of T.secciones) {
  out.push(`## ${s.t}`, '');
  for (const p of s.p) out.push(/^([a-j]\)|•) /.test(p) ? `- ${p.replace(/^• /, '')}` : p, '');
}
out.push('---', '', T.copyright, '');
fs.writeFileSync(path.join(root, 'TERMINOS.md'), out.join('\n'));
console.log('TERMINOS.md generado (versión ' + T.version + ', ' + T.secciones.length + ' cláusulas)');
