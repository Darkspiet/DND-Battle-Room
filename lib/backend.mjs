// Stable backend entry point for HTTP routes, WebSockets and integration tests.
export {
  SESSION_SECONDS,
  cookieOptions,
  readActor,
  requireActor,
  createAccount,
  signIn,
  signOut,
  updateProfile,
} from "./server/auth.mjs";
export {
  listRooms,
  saveRoomMetadata,
  roomStatus,
  joinRoom,
  readRoom,
  roomCommand,
  cleanup,
} from "./server/rooms.mjs";
export { listLibrary, saveLibrary } from "./server/library.mjs";
