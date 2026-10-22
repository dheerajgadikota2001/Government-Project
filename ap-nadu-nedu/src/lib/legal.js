/**
 * The facts the legal pages state about who answers for this site.
 *
 * WHY THIS IS A FILE AND NOT A SENTENCE IN THE CATALOGUE
 *
 * The community board lets readers post. That makes this site an
 * "intermediary" under the Information Technology (Intermediary Guidelines
 * and Digital Media Ethics Code) Rules, 2021, and those rules ask every
 * intermediary to publish the name and contact of a grievance officer. A name
 * and an address are facts, not prose: they are the same in all six
 * languages, and they must be right. So they live here, once, and the
 * disclaimer fills them into its sentence in each language.
 *
 * Until both are filled in, the disclaimer leaves the section out rather than
 * printing an empty name, and scripts/tests/legal-pages.test.mjs reports it as
 * an open item on every test run.
 */
export const GRIEVANCE = {
  // The person who answers complaints, as it should be printed.
  name: '',
  // An address that person reads. A dedicated one (grievance@...) outlives a
  // change of maintainer; a personal inbox does not.
  email: '',
}

export const grievanceReady = () =>
  Boolean(GRIEVANCE.name.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(GRIEVANCE.email.trim())
