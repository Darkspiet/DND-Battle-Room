import './scripts/load-config.mjs';
import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { databaseReady } from './lib/db.mjs';
import { readActor, readRoom, roomCommand, cleanup } from './lib/backend.mjs';
import { ApiError, requireThat, object, identifier, number, rateLimit, originAllowed, MAX_BODY } from './lib/validation.mjs';
const args=process.argv.slice(2);
const argument=(names,fallback)=>{const i=args.findIndex(arg=>names.includes(arg));return i>=0?args[i+1]:fallback;};
const port=Number(process.env.PORT??argument(['-p','--port'],3000));
const hostname=process.env.HOSTNAME??argument(['-H','--hostname','--host'],'127.0.0.1');
const dev=process.env.NODE_ENV!=='production';
if(!process.env.APP_URL&&dev)process.env.APP_URL=`http://127.0.0.1:${port}`;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required in every runtime mode. Configure PostgreSQL before starting.');
if(!process.env.APP_URL||!/^https?:$/.test(new URL(process.env.APP_URL).protocol))throw new Error('APP_URL must be the public HTTP/HTTPS origin.');
try{await databaseReady();}catch{throw new Error('PostgreSQL is unavailable or schema is missing. Check DATABASE_URL and run db:apply.');}
const app=next({dev,hostname,port});await app.prepare();
const handle=app.getRequestHandler(),handleUpgrade=app.getUpgradeHandler();
function clientIP(request){
  const peer=request.socket.remoteAddress??'unknown';
  if(process.env.TRUST_PROXY==='loopback'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){
    const forwarded=String(request.headers['x-forwarded-for']??'').split(',').pop()?.trim();
    if(forwarded&&/^[a-f0-9.:]{1,64}$/i.test(forwarded))return forwarded;
  }
  return peer;
}
const server=createServer((request,response)=>{
  request.headers['x-dnd-client-ip']=clientIP(request);
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Frame-Options','DENY');
  if(Number(request.headers['content-length']??0)>MAX_BODY){response.writeHead(413).end('Request is too large.');return;}
  Promise.resolve(handle(request,response)).catch(()=>{if(!response.headersSent)response.writeHead(503);response.end('Server unavailable.');});
});
const wss=new WebSocketServer({noServer:true,maxPayload:MAX_BODY,perMessageDeflate:false});
const socketsByRoom=new Map(),connectionsByActor=new Map(),connectionsByIP=new Map();
const send=(socket,message)=>{if(socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>MAX_BODY){socket.close(1013,'Slow connection');return;}socket.send(JSON.stringify(message));}};
function leave(socket){const set=socketsByRoom.get(socket.roomCode);set?.delete(socket);if(set?.size===0)socketsByRoom.delete(socket.roomCode);socket.roomCode=undefined;}
function failure(socket,error){send(socket,{type:'sync_error',message:error instanceof ApiError?error.message:'Server or database unavailable. Editing is paused.',status:error instanceof ApiError?error.status:503});}
async function refresh(socket){try{send(socket,{type:'room_snapshot',room:await readRoom(socket.cookie,socket.roomCode)});}catch(error){failure(socket,error);if(error instanceof ApiError&&[401,403].includes(error.status))socket.close(1008,'Session expired');}}
globalThis.dndRoomChanged=async code=>{const sockets=socketsByRoom.get(code);if(sockets)await Promise.allSettled([...sockets].map(refresh));};
server.on('upgrade',async(request,socket,head)=>{
  try{
    const url=new URL(request.url??'/',process.env.APP_URL);
    if(url.pathname!=='/ws'){handleUpgrade(request,socket,head);return;}
    requireThat(originAllowed(request.headers.origin),'Origin not allowed.',403);
    const ip=clientIP(request);rateLimit('ws-handshake:'+ip,120,60000);
    requireThat(wss.clients.size<500&&(connectionsByIP.get(ip)??0)<100,'Connection limit reached.',429);
    const actor=await readActor(request.headers.cookie);requireThat(actor,'Join a room or sign in first.',401);
    requireThat((connectionsByActor.get(actor.id)??0)<5,'Account connection limit reached.',429);
    wss.handleUpgrade(request,socket,head,ws=>{ws.cookie=request.headers.cookie;ws.actorId=actor.id;ws.ip=ip;wss.emit('connection',ws);});
  }catch(error){socket.end(`HTTP/1.1 ${error instanceof ApiError?error.status:503} Rejected\r\nConnection: close\r\n\r\n`);}
});
wss.on('connection',socket=>{
  connectionsByActor.set(socket.actorId,(connectionsByActor.get(socket.actorId)??0)+1);connectionsByIP.set(socket.ip,(connectionsByIP.get(socket.ip)??0)+1);
  socket.alive=true;socket.on('pong',()=>{socket.alive=true;});socket.on('error',()=>socket.terminate());
  socket.on('message',async raw=>{
    if(socket.busy){failure(socket,new ApiError(429,'Wait for the previous request.'));return;}
    socket.busy=true;
    try{
      rateLimit('ws-message:'+socket.actorId,1200,60000);
      let message;try{message=JSON.parse(raw.toString());}catch{throw new ApiError(400,'Malformed JSON.');}
      object(message);const actor=await readActor(socket.cookie);requireThat(actor&&actor.id===socket.actorId,'Session expired.',401);
      if(message.type==='join_room'){
        object(message,['type','roomCode']);const code=identifier(message.roomCode);await readRoom(socket.cookie,code);
        leave(socket);socket.roomCode=code;const set=socketsByRoom.get(code)??new Set();set.add(socket);socketsByRoom.set(code,set);await refresh(socket);return;
      }
      requireThat(socket.roomCode&&message.roomCode===socket.roomCode,'Join this room before sending commands.',403);
      if(message.type==='command'){
        object(message,['type','roomCode','request']);const room=await roomCommand(socket.cookie,socket.roomCode,message.request);send(socket,{type:'room_snapshot',room,commandId:message.request.id});return;
      }
      if(message.type==='token_move_preview'){
        object(message,['type','roomCode','tokenId','x','y','seq']);const room=await readRoom(socket.cookie,socket.roomCode);
        const token=room.tokens.find(t=>t.id===identifier(message.tokenId));requireThat(token,'Token not found.',404);
        requireThat(actor.id===room.dmId||token.ownerId===actor.id,'You cannot move that token.',403);
        const x=number(message.x,0,room.grid.columns-token.size),y=number(message.y,0,room.grid.rows-token.size),seq=number(message.seq,0,1e15);
        for(const other of socketsByRoom.get(socket.roomCode)??[])if(other!==socket)send(other,{type:'token_move_preview',token:{id:token.id,x,y},seq,profileId:actor.id});return;
      }
      throw new ApiError(400,'Unknown realtime command.');
    }catch(error){failure(socket,error);if(error instanceof ApiError&&error.status===401)socket.close(1008,'Session expired');}
    finally{socket.busy=false;}
  });
  socket.on('close',()=>{leave(socket);for(const [map,key]of [[connectionsByActor,socket.actorId],[connectionsByIP,socket.ip]]){const n=(map.get(key)??1)-1;if(n>0)map.set(key,n);else map.delete(key);}});
});
const heartbeat=setInterval(()=>{for(const socket of wss.clients){if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();if(socket.roomCode)void refresh(socket);}},30000);heartbeat.unref();
const housekeeping=setInterval(()=>{void cleanup().catch(()=>{});},600000);housekeeping.unref();
server.listen(port,hostname,()=>console.log(`DND Battle Room listening on http://${hostname}:${port}`));
