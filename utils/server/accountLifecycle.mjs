// A server-only deletion marker prevents old sessions and in-flight writers
// from recreating student data while a resumable erasure is running.
export function accountDeletionRef(db, uid) {
  return db.collection('accountDeletions').doc(uid);
}

export async function assertAccountActive(db, uid, transaction) {
  const ref = accountDeletionRef(db, uid);
  const snapshot = await (transaction ? transaction.get(ref) : ref.get());
  if (snapshot.exists) {
    const error = new Error('Account deletion is in progress or has completed.');
    error.code = 'auth/account-deleting';
    error.status = 409;
    throw error;
  }
}
