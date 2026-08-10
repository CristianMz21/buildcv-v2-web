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
  entity: null,
  contact: null,
  jurisdiction: null,
  logRetention: null,
};

/** True when every field is filled. The pages say so at the top when it is not. */
export const isComplete = (details: OperatorDetails): boolean =>
  Object.values(details).every((value) => value !== null && value !== '');
