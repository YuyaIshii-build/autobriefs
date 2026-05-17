/** Admin 導線（UserMenu・AdminShell で共有） */
export const adminNavLinks = [
  { href: '/admin', label: 'Admin Home' },
  { href: '/prompt-pipelines', label: 'Template管理' },
  { href: '/prompt-blocks', label: 'Prompt Block管理' },
  { href: '/admin#legacy', label: 'Legacy Tools' },
  { href: '/briefs', label: 'Jobs / Logs' },
] as const;
