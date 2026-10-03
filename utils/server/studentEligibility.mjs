export class StudentEligibilityError extends Error {
  constructor(message, status = 403, code = 'AGE_DECLARATION_REQUIRED') {
    super(message); this.status = status; this.code = code;
  }
}

export async function assertAdultStudent(db, uid) {
  if (!db) throw new StudentEligibilityError('Student eligibility is temporarily unavailable.', 503, 'ELIGIBILITY_UNAVAILABLE');
  let profile;
  try { profile = await db.collection('users').doc(uid).get(); }
  catch { throw new StudentEligibilityError('Student eligibility is temporarily unavailable.', 503, 'ELIGIBILITY_UNAVAILABLE'); }
  if (!profile.exists || profile.data()?.ageBand !== '18-plus') {
    throw new StudentEligibilityError('SkillBun student accounts currently require age 18 or above. Confirm your age in your profile to continue.');
  }
}
