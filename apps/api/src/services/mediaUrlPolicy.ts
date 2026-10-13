export function isProjectSignedMediaUrl(value: string, supabaseUrl: string) {
  try {
    const url = new URL(value);
    const project = new URL(supabaseUrl);
    return url.protocol === 'https:'
      && url.hostname === project.hostname
      && url.pathname.startsWith('/storage/v1/object/sign/message-media/');
  } catch {
    return false;
  }
}
