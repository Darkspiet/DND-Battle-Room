"use client";
import type { GuestProfile } from './types';
const PROFILE_KEY='dnd-player-preferences-v2';
export function getGuestProfile(): GuestProfile {
  if (typeof window==='undefined') return {id:'',nickname:'Adventurer',color:'#3d8bfd'};
  for(const key of Object.keys(localStorage)) if(key.startsWith('dnd-battle-room')) localStorage.removeItem(key);
  try { return {id:'',nickname:'Adventurer',color:'#3d8bfd',...JSON.parse(localStorage.getItem(PROFILE_KEY)??'{}')}; }
  catch { return {id:'',nickname:'Adventurer',color:'#3d8bfd'}; }
}
export function saveGuestProfile(profile: GuestProfile) {
  if(typeof window!=='undefined') { const {id:_id,...preferences}=profile; localStorage.setItem(PROFILE_KEY,JSON.stringify(preferences)); }
}
export function createEntityId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
