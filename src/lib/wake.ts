// Mantém a tela acesa enquanto toca ou exporta (onde o navegador permite).

type Lock = { release: () => Promise<void> }

export async function keepAwake(): Promise<() => void> {
  let lock: Lock | null = null
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock
    if (wl) lock = await wl.request('screen')
  } catch {
    lock = null
  }
  return () => {
    void lock?.release().catch(() => undefined)
  }
}
