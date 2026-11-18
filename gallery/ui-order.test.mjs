import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('function reorderClipCards'),html.indexOf('let loading=false;'));
function gallery(ids){
 const nodes=ids.map(id=>({dataset:{clipId:id}}));let moves=0;
 const main={querySelectorAll:()=>[...nodes],insertBefore(node,before){assert.ok(nodes.includes(node));nodes.splice(nodes.indexOf(node),1);nodes.splice(before?nodes.indexOf(before):nodes.length,0,node);moves++}};
 const context={main};vm.createContext(context);vm.runInContext(code,context);
 return {nodes,order:ids=>context.reorderClipCards(ids.map(id=>({id}))),moves:()=>moves};
}
test('rendered cards follow API newest-first order instead of alphabetical clip IDs',()=>{
 const g=gallery(['latent-01','speed-old','speed-new']);const existing=g.nodes[2];
 g.order(['speed-new','speed-old','latent-01']);assert.deepEqual(g.nodes.map(n=>n.dataset.clipId),['speed-new','speed-old','latent-01']);assert.equal(g.nodes[0],existing);
 const moves=g.moves();g.order(['speed-new','speed-old','latent-01']);assert.equal(g.moves(),moves,'unchanged refresh must not move playing video nodes');
});
test('a refresh moves newly added cards to the top and reorders existing cards',()=>{
 const g=gallery(['speed-old','latent-01','speed-new']);g.order(['speed-new','speed-old','latent-01']);
 g.nodes.push({dataset:{clipId:'newest'}});g.order(['newest','speed-new','speed-old','latent-01']);assert.deepEqual(g.nodes.map(n=>n.dataset.clipId),['newest','speed-new','speed-old','latent-01']);
});
test('refresh invokes card ordering and does not re-sort by ID',()=>{
 const refresh=html.slice(html.indexOf('async function refreshClips'),html.indexOf('refreshClips().then(refreshStatuses)'));
 assert.match(refresh,/reorderClipCards\(clips\)/);assert.doesNotMatch(refresh,/localeCompare/);
});
