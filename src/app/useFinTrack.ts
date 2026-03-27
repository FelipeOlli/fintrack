import { useContext } from 'react'
import { FinTrackContext } from './finTrackContext.shared'
import type { FinTrackCtx } from './finTrackTypes'

export function useFinTrack(): FinTrackCtx {
  const v = useContext(FinTrackContext)
  if (!v) throw new Error('useFinTrack must be used within FinTrackProvider')
  return v
}
