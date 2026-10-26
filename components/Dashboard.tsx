"use client";

import { DMInvitations } from "./DMInvitations";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  CalendarDays,
  Dices,
  ImagePlus,
  Library,
  LogOut,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../lib/client/api";
import type { CampaignSummary, DMUser, LibraryItem } from "../lib/domain/types";

export function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<DMUser | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryDraft, setLibraryDraft] = useState({
    kind: "token" as "token" | "object",
    name: "",
    category: "Creatures",
    visibility: "private" as "private" | "shared",
    icon: "⚔",
    tokenKind: "npc" as "character" | "npc" | "monster" | "object",
    color: "#b83c52",
    size: 1,
    hp: "",
    note: "",
    assetId: null as string | null
  });
  const [libraryKind, setLibraryKind] = useState<"token" | "object">("token");
  const [librarySearch, setLibrarySearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ displayName: "", color: "#b83c52", avatarAssetId: null as string | null });
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ user: current }, { campaigns: rows }, { items }] = await Promise.all([
        apiFetch<{ user: DMUser | null }>("/api/v1/auth/session"),
        apiFetch<{ campaigns: CampaignSummary[] }>("/api/v1/campaigns"),
        apiFetch<{ items: LibraryItem[] }>("/api/v1/library")
      ]);
      if (!current) return router.replace("/dm/login");
      setUser(current);
      setProfileDraft({ displayName: current.displayName, color: current.color, avatarAssetId: current.avatarAssetId ?? null });
      setCampaigns(rows);
      setLibrary(items);

    } catch (caught) {
      if (caught instanceof Error && "status" in caught && caught.status === 401) router.replace("/dm/login");
      else setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await apiFetch<{ campaign: { id: string } }>("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      router.push(`/dm/campaigns/${result.campaign.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function createLibraryPreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const { item } = await apiFetch<{ item: LibraryItem }>("/api/v1/library", {
        method: "POST",
        body: JSON.stringify({
          kind: libraryDraft.kind,
          name: libraryDraft.name,
          category: libraryDraft.category,
          visibility: libraryDraft.visibility,
          assetId: libraryDraft.assetId,
          data: {
            color: libraryDraft.color,
            size: libraryDraft.size,
            icon: libraryDraft.icon,
            kind: libraryDraft.kind === "object" ? "object" : libraryDraft.tokenKind,
            hp: libraryDraft.hp,
            note: libraryDraft.note
          }
        })
      });
      setLibrary((current) => [item, ...current]);
      setLibraryDraft((current) => ({ ...current, name: "", assetId: null }));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function uploadAsset(file: File | null, kind: "avatar" | "token") {
    if (!file) return null;
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    const { asset } = await apiFetch<{ asset: { id: string } }>("/api/v1/assets", { method: "POST", body: form });
    return asset.id;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const { user: updated } = await apiFetch<{ user: DMUser }>("/api/v1/auth/session", {
        method: "PATCH",
        body: JSON.stringify(profileDraft)
      });
      setUser(updated);
      setProfileOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function removeLibraryPreset(itemId: string) {
    try {
      await apiFetch(`/api/v1/library/${itemId}`, { method: "DELETE" });
      setLibrary((current) => current.filter((item) => item.id !== itemId));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function signOut() {
    await apiFetch("/api/v1/auth/session", { method: "DELETE" });
    router.push("/");
  }

  return (
    <main className="dashboard-page">
      <header className="app-header">
        <Link className="brand" href="/dm/dashboard">
          <span className="brand-mark">
            <Dices aria-hidden="true" />
          </span>
          <span>DND Battle Room</span>
        </Link>
        <div className="header-user">
          <span className="avatar" style={{ backgroundColor: user?.color }}>
            {user?.avatarAssetId ? <Image alt="" height={36} src={`/api/v1/assets/${user.avatarAssetId}`} unoptimized width={36} /> : user?.displayName.slice(0, 1).toUpperCase() ?? "DM"}
          </span>
          <span className="header-user-copy">
            <strong>{user?.displayName ?? "Dungeon Master"}</strong>
            <small>{"Dungeon Master"}</small>
          </span>
          <button className="icon-button" aria-label="Edit DM profile" title="Profile" onClick={() => setProfileOpen(true)} type="button"><Settings aria-hidden="true" /></button>
          <button
            className="icon-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </header>

      <Dialog.Root open={profileOpen} onOpenChange={setProfileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content profile-dialog">
            <div className="dialog-heading"><div><Dialog.Title>DM profile</Dialog.Title><Dialog.Description>Your name, color, and portrait appear in campaigns.</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Close"><X aria-hidden="true" /></Dialog.Close></div>
            <form className="stack-form" onSubmit={saveProfile}>
              <div className="profile-avatar-row"><span className="avatar profile-avatar" style={{ backgroundColor: profileDraft.color }}>{profileDraft.avatarAssetId ? <Image alt="" height={64} src={`/api/v1/assets/${profileDraft.avatarAssetId}`} unoptimized width={64} /> : profileDraft.displayName.slice(0, 1).toUpperCase()}</span><label className="button secondary-button"><ImagePlus aria-hidden="true" /> Portrait<input accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadAsset(event.target.files?.[0] ?? null, "avatar").then((avatarAssetId) => avatarAssetId && setProfileDraft((current) => ({ ...current, avatarAssetId })))} type="file" /></label>{profileDraft.avatarAssetId ? <button className="button danger-button" onClick={() => setProfileDraft({ ...profileDraft, avatarAssetId: null })} type="button">Remove</button> : null}</div>
              <label>Display name<input maxLength={48} minLength={2} required value={profileDraft.displayName} onChange={(event) => setProfileDraft({ ...profileDraft, displayName: event.target.value })} /></label>
              <label>Identity color<input type="color" value={profileDraft.color} onChange={(event) => setProfileDraft({ ...profileDraft, color: event.target.value })} /></label>
              <button className="button primary-button" type="submit">Save profile</button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="dashboard-main">
        {user ? <DMInvitations /> : null}
        <section className="page-heading">
          <div>
            <p className="eyebrow">Campaign library</p>
            <h1>Your campaigns</h1>
            <p>Worlds, encounters, players, and media stay on this server.</p>
          </div>
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger asChild>
              <button className="button primary-button">
                <Plus aria-hidden="true" /> New campaign
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content">
                <div className="dialog-heading">
                  <div>
                    <Dialog.Title>Create campaign</Dialog.Title>
                    <Dialog.Description>
                      A world map and opening encounter are created automatically.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="icon-button" aria-label="Close">
                    <X aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <form className="stack-form" onSubmit={createCampaign}>
                  <label>
                    Campaign name
                    <input
                      autoFocus
                      maxLength={80}
                      required
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      maxLength={500}
                      rows={4}
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>
                  <button className="button primary-button wide" type="submit">
                    <Plus aria-hidden="true" /> Create campaign
                  </button>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </section>

        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}
        {pending ? (
          <div className="loading-state">
            <span className="spinner" /> Loading campaigns...
          </div>
        ) : null}

        {!pending && campaigns.length === 0 ? (
          <section className="empty-campaigns">
            <div className="empty-map-preview" />
            <h2>No campaigns yet</h2>
            <p>Create one to get a permanent player code, world map, and first battle scene.</p>
            <button className="button primary-button" onClick={() => setDialogOpen(true)} type="button">
              <Plus aria-hidden="true" /> Create campaign
            </button>
          </section>
        ) : (
          <section className="campaign-grid" aria-label="Campaigns">
            {campaigns.map((campaign) => (
              <Link className="campaign-card" href={`/dm/campaigns/${campaign.id}`} key={campaign.id}>
                <div className="campaign-art">
                  <span className={campaign.joinEnabled ? "status-dot online" : "status-dot"}>
                    {campaign.joinEnabled ? "Open" : "Closed"}
                  </span>
                </div>
                <div className="campaign-card-body">
                  <div>
                    <h2>{campaign.name}</h2>
                    <p>{campaign.description || "No campaign notes yet."}</p>
                  </div>
                  <dl>
                    <div>
                      <Users aria-hidden="true" />
                      <dt>Players</dt>
                      <dd>{campaign.playerCount}</dd>
                    </div>
                    <div>
                      <CalendarDays aria-hidden="true" />
                      <dt>Scenes</dt>
                      <dd>{campaign.sceneCount}</dd>
                    </div>
                  </dl>
                  <div className="campaign-open">
                    <code>{campaign.joinCode}</code>
                    <span>
                      Open campaign <ArrowRight aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}

        <section className="library-band">
          <div className="library-heading">
            <span className="section-icon">
              <Library aria-hidden="true" />
            </span>
            <div>
              <h2>Encounter library</h2>
              <p>{library.length} reusable token and object preset(s)</p>
            </div>
          </div>
          <div className="library-controls"><div className="segmented-control"><button className={libraryKind === "token" ? "active" : ""} onClick={() => { setLibraryKind("token"); setLibraryDraft((current) => ({ ...current, kind: "token", tokenKind: current.tokenKind === "object" ? "npc" : current.tokenKind })); }} type="button">Tokens</button><button className={libraryKind === "object" ? "active" : ""} onClick={() => { setLibraryKind("object"); setLibraryDraft((current) => ({ ...current, kind: "object", tokenKind: "object", category: current.category === "Creatures" ? "Map objects" : current.category })); }} type="button">Objects</button></div><label className="library-search"><Search aria-hidden="true" /><input aria-label="Search encounter library" placeholder="Search presets" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} /></label></div>
          <form className="library-create" onSubmit={createLibraryPreset}>
            <input
              aria-label="Preset name"
              maxLength={80}
              placeholder="Preset name"
              required
              value={libraryDraft.name}
              onChange={(event) => setLibraryDraft({ ...libraryDraft, name: event.target.value })}
            />
            <input
              aria-label="Preset category"
              maxLength={80}
              placeholder="Category"
              required
              value={libraryDraft.category}
              onChange={(event) => setLibraryDraft({ ...libraryDraft, category: event.target.value })}
            />
            <input
              aria-label="Preset icon"
              maxLength={4}
              value={libraryDraft.icon}
              onChange={(event) => setLibraryDraft({ ...libraryDraft, icon: event.target.value })}
            />
            {libraryKind === "token" ? <select aria-label="Token type" value={libraryDraft.tokenKind} onChange={(event) => setLibraryDraft({ ...libraryDraft, tokenKind: event.target.value as typeof libraryDraft.tokenKind })}><option value="character">Character</option><option value="npc">NPC</option><option value="monster">Monster</option></select> : null}
            <input
              aria-label="Preset color"
              type="color"
              value={libraryDraft.color}
              onChange={(event) => setLibraryDraft({ ...libraryDraft, color: event.target.value })}
            />
            <input
              aria-label="Preset size"
              min={1}
              max={8}
              type="number"
              value={libraryDraft.size}
              onChange={(event) => setLibraryDraft({ ...libraryDraft, size: Number(event.target.value) })}
            />
            <select
              aria-label="Preset visibility"
              value={libraryDraft.visibility}
              onChange={(event) =>
                setLibraryDraft({ ...libraryDraft, visibility: event.target.value as "private" | "shared" })
              }
            >
              <option value="private">Private</option>
              <option value="shared">Shared with DMs</option>
            </select>
            <input aria-label="Preset hit points" maxLength={32} placeholder="HP, e.g. 18/18" value={libraryDraft.hp} onChange={(event) => setLibraryDraft({ ...libraryDraft, hp: event.target.value })} />
            <input aria-label="Preset notes" maxLength={500} placeholder="Notes" value={libraryDraft.note} onChange={(event) => setLibraryDraft({ ...libraryDraft, note: event.target.value })} />
            <label className="button secondary-button library-image-button"><ImagePlus aria-hidden="true" /> {libraryDraft.assetId ? "Image ready" : "Image"}<input accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadAsset(event.target.files?.[0] ?? null, "token").then((assetId) => assetId && setLibraryDraft((current) => ({ ...current, assetId })))} type="file" /></label>
            <button className="button secondary-button" type="submit">
              <Plus aria-hidden="true" /> Save preset
            </button>
          </form>
          {library.some((item) => item.kind === libraryKind && (!librarySearch.trim() || `${item.name} ${item.category}`.toLowerCase().includes(librarySearch.trim().toLowerCase()))) ? (
            <div className="library-items">
              {library.filter((item) => item.kind === libraryKind).filter((item) => !librarySearch.trim() || `${item.name} ${item.category}`.toLowerCase().includes(librarySearch.trim().toLowerCase())).map((item) => (
                <article key={item.id}>
                  <span style={{ backgroundColor: typeof item.data.color === "string" ? item.data.color : "#b83c52" }}>
                    {item.assetId ? <Image alt="" height={38} src={`/api/v1/assets/${item.assetId}`} unoptimized width={38} /> : typeof item.data.icon === "string" ? item.data.icon : item.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category} · {item.visibility}
                    </small>
                  </div>
                  {item.ownerId === user?.id ? (
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${item.name}`}
                      title="Delete preset"
                      onClick={() => void removeLibraryPreset(item.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>


      </div>
    </main>
  );
}
