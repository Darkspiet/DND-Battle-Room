import { signInAsDm } from './auth';
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";


test.beforeAll(() => {
  mkdirSync("test-results/screenshots", { recursive: true });
});

test("captures reviewed desktop and mobile screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DND Battle Room" })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/start-desktop.png", fullPage: true });

  await signInAsDm(page);
  await page.goto("/dm/dashboard");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: /^Room [A-Z0-9]+$/ })).toBeVisible();
  await page.getByLabel("Token picture").first().setInputFiles(path.join(process.cwd(), "tests/fixtures/token-picture.png"));
  await page.getByRole("button", { name: "Add token" }).click();
  await expect(page.locator(".token .token-image")).toHaveCount(1);
  await page.screenshot({ path: "test-results/screenshots/tabletop-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DND Battle Room" })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/start-mobile.png", fullPage: true });
});


test("captures the synthetic README encounter", async ({ page, browser }) => {
  await signInAsDm(page);
  const created=await page.request.post('/api/dm/rooms',{data:{name:'Goblin ambush showcase'}});
  expect(created.ok()).toBeTruthy();
  const {room:metadata}=await created.json();
  const roomPath='/api/rooms/'+metadata.roomCode;
  const first=await browser.newContext();
  const second=await browser.newContext();
  try {
    const origin=new URL(test.info().project.use.baseURL!).origin;
    const ranger=await (await first.request.post(origin+roomPath,{data:{nickname:'Aria · Ranger',color:'#227447'}})).json();
    const mage=await (await second.request.post(origin+roomPath,{data:{nickname:'Finn · Mage',color:'#2563eb'}})).json();
    const tokenData=[
      {id:'showcase-ranger',name:'Aria',icon:'🏹',type:'character',x:5,y:6,size:1,hp:'28/32'},
      {id:'showcase-mage',name:'Finn',icon:'✦',type:'character',x:7,y:9,size:1,hp:'21/24'},
      {id:'showcase-goblin',name:'Goblin scout',icon:'👺',type:'monster',x:13,y:5,size:1,hp:'7/12'},
      {id:'showcase-ogre',name:'Ogre',icon:'👹',type:'monster',x:16,y:8,size:2,hp:'45/59'},
      {id:'showcase-crate',name:'Supplies',icon:'▣',type:'object',x:10,y:3,size:1}
    ];
    const result=await page.request.post(roomPath+'/commands',{data:{id:crypto.randomUUID(),commands:[
      {type:'grid.update',payload:{patch:{columns:22,rows:14,cellSize:40,background:'#f4efe3'}}},
      ...tokenData.map(token=>({type:'token.create',payload:{token}})),
      {type:'token.assign',payload:{id:'showcase-ranger',ownerId:ranger.profile.id}},
      {type:'token.assign',payload:{id:'showcase-mage',ownerId:mage.profile.id}},
      {type:'drawings.set',payload:{drawings:[
        {id:'showcase-wall-a',kind:'wall',color:'#8a5a35',points:[{x:360,y:80},{x:720,y:80},{x:720,y:200}]},
        {id:'showcase-wall-b',kind:'wall',color:'#8a5a35',points:[{x:360,y:80},{x:360,y:200}]},
        {id:'showcase-wall-c',kind:'wall',color:'#8a5a35',points:[{x:360,y:360},{x:720,y:360},{x:720,y:440}]}
      ]}},
      {type:'effects.set',payload:{effects:[{id:'showcase-effect',shape:'circle',color:'#7c3aed',opacity:25,label:'Faerie Fire',origin:{x:540,y:260},target:{x:620,y:260},sizeFeet:15,widthFeet:5,createdAt:Date.now()}]}},
      {type:'combat.set',payload:{combat:{active:true,phase:'active',round:2,currentTurnIndex:0,entries:tokenData.slice(0,4).map((token,index)=>({id:'showcase-init-'+index,tokenId:token.id,mode:'manual',total:18-index*3,roll:18-index*3,dexModifier:0,conditions:[],submitted:true,source:'dm',createdAt:Date.now()+index}))}}},
      {type:'dice.roll',payload:{expression:'d20+4',private:false}},
      {type:'dice.roll',payload:{expression:'2d6+3',private:false}}
    ]}});
    expect(result.ok()).toBeTruthy();
    await page.setViewportSize({width:1740,height:1000});
    await page.goto('/room/'+metadata.roomCode);
    await expect(page.locator('.token')).toHaveCount(5);
    await expect(page.locator('.sync-badge.online')).toHaveText('Realtime sync');
    await expect(page.locator('.map-toolbar')).toContainText('Round 2: Aria');
    await page.screenshot({path:'test-results/screenshots/battle-room.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'test-results/screenshots/battle-room-mobile.png',fullPage:true});
  } finally {await first.close();await second.close();}
});
