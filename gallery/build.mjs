import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
const publisher=readFileSync('publisher.js','utf8').replace(/^export /gm,'');
const source=publisher+'\n'+readFileSync('worker.js','utf8').replace("import {publisherApi,isPublisherOwner} from './publisher.js';",'').replace('__HTML__',JSON.stringify(readFileSync('index.html','utf8'))).replace('__STUDIO__',JSON.stringify(readFileSync('studio.html','utf8')));
writeFileSync('dist/server/index.js',source);if(existsSync('.openai/hosting.json'))copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built Watch Out Worker');
