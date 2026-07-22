import { createContext, useContext, useState, type ReactNode } from 'react'

export type FeedScope = 'local' | 'global'

interface FeedScopeContextType {
  feedScope: FeedScope
  setFeedScope: (scope: FeedScope) => void
}

const FeedScopeContext = createContext<FeedScopeContextType>({
  feedScope: 'local',
  setFeedScope: () => {},
})

export function FeedScopeProvider({ children }: { children: ReactNode }) {
  const [feedScope, setFeedScopeState] = useState<FeedScope>(() => (
    localStorage.getItem('feedScope') === 'global' ? 'global' : 'local'
  ))

  function setFeedScope(scope: FeedScope) {
    setFeedScopeState(scope)
    localStorage.setItem('feedScope', scope)
  }

  return (
    <FeedScopeContext.Provider value={{ feedScope, setFeedScope }}>
      {children}
    </FeedScopeContext.Provider>
  )
}

export function useFeedScope() {
  return useContext(FeedScopeContext)
}
