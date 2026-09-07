import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applySeo } from '../lib/seo'

/**
 * Mounted once inside the router, next to Analytics, for the same reason:
 * every route change passes through one place rather than through twenty
 * pages that each have to remember.
 *
 * Renders nothing. Detail pages that know more than the route table can call
 * applySeo directly once their record has loaded.
 */
export default function Seo() {
  const { pathname } = useLocation()
  useEffect(() => { applySeo(pathname) }, [pathname])
  return null
}
