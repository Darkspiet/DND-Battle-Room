import { test, expect } from '@playwright/test';
import { signInAsDm } from './auth';

test('DM reassigns a token without exposing private notes; failed saves pause and recover', async ({page, browser}) => {
  await signInAsDm(page);
  await page.goto('/dm/dashboard');
  await page.getByRole('button', {name: 'Create room'}).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]+$/);
  const code=page.url().split('/').pop()!;
  const roomPath='/api/rooms/'+code;
  const context=await browser.newContext();
  try {
    const guest=await context.newPage();
    await guest.goto(new URL('/join/'+code,page.url()).href);
    await guest.getByLabel('Player name').fill('New owner');
    await guest.getByRole('button',{name:'Enter lobby'}).click();
    await expect(guest.locator('.sync-badge.online')).toBeVisible();
    const response=await page.request.post(roomPath+'/commands',{data:{id:crypto.randomUUID(),commands:[{type:'token.create',payload:{token:{id:'private-monster',name:'Private monster',hp:'Secret hit points',note:'Secret encounter note'}}}]}});
    expect(response.ok()).toBeTruthy();
    await expect(page.locator('.token')).toHaveCount(1);
    await page.locator('.token').click();
    await expect(page.getByLabel('HP / status')).toHaveValue('Secret hit points');
    await guest.locator('.token').click();
    await expect(guest.getByLabel('HP / status')).toHaveCount(0);
    await expect(guest.getByLabel('Note',{exact:true})).toHaveValue('');
    const joined=await (await guest.request.get(roomPath)).json();
    const member=joined.members.find((entry:{nickname:string})=>entry.nickname==='New owner');
    await page.getByLabel('Token owner').selectOption(member.id);
    await expect(guest.getByLabel('HP / status')).toHaveValue('Secret hit points');
    await expect(guest.getByLabel('HP / status')).toBeEnabled();
    await expect(guest.getByLabel('Note',{exact:true})).toHaveValue('');
    await page.screenshot({path:'test-results/screenshots/token-ownership-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'test-results/screenshots/token-ownership-mobile.png',fullPage:true});

    await page.route('**/api/rooms/'+code+'/commands',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Database unavailable. Changes have not been saved.'})}));
    await page.getByRole('button',{name:'Add token'}).click();
    await expect(page.locator('.sync-warning')).toContainText('not been saved');
    await expect(page.locator('.token')).toHaveCount(1);
    await page.unroute('**/api/rooms/'+code+'/commands');
    await expect(page.locator('.sync-warning')).toHaveCount(0);
    await page.getByRole('button',{name:'Add token'}).click();
    await expect(page.locator('.token')).toHaveCount(2);
    await expect.poll(async()=> (await (await page.request.get(roomPath)).json()).tokens.length).toBe(2);
  } finally { await context.close(); }
});


test('public signup, literal passphrase login and owner preset editing work', async ({page, browser}) => {
  const username='ui-'+Date.now().toString(36);
  const password="A literal ' ; $ passphrase";
  await page.goto('/dm/login');
  await page.getByRole('button',{name:'Sign up',exact:true}).click();
  await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('minlength','12');
  await page.getByLabel('Username',{exact:true}).fill(username);
  await page.getByLabel('Display name',{exact:true}).fill('UI DM');
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create DM profile'}).click();
  await expect(page).toHaveURL(/\/dm\/dashboard$/);
  const presetName='UI preset '+Date.now();
  const form=page.locator('.library-command-card');
  await form.getByLabel('Name',{exact:true}).fill(presetName);
  await form.getByRole('button',{name:'Save shared token'}).click();
  const edit=page.getByRole('button',{name:'Edit preset '+presetName,exact:true});
  await expect(edit).toBeVisible();
  await edit.click();
  await form.getByLabel('Name',{exact:true}).fill(presetName+' updated');
  await form.getByRole('button',{name:'Update preset'}).click();
  await expect(page.getByRole('button',{name:'Edit preset '+presetName+' updated',exact:true})).toBeVisible();
  const context=await browser.newContext();
  try {
    const other=await context.newPage();await signInAsDm(other);await other.goto(new URL('/dm/dashboard',page.url()).href);
    await expect(other.locator('.library-browser')).toContainText(presetName+' updated');
    await expect(other.getByRole('button',{name:'Edit preset '+presetName+' updated',exact:true})).toHaveCount(0);
  } finally {await context.close();}
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/dm/login');
  await page.getByLabel('Username',{exact:true}).fill(username);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in as DM'}).click();
  await expect(page).toHaveURL(/\/dm\/dashboard$/);
});
