export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr ?? '—'
  return addr.slice(0, 8) + '…' + addr.slice(-6)
}

export function resolveWalletAddress(
  user: { linkedAccounts?: Array<{ type?: string; address?: string }> }
): string | null {
  const linked = user.linkedAccounts ?? []
  const w = linked.find(a => a.type === 'wallet' && typeof a.address === 'string' && a.address.length > 0)
    ?? linked.find(a => typeof a.address === 'string' && a.address.length > 0)
  return w?.address ?? null
}
