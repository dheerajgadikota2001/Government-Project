import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applySeo, setSeoLanguage } from '../lib/seo'
import { useT } from '../i18n'

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
  const { t, lang } = useT()
  // During render, not in an effect: a detail page's effect can run before
  // this component's, and it must already find the page's language here.
  setSeoLanguage({ t, lang })
  useEffect(() => { applySeo(pathname) }, [pathname, t, lang])
  return null
}
