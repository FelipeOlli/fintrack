import { createContext } from 'react'
import type { FinTrackCtx } from './finTrackTypes'

export const FinTrackContext = createContext<FinTrackCtx | null>(null)
