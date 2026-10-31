// Course firing: when a ticket mixes courses, the earliest course goes to the kitchen now and later
// courses wait until a waiter fires them. Course 0 means "no course" and is never held.

export const COURSES: Record<number, string> = { 0: "No course", 1: "Starters", 2: "Mains", 3: "Desserts" };

/** For each item, whether it should be held. */
export function holdPlan(courses: number[]): boolean[] {
  const coursed = courses.filter((c) => c > 0);
  if (!coursed.length) return courses.map(() => false);
  const first = Math.min(...coursed);
  return courses.map((c) => c > first);
}

/** The course a "Fire" button sends next: the earliest course still on hold. */
export function nextCourse(heldCourses: number[]): number | null {
  return heldCourses.length ? Math.min(...heldCourses) : null;
}
