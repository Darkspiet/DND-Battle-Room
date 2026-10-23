"use client";
import type { DMRoomSummary, LibraryItem, LibraryItemKind, TokenType } from './types';
export type DMUser = { id: string; username: string; name: string; color: string; avatarUrl?: string; avatarName?: string; createdAt?: number; updatedAt?: number };
export type DMAuthResult = { user: DMUser | null };
async function api<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Server or database unavailable. Changes have not been saved.');
  return data[key] as T;
}
export function getCurrentDMUser() { return api<DMUser | null>('/api/dm/session','user'); }
export async function signInDM(username: string, password: string): Promise<DMAuthResult> { return { user: await api<DMUser>('/api/dm/signin','user',{method:'POST',body:JSON.stringify({username,password})}) }; }
export async function createDMAccount(input: { username:string;password:string;name:string;color:string;avatarUrl?:string;avatarName?:string }): Promise<DMAuthResult> {
  return { user: await api<DMUser>('/api/dm/signup','user',{method:'POST',body:JSON.stringify(input)}) };
}
export function saveDMProfile(profile: DMUser) { return api<DMUser>('/api/dm/profile','user',{method:'PUT',body:JSON.stringify(profile)}); }
export async function signOutDM() { await api('/api/dm/session','ok',{method:'DELETE'}); }
export function loadDMRooms(_dmUserId?: string) { return api<DMRoomSummary[]>('/api/dm/rooms','rooms'); }
export function saveDMRoom(room: { id?: string; name: string }) { return api<DMRoomSummary>('/api/dm/rooms','room',{method:'POST',body:JSON.stringify({id:room.id,name:room.name})}); }
export function loadLibraryItems() { return api<LibraryItem[]>('/api/dm/library','library'); }
export function saveLibraryItem(item: LibraryItem) {
  const {id,createdAt:_createdAt,updatedAt:_updatedAt,createdBy:_createdBy,...fields}=item;
  return api<LibraryItem>('/api/dm/library','item',{method:'POST',body:JSON.stringify({...fields,...(id.startsWith('preset_')?{id}:{})})});
}
export function createLibraryItem(input: {kind:LibraryItemKind;name:string;category?:string;icon?:string;imageUrl?:string;imageName?:string;tokenType?:TokenType;size?:number;hp?:string;note?:string;createdBy?:string}):LibraryItem {
  const now=Date.now(); return {id:'draft_'+crypto.randomUUID(),kind:input.kind,name:input.name,category:input.category??'Creatures',icon:input.icon??'●',imageUrl:input.imageUrl,imageName:input.imageName,
    tokenType:input.tokenType??'monster',size:input.size??1,hp:input.hp,note:input.note,createdAt:now,updatedAt:now};
}
