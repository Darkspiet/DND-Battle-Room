import { expect, type Page, type BrowserContext } from '@playwright/test';
let credentials: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
export async function signInAsDm(page: Page) {
  if (!credentials) {
    const response=await page.request.post('/api/dm/signup',{data:{username:`test-${Date.now().toString(36)}`,password:'test password 123!',name:'Test DM',color:'#b7394b'}});
    expect(response.ok()).toBeTruthy();
    credentials=await page.context().cookies();
  } else await page.context().addCookies(credentials);
}
