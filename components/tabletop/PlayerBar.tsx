"use client";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  connection: Pick<ReadyRoomConnection, "room" | "latestRollFor">;
};
export function PlayerBar({ connection }: Props) {
  const { room, latestRollFor } = connection;
  return (
    <section className="player-bar" aria-label="Players in room">
      {room.members.map((member) => {
        const latest = latestRollFor(member.id);
        return (
          <article
            className="profile-chip"
            key={member.id}
            style={{ borderColor: member.color }}
          >
            {member.avatarUrl ? (
              <img
                className="avatar avatar-image"
                alt=""
                draggable={false}
                src={member.avatarUrl}
              />
            ) : (
              <div className="avatar" style={{ background: member.color }}>
                {member.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <strong>{member.nickname}</strong>
              <span>{member.role.toUpperCase()}</span>
              {latest ? (
                <small>
                  {latest.private ? "Private " : ""}
                  {latest.expression}: {latest.total}
                </small>
              ) : (
                <small>No roll yet</small>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
