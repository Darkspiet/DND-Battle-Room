export function getSiteName() {
  return process.env.SITE_NAME?.trim() || 'DND Battle Room';
}
