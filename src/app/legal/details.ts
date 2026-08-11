/**
 * The four facts about the operator that only a human can supply.
 *
 * THIS FILE IS THE ONLY THING STOPPING THESE PAGES FROM SHIPPING. Everything else on them is a
 * description of what the software actually does, which is checkable against the code and was. These
 * four are not: they are legal and commercial facts about whoever runs this deployment, and inventing
 * a company name or a jurisdiction would be exactly the kind of fabrication the rest of this codebase
 * refuses — a privacy policy that names a made-up entity is worse than none, because it reads as a
 * commitment nobody made.
 *
 * THREE OF THE FOUR ARE NOW ANSWERED. `logRetention` is not, and it is the one that could not be
 * derived from anything: the other three describe who the operator is, which they can simply state,
 * while this one describes how the infrastructure is configured — and it is not configured yet.
 * Answer it by deciding the policy, not by picking a number that sounds reasonable.
 *
 * A `null` renders as a loud inline marker rather than a blank, so an unfinished page cannot go out
 * looking finished.
 */
export interface OperatorDetails {
  /** The legal entity that operates this deployment and is the data controller. */
  entity: string | null;
  /** A postal or email address a person can actually reach for a data request. */
  contact: string | null;
  /** The country or state whose law governs, and whose regulator hears a complaint. */
  jurisdiction: string | null;
  /** How long server logs and database backups are kept. NOT how long a candidate's CV is kept —
   *  that answer is in the code and is stated on the page: until they delete it. */
  logRetention: string | null;
}

export const OPERATOR: OperatorDetails = {
  // Reads as "BuildCv is operated by {entity}, reachable at {contact}." The second clause is there
  // because a bare personal name invites the question the page should answer first: there is no
  // company behind this, and saying so is more useful to a visitor than leaving them to guess.
  entity: 'Cristian Arellano Muñoz, an individual rather than a registered company',
  contact: 'hi@cristianarellano.com',
  // Reads as "governed by the law of {jurisdiction}", so it is the bare country name and nothing else.
  jurisdiction: 'Colombia',
  // ANSWERED BY READING THE DEPLOYMENT, not by choosing a number that sounds reasonable.
  //
  // It was left null on the grounds that nobody had configured a policy. That was half right: nobody
  // *chose* one, and Azure applies its defaults regardless, so a policy exists whether or not anyone
  // decided it. Read off the running resources:
  //
  //   az sql db str-policy show    → 7 days point-in-time restore
  //   az sql db ltr-policy show    → PT0S weekly/monthly/yearly, i.e. no long-term retention at all
  //   log analytics workspace      → 30 days
  //
  // The page describes what happens to a visitor's data, not what somebody intended, so the honest
  // sentence is the measured one. The seven days matter more than they look: for a week after
  // somebody deletes their account, their CV is still recoverable from a database backup. That is
  // true of almost every service and almost none of them say it.
  //
  // If the policy is ever deliberately chosen, change it in Azure FIRST and then change this line —
  // in that order, so the page is never ahead of the deployment.
  logRetention: '30 days for server logs and 7 days for database backups',
};

/** True when every field is filled. The pages say so at the top when it is not. */
export const isComplete = (details: OperatorDetails): boolean =>
  Object.values(details).every((value) => value !== null && value !== '');
