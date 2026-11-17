import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',readFileSync('worker.js','utf8').replace('__HTML__',JSON.stringify(readFileSync('index.html','utf8'))));
if(existsSync('.openai/hosting.json')){mkdirSync('dist/.openai',{recursive:true});copyFileSync('.openai/hosting.json','dist/.openai/hosting.json')}
console.log('Built gallery Worker');
