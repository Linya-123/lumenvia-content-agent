// Offline test-only TypeScript transpilation hook. Not a replacement for Next.js build.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname,'..');
const oldResolve = Module._resolveFilename;
Module._resolveFilename = function(request,parent,...rest) {
  if (request.startsWith('@/')) request = path.join(root,'src',request.slice(2));
  return oldResolve.call(this,request,parent,...rest);
};
require.extensions['.ts'] = function(mod, filename) {
  const result = ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    fileName:filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
    reportDiagnostics:true,
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length) throw Error(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  mod._compile(result.outputText,filename);
};
