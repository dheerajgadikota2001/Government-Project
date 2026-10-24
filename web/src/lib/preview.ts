/** True on Dheeraj's own preview addresses and local runs, false on the public site.
 *  Review notes (the design picker, "this is a preview", notes addressed to him) show only here, so no visitor sees them. */
export const PREVIEW = typeof location !== 'undefined' && /(\.web\.app|\.firebaseapp\.com|^localhost|^127\.0\.0\.1|\.local)$/.test(location.hostname)
