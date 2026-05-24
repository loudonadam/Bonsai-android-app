# Security Specification: Bonsai Care Tracker

This document defines the security boundaries, data invariants, rogue test payloads ("The Dirty Dozen"), and validation requirements for the Bonsai Care Tracker application.

## 1. Data Invariants

1. **User Ownership Boundaries**: No user can read, query, update, or delete any tree, measurement, care log, or task belonging to another user. Access control is completely owner-locked to the authenticated user ID (`request.auth.uid`).
2. **Master Gate Relationship (Sub-collection Constraint)**:
   - Any measurement, care log, or task must belong to a parent Bonsai Tree document.
   - Creating or writing a sub-collection item (e.g., measurement or task) requires verifying that the parent tree exists and is owned by the writing user:
     `get(/databases/$(database)/documents/users/$(userId)/trees/$(treeId)).data.userId == request.auth.uid`
3. **Data Type and Size Hardening**:
   - `id` values of all entities must be validated against `isValidId` patterns (`^[a-zA-Z0-9_\-]+$`) to prevent injection and Denial of Wallet (DoW) attacks via huge key allocation.
   - All text fields have strict size check boundaries (e.g., Tree name and species `<= 100` characters, task titles `<= 200` characters, photo Base64 data `<= 250,000` characters to prevent raw payload bloat while allowing compressed canvas thumbnails).
4. **Time Invariance**:
   - `createdAt` must be locked to `request.time` on generation and remain completely immutable forever.
   - `updatedAt` on Tree matches `request.time` strictly on any write/update.
5. **Verified Users Constraint**:
   - Standard write operations are strictly restricted to authenticated users.

---

## 2. The Dirty Dozen (Rogue Payloads)

Here are twelve payloads designed to attack the system, all of which will be mathematically rejected by our `firestore.rules`.

### ID Poisoning & Injection Attacks
1. **P1-Junk-ID**: Creating a tree document with a 2MB garbage string as the tree ID.
   * *Status*: REJECTED by `isValidId(treeId)`.
2. **P2-Invalid-Format-ID**: Document ID containing SQL-injection characters like `/users/123/trees/my_tree;DROP TABLE trees`.
   * *Status*: REJECTED by strict regex `^[a-zA-Z0-9_\-]+$`.

### Identity Spoofing & Escalation
3. **P3-Owner-Hijack**: User `user-A` tries to write a tree where `userId` is set to `user-B` (admin) attempting to spoof another user's account.
   * *Status*: REJECTED by `data.userId == request.auth.uid`.
4. **P4-Cross-User-Subcollection**: User `user-A` try to write a care log under `user-B`'s tree collection `/users/user-B/trees/tree-123/measurements/...`
   * *Status*: REJECTED by outer match rule `match /users/{userId}` requiring `request.auth.uid == userId`.

### Orphaned Records & Boundary Violations
5. **P5-Orphaned-Measurement**: User tries to add a trunk width measurement to a tree ID that does not exist in the database.
   * *Status*: REJECTED by Master Gate checking `exists()` of parent tree.
6. **P6-Out-Of-Bounds-Measurement**: User attempts to send a negative width `-25` or a gigantic number `9999999` to crash graphs.
   * *Status*: REJECTED by `width >= 0.0 && width <= 1000.0` check.

### State & Temporal Integrity Tampering
7. **P7-Future-Time-Spoofing**: User submits client-edited `createdAt` set to year 2099 to bypass chronological sorting.
   * *Status*: REJECTED by `createdAt == request.time`.
8. **P8-Immutability-Violation**: Attempting to alter the `createdAt` or `userId` during an update.
   * *Status*: REJECTED by `incoming().userId == existing().userId` and `incoming().createdAt == existing().createdAt`.

### Size Bloat & Resource Poisoning (DoW)
9. **P9-Giant-Tree-Name**: Sending a text book of 100KB characters in the tree's nickname field.
   * *Status*: REJECTED by `data.name.size() <= 100`.
10. **P10-Giant-Photo-Payload**: Attempting to bypass limits by sending a 5MB base64 string in the photo field to exhaust Firestore storage.
    * *Status*: REJECTED by `data.photoBase64.size() <= 250000` limit check.

### Safe Queries Control
11. **P11-Blanket-List-Scrape**: Authenticated user tries to run a flat `collectionGroup` query or non-filtered fetch to scrape another user's list.
    * *Status*: REJECTED by rules validating `resource.data.userId == request.auth.uid` on lists.
12. **P12-Unverified-User-Write**: Authenticated user but with email not verified (`email_verified == false`) trying to write a tree.
    * *Status*: REJECTED by `request.auth.token.email_verified == true` requirement.

---

## 3. Test Runner Definition

To guarantee absolute obedience to these rules, the following test suite structure verifies permissions using the firebase-rules emulator setup:

```typescript
// firestore.rules.test.ts
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Simple mock test suite visualizing our strict checks
describe('Bonsai Care Tracker - Security Rules', () => {
  let env;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'macro-aurora-328621',
      firestore: {
        host: 'localhost',
        port: 8080,
      }
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('rejects unauthenticated read/write blocks', async () => {
    const unauthDb = env.unauthenticatedContext().firestore();
    await assertFails(unauthDb.doc('users/alice/trees/tree-1').get());
  });

  it('allows owner to write tree with correct format', async () => {
    const aliceDb = env.authenticatedContext('alice', { email: 'alice@gmail.com', email_verified: true }).firestore();
    await assertSucceeds(aliceDb.doc('users/alice/trees/tree-1').set({
      userId: 'alice',
      name: 'Old Pine',
      species: 'Pinus thunbergii',
      status: 'Healthy',
      createdAt: aliceDb.FieldValue.serverTimestamp(),
      updatedAt: aliceDb.FieldValue.serverTimestamp(),
    }));
  });

  it('blocks Alice from writing to Bob\'s tree collection', async () => {
    const aliceDb = env.authenticatedContext('alice', { email: 'alice@gmail.com', email_verified: true }).firestore();
    await assertFails(aliceDb.doc('users/bob/trees/tree-1').set({
      userId: 'bob',
      name: 'Intruder Pine',
    }));
  });
});
```
