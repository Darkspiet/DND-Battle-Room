import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { dbPool } from './db.mjs';
import { hashPassword, passwordMatches, validateCredentials, normalizeUsername, sessionDigest } from './authCredentials.mjs';
import { ApiError, requireThat, object, text, identifier, image, color, number, oneOf, array, rateLimit } from './validation.mjs';
import { initialRoom, member, roomView, applyCommands } from './roomEngine.mjs';
export const SESSION_SECONDS=14*24*60*60;
export function cookieOptions() { return { httpOnly:true, secure:process.env.APP_URL?.startsWith('https://')??false, sameSite:'lax', maxAge:SESSION_SECONDS, path:'/' }; }
function publicProfile(row) { return {id:row.id,username:row.username,name:row.display_name,color:row.color,avatarUrl:row.avatar_url??undefined,avatarName:row.avatar_name??undefined,createdAt:new Date(row.created_at).getTime(),updatedAt:new Date(row.updated_at??row.created_at).getTime()}; }
function cookieValue(header,name) { return String(header??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1); }
export async function readActor(header, dmOnly=false) {
  for(const kind of dmOnly?['dm']:['dm','guest']) {
    const token=cookieValue(header,kind==='dm'?'dnd-dm-session':'dnd-guest-session'); if(!token||!/^[a-f0-9]{64}$/.test(token))continue;
    const table=kind==='dm'?'dm_sessions':'guest_sessions', profiles=kind==='dm'?'dm_profiles':'guest_profiles';
    // Table identifiers are selected exclusively from constants, never user input.
    const result=await dbPool().query(`select p.* from ${table} s join ${profiles} p on p.id=s.profile_id where s.token_hash=$1 and s.expires_at>now()`,[sessionDigest(token)]);
    if(result.rowCount) return {...publicProfile(result.rows[0]),kind};
  }
  return null;
}
export async function requireActor(header,dmOnly=false) { const actor=await readActor(header,dmOnly);requireThat(actor,dmOnly?'Sign in as DM first.':'Join this room or sign in first.',401);return actor; }
async function sessionFor(client,id,kind) {
  const token=randomBytes(32).toString('hex'),table=kind==='dm'?'dm_sessions':'guest_sessions';
  await client.query(`delete from ${table} where expires_at<=now()`);
  await client.query(`delete from ${table} where profile_id=$1 and token_hash in (select token_hash from ${table} where profile_id=$1 order by expires_at desc offset 9)`,[id]);
  await client.query(`insert into ${table}(token_hash,profile_id,expires_at) values($1,$2,now()+interval '14 days')`,[sessionDigest(token),id]);
  return token;
}
function profileInput(input) {
  const out={};
  if(input.name!==undefined)out.display_name=text(input.name,100).trim()||'DM';
  if(input.color!==undefined)out.color=color(input.color);
  if(input.avatarUrl!==undefined)out.avatar_url=image(input.avatarUrl)??null;
  if(input.avatarName!==undefined)out.avatar_name=text(input.avatarName,150,'')||null;
  return out;
}
export async function createAccount(input) {
  object(input,['username','password','name','color','avatarUrl','avatarName']);
  let username;try{username=validateCredentials(input.username,input.password);}catch(error){throw new ApiError(400,error.message);}
  const credential=await hashPassword(input.password),data=profileInput(input),id='dm_'+randomUUID();
  const client=await dbPool().connect();
  try {
    await client.query('begin');
    const result=await client.query(`insert into dm_profiles(id,username,display_name,color,avatar_url,avatar_name,password_hash,password_salt) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [id,username,data.display_name??username,data.color??'#b7394b',data.avatar_url??null,data.avatar_name??null,credential.hash,credential.salt]);
    const sessionToken=await sessionFor(client,id,'dm');await client.query('commit');return {user:publicProfile(result.rows[0]),sessionToken};
  }catch(error){await client.query('rollback');if(error.code==='23505')throw new ApiError(409,'That DM username is already taken.');throw error;}finally{client.release();}
}
export async function signIn(input) {
  object(input,['username','password']);
  const username=normalizeUsername(text(input.username,100));const password=text(input.password,512);
  requireThat(Buffer.byteLength(password)<=512,'Password is too long.');
  const result=await dbPool().query('select * from dm_profiles where username=$1',[username]);
  const profile=result.rows[0];
  // Do comparable KDF work for unknown accounts without exposing database details.
  const valid=await passwordMatches(password,profile??{password_salt:'00000000000000000000000000000000',password_hash:'00'.repeat(64)});
  requireThat(profile&&valid,'DM username or password is incorrect.',401);
  const client=await dbPool().connect();try{return {user:publicProfile(profile),sessionToken:await sessionFor(client,profile.id,'dm')};}finally{client.release();}
}
export async function signOut(header) {
  const token=cookieValue(header,'dnd-dm-session');if(token&&/^[a-f0-9]{64}$/.test(token))await dbPool().query('delete from dm_sessions where token_hash=$1',[sessionDigest(token)]);
}
export async function updateProfile(header,input) {
  const actor=await requireActor(header,true);object(input,['id','username','name','color','avatarUrl','avatarName','createdAt','updatedAt']);
  const data=profileInput(input);
  const result=await dbPool().query(`update dm_profiles set display_name=$2,color=$3,avatar_url=$4,avatar_name=$5,updated_at=now() where id=$1 returning *`,
    [actor.id,data.display_name??actor.name,data.color??actor.color,data.avatar_url===undefined?actor.avatarUrl??null:data.avatar_url,data.avatar_name===undefined?actor.avatarName??null:data.avatar_name]);
  return publicProfile(result.rows[0]);
}
function roomSummary(row) {return {id:row.id,roomCode:row.room_code,name:row.name,dmUserId:row.dm_user_id,createdAt:new Date(row.created_at).getTime(),updatedAt:new Date(row.updated_at).getTime()};}
export async function listRooms(header) {const actor=await requireActor(header,true);return (await dbPool().query('select * from dm_rooms where dm_user_id=$1 order by updated_at desc limit 100',[actor.id])).rows.map(roomSummary);}
export async function saveRoomMetadata(header,input) {
  const actor=await requireActor(header,true);object(input,['id','name']); const name=text(input.name,100).trim()||'Untitled Room';
  if(input.id) {
    const result=await dbPool().query('update dm_rooms set name=$2,updated_at=now() where id=$1 and dm_user_id=$3 returning *',[identifier(input.id),name,actor.id]);
    requireThat(result.rowCount,'Room not found or not owned by you.',403);return roomSummary(result.rows[0]);
  }
  const client=await dbPool().connect();
  try {
    await client.query('begin');await client.query('select id from dm_profiles where id=$1 for update',[actor.id]);
    requireThat(Number((await client.query('select count(*) from dm_rooms where dm_user_id=$1',[actor.id])).rows[0].count)<100,'Room limit reached.');
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
    const result=await client.query('insert into dm_rooms(id,room_code,name,dm_user_id) values($1,$2,$3,$4) returning *',['room_'+randomUUID(),code,name,actor.id]);
    await client.query('insert into room_snapshots(room_code,state,revision) values($1,$2,0)',[code,JSON.stringify(initialRoom(code,actor))]);
    await client.query('commit');return roomSummary(result.rows[0]);
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
function codeValue(code) {requireThat(typeof code==='string'&&/^[A-Z0-9-]{3,12}$/.test(code),'Invalid room code.');return code;}
async function loadLocked(client,code) {
  const result=await client.query(`select s.state,s.revision,r.dm_user_id from room_snapshots s join dm_rooms r on r.room_code=s.room_code where s.room_code=$1 for update of s`,[codeValue(code)]);
  requireThat(result.rowCount,'Room not found.',404);const room=result.rows[0].state;
  room.dmId=result.rows[0].dm_user_id;room.revision=Number(result.rows[0].revision);return room;
}
function admitted(room,actor) {requireThat(actor.id===room.dmId||room.members.some(m=>m.id===actor.id),'Join this room first.',403);}
export async function roomStatus(code) {codeValue(code);return {exists:!!(await dbPool().query('select 1 from dm_rooms where room_code=$1',[code])).rowCount};}
export async function joinRoom(header,code,input) {
  object(input,['nickname','color','avatarUrl','avatarName']);codeValue(code);
  let actor=await readActor(header),sessionToken;
  const client=await dbPool().connect();
  try {
    await client.query('begin');const room=await loadLocked(client,code);
    if(!actor){
      const id='guest_'+randomUUID(),name=text(input.nickname,100,'Adventurer').trim()||'Adventurer';
      const result=await client.query('insert into guest_profiles(id,display_name,color,avatar_url,avatar_name) values($1,$2,$3,$4,$5) returning *',
        [id,name,color(input.color??'#3d8bfd'),image(input.avatarUrl)??null,text(input.avatarName,150,'')||null]);
      actor={...publicProfile(result.rows[0]),kind:'guest'};sessionToken=await sessionFor(client,id,'guest');
    }
    const current=room.members.find(m=>m.id===actor.id);
    if(!current){
      room.members=room.members.filter(m=>m.id===room.dmId||room.tokens.some(t=>t.ownerId===m.id)||Date.now()-m.lastSeen<14*86400000);
      requireThat(room.members.length<100,'Room member limit reached.');
      const used=new Set(room.members.map(m=>m.color.toLowerCase()));
      let assigned=actor.color;while(used.has(assigned.toLowerCase()))assigned='#'+randomBytes(3).toString('hex');
      room.members.push(member({...actor,color:assigned},actor.id===room.dmId?'dm':'player'));
    }else{current.role=actor.id===room.dmId?'dm':'player';current.lastSeen=Date.now();}
    room.revision++;
    await client.query('update room_snapshots set state=$2,revision=$3,updated_at=now() where room_code=$1',[code,JSON.stringify(room),room.revision]);
    await client.query('commit');notify(code);
    const profile=room.members.find(m=>m.id===actor.id);
    return {room:roomView(room,actor),profile,sessionToken};
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
export async function readRoom(header,code) {
  const actor=await requireActor(header);codeValue(code);
  const result=await dbPool().query('select s.state,s.revision,r.dm_user_id from room_snapshots s join dm_rooms r on r.room_code=s.room_code where s.room_code=$1',[code]);
  requireThat(result.rowCount,'Room not found.',404);const room=result.rows[0].state;room.dmId=result.rows[0].dm_user_id;room.revision=Number(result.rows[0].revision);admitted(room,actor);return roomView(room,actor);
}
export async function roomCommand(header,code,input) {
  const actor=await requireActor(header);object(input,['id','commands','revision']);const id=identifier(input.id);array(input.commands,100);
  rateLimit('commands:'+actor.id,240,60000);
  const client=await dbPool().connect();
  try {
    await client.query('begin');const room=await loadLocked(client,code);admitted(room,actor);
    const prior=await client.query('select 1 from room_commands where room_code=$1 and actor_id=$2 and command_id=$3',[code,actor.id,id]);
    if(prior.rowCount){await client.query('rollback');return roomView(room,actor);}
    if(input.revision!==undefined)requireThat(input.revision===room.revision,'Room changed; refresh and retry this action.',409);
    const next=applyCommands(room,actor,input.commands);next.revision=room.revision+1;
    await client.query('update room_snapshots set state=$2,revision=$3,updated_at=now() where room_code=$1',[code,JSON.stringify(next),next.revision]);
    await client.query('insert into room_commands(room_code,actor_id,command_id) values($1,$2,$3)',[code,actor.id,id]);
    await client.query('commit');notify(code);return roomView(next,actor);
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
function notify(code) { try{Promise.resolve(globalThis.dndRoomChanged?.(code)).catch(()=>{});}catch{/* Notifications do not change commit status. */} }
function libraryItem(row){return {id:row.id,kind:row.kind,name:row.name,category:row.category,icon:row.icon,imageUrl:row.image_url??undefined,imageName:row.image_name??undefined,tokenType:row.token_type,size:row.size,hp:row.hp??undefined,note:row.note??undefined,createdBy:row.created_by,createdAt:new Date(row.created_at).getTime(),updatedAt:new Date(row.updated_at).getTime()};}
export async function listLibrary(header) {await requireActor(header,true);return (await dbPool().query('select * from public_library_items order by updated_at desc limit 50')).rows.map(libraryItem);}
export async function saveLibrary(header,input) {
  const actor=await requireActor(header,true);object(input,['id','kind','name','category','icon','imageUrl','imageName','tokenType','size','hp','note']);
  const values=[oneOf(input.kind,['token','object']),text(input.name,100).trim()||'Preset',text(input.category,100,''),text(input.icon,32,'●'),image(input.imageUrl)??null,
    text(input.imageName,150,'')||null,oneOf(input.tokenType,['character','npc','monster','object']),number(input.size??1,1,6),text(input.hp,150,'')||null,text(input.note,4000,'')||null];
  requireThat(Number.isInteger(values[7]),'Preset size must be a whole number.');
  if(input.id){
    const result=await dbPool().query(`update public_library_items set kind=$2,name=$3,category=$4,icon=$5,image_url=$6,image_name=$7,token_type=$8,size=$9,hp=$10,note=$11,updated_at=now() where id=$1 and created_by=$12 returning *`,[identifier(input.id),...values,actor.id]);
    requireThat(result.rowCount,'Preset not found or not owned by you.',403);return libraryItem(result.rows[0]);
  }
  const result=await dbPool().query(`insert into public_library_items(id,kind,name,category,icon,image_url,image_name,token_type,size,hp,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,['preset_'+randomUUID(),...values,actor.id]);
  return libraryItem(result.rows[0]);
}
export async function cleanup() {
  await dbPool().query('delete from dm_sessions where expires_at<=now()');await dbPool().query('delete from guest_sessions where expires_at<=now()');
  await dbPool().query("delete from room_commands where created_at<now()-interval '1 day'");
  await dbPool().query("delete from guest_profiles g where created_at<now()-interval '30 days' and not exists(select 1 from guest_sessions s where s.profile_id=g.id)");
}
