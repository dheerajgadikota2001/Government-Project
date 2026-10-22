import * as React from 'react'

/** How many full-screen layers are open (a model to explore, a story read card by card).
 *  While one is, the models in the page behind it stop drawing. */
export const exploring = { n: 0 }

/** How deep in those layers a model sits: 0 in the page, 1 inside a full-screen story.
 *  A model draws only while no layer above its own is open. */
export const LayerDepth = React.createContext(0)
