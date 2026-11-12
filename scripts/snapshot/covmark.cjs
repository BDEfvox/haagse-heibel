// node covmark.cjs <srcCopy> <file> <marks.json> : inserts a counter before the line holding each unique anchor
const fs=require('fs'); const [root, file, marksFile] = process.argv.slice(2); const f=root+'/'+file; let t=fs.readFileSync(f,'utf8');
const marks = JSON.parse(fs.readFileSync(marksFile,'utf8'));
for (const [a, name] of marks) { const n=t.split(a).length-1; if(n!==1) throw new Error(name+' matches '+n); const i=t.indexOf(a); const ls=t.lastIndexOf('\n', i)+1; t=t.slice(0,ls)+`globalThis.__cov['${name}']=(globalThis.__cov['${name}']||0)+1;\n`+t.slice(ls); }
t = "globalThis.__cov = globalThis.__cov || {}; if (!globalThis.__covHook) { globalThis.__covHook = 1; process.on('exit', () => console.error('COV ' + JSON.stringify(globalThis.__cov))); }\n" + t;
fs.writeFileSync(f,t);
