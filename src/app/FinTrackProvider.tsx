import { type ReactNode } from 'react'
import { FinTrackContext } from './finTrackContext.shared'
import type { FinTrackCtx } from './finTrackTypes'

export function FinTrackProvider({
  value,
  children,
}: {
  value: FinTrackCtx
  children: ReactNode
}) {
  return <FinTrackContext.Provider value={value}>{children}</FinTrackContext.Provider>
}
