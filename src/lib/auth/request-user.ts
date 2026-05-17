/** Stable user id for preferences (Basic Auth username today; auth subject later). */
export function getRequestUserKey(request: Request): string {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6));
      const [user] = decoded.split(':', 2);
      if (user?.trim()) return user.trim();
    } catch {
      /* invalid header */
    }
  }

  const envUser = process.env.AUTH_USERNAME?.trim();
  if (envUser) return envUser;

  return '_anonymous';
}
