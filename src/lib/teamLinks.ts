export function teamRepositoryUrl(remote: string | undefined): string | null {
  if (!remote) return null;
  const ssh = remote.match(/^[\w.-]+@([\w.-]+):([\w./-]+)$/);
  try {
    const url = new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : remote);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
