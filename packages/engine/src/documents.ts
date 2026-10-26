/**
 * The exact text a member is shown when they consent and when they appoint us
 * as their agent. Versioned and hashed: what we can prove later is that this
 * specific wording was accepted at this time. See docs/data-model.md.
 *
 * These are engineering artefacts, not reviewed legal instruments. A deployment
 * that acts for anyone other than its own operator needs a lawyer to review
 * them first. See docs/research/05-legal-basis.md.
 */

export const CONSENT_VERSION = 'consent-v1';

export const CONSENT_DOCUMENT = `deletewe — what you are agreeing to

1. WHAT WE COLLECT
   Only what is needed to find your records and ask for their removal: your
   name and any former names, the addresses you have lived at, your phone
   numbers and email addresses, and your date of birth. Every field except one
   name and one email address is optional. More detail means better matching
   and more disclosure; the choice is yours, field by field.

2. WHAT WE DO WITH IT
   We search data brokers and people-search sites for records that look like
   you. We show you what we found and why we think it is you. If you confirm
   it, we ask that broker to remove it, acting as your authorized agent.

3. WHAT WE SEND, AND TO WHOM
   Each broker receives only the fields their own opt-out procedure requires.
   We do not send your full profile to anyone. The broker will see those fields
   because removing your record requires identifying it.

4. WHAT WE WILL NEVER DO
   - Look up anyone other than you.
   - Sell, rent, or share your data with anyone except the brokers you approve.
   - Solve a CAPTCHA, bypass a login, or evade any access control.
   - Train anything on your data, or use it for any purpose other than
     fulfilling your requests.

5. HOW IT IS STORED
   Encrypted with a key held for your account alone. Your details are kept out
   of our logs. Deleting your account destroys that key immediately, which
   makes everything stored under it unreadable, and then deletes the records.

6. WHAT WE CANNOT PROMISE
   No service removes everything. Independent testing puts the realistic
   ceiling at 70-80%, and only with repeated re-checking. Brokers re-list
   people. We keep checking, and we show you the evidence either way.

7. YOU CAN STOP AT ANY TIME
   Withdraw consent and we stop contacting brokers immediately. Export
   everything we hold, or delete it, from your account page.`;

export const MANDATE_VERSION = 'mandate-v1';

export const MANDATE_DOCUMENT = `Authorization to act as my agent

I appoint the operator of this deletewe instance as my authorized agent for the
limited purpose of exercising my rights to delete, correct, and opt out of the
sale or sharing of my personal information, under the California Consumer
Privacy Act as amended, under any other privacy law that applies to me, and
under the published policies of any business holding my information.

This authorization permits my agent, on my behalf and only on my behalf, to:

  (a) identify records about me held by data brokers and people-search sites;
  (b) submit deletion and opt-out requests naming me as the subject;
  (c) correspond with those businesses about my requests;
  (d) complete and sign opt-out forms that require a signature;
  (e) receive confirmations and act on them to complete my requests.

This authorization does not permit my agent to:

  (x) act in respect of any person other than me;
  (y) use my personal information for any purpose other than fulfilling these
      requests, verifying them, and preventing fraud;
  (z) sell, licence, or disclose my information except to a business named in a
      request I have approved.

I understand a business may ask me to confirm this authorization directly, or
to verify my own identity, and that I may be asked to complete steps my agent
will not perform for me, such as a CAPTCHA or an identity check.

I may revoke this authorization at any time, with immediate effect.

Signed: {{signature}}
Date:   {{date}}`;

export const LPOA_VERSION = 'lpoa-v1';

export const LPOA_DOCUMENT = `${MANDATE_DOCUMENT}

LIMITED POWER OF ATTORNEY

In addition to the authorization above, I grant my agent a limited power of
attorney, confined to the purposes stated above, to sign opt-out documents and
to create accounts with a business where that business requires an account in
order to manage or suppress a record about me. This limited power of attorney
confers no authority over my finances, property, health care, or any matter
beyond the removal of my personal information from the businesses described.

This limited power of attorney terminates on my revocation of the authorization
above, or on my death, whichever is earlier.

Signed: {{signature}}
Date:   {{date}}`;

export interface MandateDocument {
  readonly version: string;
  readonly text: string;
}

export function mandateDocument(kind: 'authorized_agent' | 'limited_power_of_attorney'): MandateDocument {
  return kind === 'limited_power_of_attorney'
    ? { version: LPOA_VERSION, text: LPOA_DOCUMENT }
    : { version: MANDATE_VERSION, text: MANDATE_DOCUMENT };
}

export function fillMandate(text: string, signature: string, date: string): string {
  return text.replace('{{signature}}', signature).replace('{{date}}', date);
}

export const MANDATE_SCOPE = [
  'identify_records',
  'submit_deletion_requests',
  'correspond_with_brokers',
  'sign_opt_out_forms',
  'receive_confirmations',
] as const;
