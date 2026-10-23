import type { RoomState } from './types';
export type RoomCommand = { type: string; payload: Record<string, unknown> };
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function changes(a:object,b:object,keys:string[]) {
  const before=a as Record<string,unknown>,after=b as Record<string,unknown>;const out:Record<string,unknown>={};
  for(const key of keys) if(!same(before[key],after[key]))out[key]=after[key]??null;
  return out;
}
export function deriveCommands(before:RoomState,after:RoomState,dm:boolean):RoomCommand[] {
  const commands:RoomCommand[]=[];
  for(const token of after.tokens) {
    const old=before.tokens.find(item=>item.id===token.id);
    if(!old)commands.push({type:'token.create',payload:{token}});
    else {
      const patch=changes(old,token,['name','icon','imageUrl','imageName','type','color','x','y','size','hp','note']);
      if(Object.keys(patch).length)commands.push({type:'token.update',payload:{id:token.id,patch}});
    }
  }
  for(const old of before.tokens)if(!after.tokens.some(token=>token.id===old.id))commands.push({type:'token.delete',payload:{id:old.id}});
  if(dm) {
    const patch=changes(before.grid,after.grid,['rows','columns','cellSize','background','feetPerCell','backgroundImage']);
    if(Object.keys(patch).length)commands.push({type:'grid.update',payload:{patch}});
    if(!same(before.drawings,after.drawings))commands.push({type:'drawings.set',payload:{drawings:after.drawings}});
    if(!same(before.effects,after.effects))commands.push({type:'effects.set',payload:{effects:after.effects}});
    if(!same(before.combat,after.combat))commands.push({type:'combat.set',payload:{combat:after.combat}});
  } else {
    for(const entry of after.combat.entries) {
      const old=before.combat.entries.find(item=>item.id===entry.id);
      if(!old)commands.push({type:'initiative.add',payload:{id:entry.id,tokenId:entry.tokenId}});
      else {
        const patch=changes(old,entry,['mode','dexModifier','conditions','roll','total']);
        if(Object.keys(patch).length)commands.push({type:'initiative.update',payload:{id:entry.id,patch}});
      }
    }
  }
  return commands;
}
