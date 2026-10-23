import { randomInt, randomUUID } from 'node:crypto';
import { requireThat, object, text, identifier, number, color, array, oneOf, image } from './validation.mjs';
function integer(value,min,max) { number(value,min,max); requireThat(Number.isInteger(value),'Use a whole number.'); return value; }
const TOKEN_FIELDS = ['name','icon','imageUrl','imageName','type','color','x','y','size','hp','note'];
export function initialRoom(code, actor) {
  return { roomCode: code, dmId: actor.id, createdAt: Date.now(), revision: 0, members: [member(actor, 'dm')],
    grid: { rows: 18, columns: 26, cellSize: 44, background: '#f4efe3', feetPerCell: 5 },
    tokens: [], drawings: [], effects: [], rolls: [], combat: { active: false, phase: 'idle', round: 1, currentTurnIndex: 0, entries: [] } };
}
export function member(actor, role) {
  return { id: actor.id, nickname: actor.name, color: actor.color, avatarUrl: actor.avatarUrl, avatarName: actor.avatarName, role, joinedAt: Date.now(), lastSeen: Date.now() };
}
export function roomView(room, actor) {
  const view = structuredClone(room); const dm = actor.id === room.dmId;
  view.rolls = view.rolls.filter(roll => !roll.private || dm || roll.userId === actor.id);
  view.tokens = view.tokens.map(token => {
    if (dm) token.note = token.dmNote ?? token.note;
    else {
      if (token.ownerId === room.dmId || (token.hpPrivate && token.ownerId !== actor.id)) delete token.hp;
    }
    delete token.dmNote;
    return token;
  });
  return view;
}
function owns(room, actor, entity) { requireThat(actor.id === room.dmId || entity.ownerId === actor.id, 'You do not control this item.', 403); }
function dmOnly(room, actor) { requireThat(actor.id === room.dmId, 'Only the room DM can do that.', 403); }
function tokenPatch(input, room, actor, creating = false) {
  object(input, creating ? [...TOKEN_FIELDS, 'id', 'ownerId', 'ownerName'] : TOKEN_FIELDS);
  const result = {};
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (['name','icon','imageName','hp','note'].includes(key)) result[key] = value === null ? undefined : text(value, key === 'note' ? 4000 : key === 'icon' ? 32 : 150);
    else if (key === 'type') result.type = oneOf(value, ['character','npc','monster','object']);
    else if (key === 'imageUrl') result.imageUrl = image(value);
    else if (key === 'color') result.color = color(value);
    else if (key === 'size') result.size = integer(value, 1, 6);
    else if (key === 'x') result.x = number(value, 0, room.grid.columns - 1);
    else if (key === 'y') result.y = number(value, 0, room.grid.rows - 1);
  }
  if ('note' in result && actor.id === room.dmId) { result.dmNote = result.note; delete result.note; }
  return result;
}
function point(input) { object(input, ['x','y']); return { x: number(input.x, -50000, 50000), y: number(input.y, -50000, 50000) }; }
function validateGrid(patch) {
  object(patch, ['rows','columns','cellSize','background','feetPerCell','backgroundImage']); const out = {};
  for (const [key,value] of Object.entries(patch)) {
    if (key === 'rows' || key === 'columns') out[key] = integer(value, 1, 100);
    else if (key === 'cellSize') out[key] = number(value, 16, 128);
    else if (key === 'feetPerCell') out[key] = integer(value, 1, 100);
    else if (key === 'background') out[key] = color(value);
    else if (value === null) out.backgroundImage = undefined;
    else {
      object(value, ['source','imageUrl','imageName','positionX','positionY','scale','opacity']);
      out.backgroundImage = { source: oneOf(value.source,['upload','url']), imageUrl: image(value.imageUrl,8*1024*1024), imageName: text(value.imageName,150,''),
        positionX: number(value.positionX,-50000,50000), positionY: number(value.positionY,-50000,50000), scale: number(value.scale,20,300), opacity: number(value.opacity,10,100) };
      requireThat(out.backgroundImage.imageUrl, 'Missing image.');
    }
  }
  return out;
}
function validateEntry(value, room) {
  object(value,['id','tokenId','name','ownerId','ownerName','dexModifier','roll','total','mode','conditions','submitted','submittedAt','submittedBy','source','skipped','createdAt']);
  const token = room.tokens.find(token => token.id === value.tokenId); requireThat(token,'Initiative token not found.');
  const entry = { id: identifier(value.id), tokenId: token.id, name: token.name, ownerId: token.ownerId, ownerName: token.ownerName,
    dexModifier: number(value.dexModifier ?? 0,-100,100), total: number(value.total ?? 0,-1000,1000), mode: oneOf(value.mode,['manual','normal','advantage','disadvantage']),
    conditions: array(value.conditions ?? [],20).map(condition=>text(condition,100)), submitted: value.submitted === true, createdAt: number(value.createdAt ?? Date.now(),0,1e15) };
  if (value.roll !== undefined) entry.roll = number(value.roll,-1000,1000);
  if (value.source !== undefined) entry.source = oneOf(value.source,['app','manual','dm']);
  if (value.submittedAt !== undefined) entry.submittedAt = number(value.submittedAt,0,1e15);
  if (value.submittedBy !== undefined) entry.submittedBy = identifier(value.submittedBy);
  if (value.skipped !== undefined) entry.skipped = value.skipped === true;
  return entry;
}
export function rollDice(input) {
  const expression = text(input,40).replace(/\s+/g,'').toLowerCase();
  const match = expression.match(/^(\d*)d(4|6|8|10|12|20|100)([+-]\d{1,4})?$/);
  requireThat(match,'Use dice like d20, 2d6, or 1d8+3.');
  const count = number(Number(match[1]||1),1,20), sides=Number(match[2]), modifier=Number(match[3]||0);
  const rolls = Array.from({length:count},()=>randomInt(1,sides+1));
  return { expression,total:rolls.reduce((sum,v)=>sum+v,0)+modifier,parts:`[${rolls.join(', ')}]${modifier ? (modifier>0?' + ':' - ')+Math.abs(modifier):''}` };
}
export function applyCommands(source, actor, commands) {
  const room = structuredClone(source);
  array(commands,100); requireThat(commands.length>0,'No commands provided.');
  for (const command of commands) {
    object(command,['type','payload']); const payload=object(command.payload ?? {});
    switch (command.type) {
      case 'token.create': {
        requireThat(room.tokens.length<500,'Room token limit reached.');
        const input=object(payload.token); const id=identifier(input.id ?? randomUUID()); requireThat(!room.tokens.some(t=>t.id===id),'Token id is already in use.',409);
        const token={id,name:'Token',icon:'●',type:'character',x:0,y:0,size:1,...tokenPatch(input,room,actor,true),ownerId:actor.id,ownerName:actor.name,color:actor.color};
        room.tokens.push(token); break;
      }
      case 'token.update': {
        object(payload,['id','patch']); const token=room.tokens.find(t=>t.id===identifier(payload.id)); requireThat(token,'Token not found.',404); owns(room,actor,token);
        Object.assign(token,tokenPatch(payload.patch,room,actor));
        for (const entry of room.combat.entries) if(entry.tokenId===token.id) entry.name=token.name;
        break;
      }
      case 'token.delete': {
        object(payload,['id']); const token=room.tokens.find(t=>t.id===identifier(payload.id)); requireThat(token,'Token not found.',404); owns(room,actor,token);
        room.tokens=room.tokens.filter(t=>t.id!==token.id); room.combat.entries=room.combat.entries.filter(e=>e.tokenId!==token.id);
        room.combat.currentTurnIndex=Math.min(room.combat.currentTurnIndex,Math.max(0,room.combat.entries.length-1)); break;
      }
      case 'token.assign': {
        dmOnly(room,actor); object(payload,['id','ownerId']); const token=room.tokens.find(t=>t.id===identifier(payload.id));
        const owner=room.members.find(m=>m.id===identifier(payload.ownerId)); requireThat(token&&owner,'Token or member not found.',404);
        if(token.ownerId===room.dmId) token.hpPrivate=true;
        token.ownerId=owner.id;token.ownerName=owner.nickname;
        for(const entry of room.combat.entries) if(entry.tokenId===token.id) {entry.ownerId=owner.id;entry.ownerName=owner.nickname;}
        break;
      }
      case 'grid.update': dmOnly(room,actor); object(payload,['patch']); Object.assign(room.grid,validateGrid(payload.patch)); break;
      case 'drawings.set': {
        dmOnly(room,actor);object(payload,['drawings']);let points=0;
        room.drawings=array(payload.drawings,1000).map(line=>{object(line,['id','kind','ownerId','color','points']);const values=array(line.points,2000).map(point);points+=values.length;
          return {id:identifier(line.id),kind:oneOf(line.kind??'freehand',['wall','freehand']),ownerId:actor.id,color:color(line.color),points:values};});
        requireThat(points<=30000,'Too many drawing points.');break;
      }
      case 'effects.set': {
        dmOnly(room,actor);object(payload,['effects']);room.effects=array(payload.effects,200).map(effect=>{
          object(effect,['id','shape','ownerId','color','opacity','label','origin','target','sizeFeet','widthFeet','createdAt']);
          return {id:identifier(effect.id),shape:oneOf(effect.shape,['circle','cone','cube','line']),ownerId:actor.id,color:color(effect.color),opacity:number(effect.opacity,0,100),
            label:text(effect.label,150,''),origin:point(effect.origin),target:point(effect.target),sizeFeet:number(effect.sizeFeet,1,1000),widthFeet:number(effect.widthFeet??5,1,1000),createdAt:number(effect.createdAt,0,1e15)};});break;
      }
      case 'combat.set': {
        dmOnly(room,actor);object(payload,['combat']);const combat=object(payload.combat,['active','phase','round','currentTurnIndex','entries','startedAt']);
        const entries=array(combat.entries,500).map(entry=>validateEntry(entry,room));requireThat(new Set(entries.map(e=>e.id)).size===entries.length,'Duplicate initiative entries.');
        room.combat={active:combat.active===true,phase:oneOf(combat.phase,['idle','initiative','active']),round:integer(combat.round,1,100000),
          currentTurnIndex:integer(combat.currentTurnIndex,0,Math.max(0,entries.length-1)),entries};
        if(combat.startedAt!==undefined)room.combat.startedAt=number(combat.startedAt,0,1e15);break;
      }
      case 'initiative.add': {
        object(payload,['tokenId','id']);const token=room.tokens.find(t=>t.id===identifier(payload.tokenId));requireThat(token,'Token not found.',404);owns(room,actor,token);
        requireThat(!room.combat.entries.some(e=>e.tokenId===token.id),'Token already has initiative.',409);
        room.combat.entries.push({id:identifier(payload.id??randomUUID()),tokenId:token.id,name:token.name,ownerId:token.ownerId,ownerName:token.ownerName,dexModifier:0,total:0,mode:'normal',conditions:[],submitted:false,createdAt:Date.now()});break;
      }
      case 'initiative.update': {
        object(payload,['id','patch']);const entry=room.combat.entries.find(e=>e.id===identifier(payload.id));requireThat(entry,'Entry not found.',404);owns(room,actor,entry);
        const patch=object(payload.patch,['mode','dexModifier','conditions','roll','total']);
        if(patch.mode!==undefined) entry.mode=oneOf(patch.mode,['manual','normal','advantage','disadvantage']);
        if(patch.dexModifier!==undefined)entry.dexModifier=number(patch.dexModifier,-100,100);
        if(patch.conditions!==undefined)entry.conditions=array(patch.conditions,20).map(v=>text(v,100));
        if(patch.roll!==undefined||patch.total!==undefined){requireThat(entry.mode==='manual','App dice must be rolled by the server.');entry.roll=number(patch.roll??patch.total,-1000,1000);entry.total=entry.roll;}
        else if(entry.roll!==undefined&&entry.mode!=='manual')entry.total=entry.roll+entry.dexModifier;
        break;
      }
      case 'initiative.submit': {
        object(payload,['id','manualTotal']);const entry=room.combat.entries.find(e=>e.id===identifier(payload.id));requireThat(entry,'Entry not found.',404);owns(room,actor,entry);
        if(payload.manualTotal!==undefined){entry.mode='manual';entry.roll=number(payload.manualTotal,-1000,1000);entry.total=entry.roll;entry.source=actor.id===room.dmId?'dm':'manual';}
        else{const a=randomInt(1,21),b=randomInt(1,21);entry.roll=entry.mode==='advantage'?Math.max(a,b):entry.mode==='disadvantage'?Math.min(a,b):a;entry.total=entry.roll+entry.dexModifier;entry.source='app';}
        entry.submitted=true;entry.submittedAt=Date.now();entry.submittedBy=actor.id;
        if(room.combat.phase==='active')room.combat.entries.sort((a,b)=>b.total-a.total||b.dexModifier-a.dexModifier||a.createdAt-b.createdAt);break;
      }
      case 'dice.roll': {
        object(payload,['expression','private']);requireThat(payload.private===undefined||typeof payload.private==='boolean');
        room.rolls=[{id:randomUUID(),userId:actor.id,userName:actor.name,...rollDice(payload.expression),private:payload.private===true,createdAt:Date.now()},...room.rolls].slice(0,80);break;
      }
      default: requireThat(false,'Unknown room command.');
    }
  }
  requireThat(Buffer.byteLength(JSON.stringify(room))<=24*1024*1024,'Room storage limit reached.',413);
  return room;
}
