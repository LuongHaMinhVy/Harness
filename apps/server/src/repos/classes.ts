import type { ClassSummary, User } from '@harness/shared/api';
import type { Db } from '../db/database.js';
import { createUserRepo } from './users.js';

type Row = { id: number; name: string; teacher_id: number; teacher_name: string; student_count: number; created_at: number };

const toClass = (r: Row): ClassSummary => ({
  id: r.id,
  name: r.name,
  teacherId: r.teacher_id,
  teacherName: r.teacher_name,
  studentCount: r.student_count,
  createdAt: r.created_at,
});

const SELECT = `
  SELECT c.id, c.name, c.teacher_id, c.created_at, u.full_name AS teacher_name,
         (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS student_count
  FROM classes c JOIN users u ON u.id = c.teacher_id`;

export function createClassRepo(db: Db, now: () => number = Date.now) {
  const users = createUserRepo(db, now);
  const repo = {
    create(name: string, teacherId: number): ClassSummary {
      const { id } = db.prepare('INSERT INTO classes (name, teacher_id, created_at) VALUES (?, ?, ?) RETURNING id').get(name, teacherId, now()) as {
        id: number;
      };
      return repo.get(id)!;
    },
    get(id: number): ClassSummary | null {
      const r = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
      return r ? toClass(r) : null;
    },
    /** Lớp chỉ hiện với giảng viên phụ trách hoặc admin; không phải thì null (route trả 404). */
    getFor(id: number, user: User): ClassSummary | null {
      const c = repo.get(id);
      return c && (user.role === 'admin' || c.teacherId === user.id) ? c : null;
    },
    listFor(user: User): ClassSummary[] {
      const rows = (
        user.role === 'admin'
          ? db.prepare(`${SELECT} ORDER BY c.id`).all()
          : db.prepare(`${SELECT} WHERE c.teacher_id = ? ORDER BY c.id`).all(user.id)
      ) as Row[];
      return rows.map(toClass);
    },
    rename(id: number, name: string): void {
      db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(name, id);
    },
    members(classId: number): User[] {
      const ids = db.prepare('SELECT student_id FROM class_members WHERE class_id = ?').all(classId) as { student_id: number }[];
      return ids
        .map((r) => users.findById(r.student_id))
        .filter((u): u is User => u !== null)
        .sort((a, b) => a.username.localeCompare(b.username));
    },
    isMember(classId: number, studentId: number): boolean {
      return db.prepare('SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?').get(classId, studentId) !== undefined;
    },
    addMember(classId: number, studentId: number): void {
      db.prepare('INSERT OR IGNORE INTO class_members (class_id, student_id) VALUES (?, ?)').run(classId, studentId);
    },
    removeMember(classId: number, studentId: number): boolean {
      return Number(db.prepare('DELETE FROM class_members WHERE class_id = ? AND student_id = ?').run(classId, studentId).changes) > 0;
    },
    /** Học viên có học lớp nào của giảng viên khác teacherId không. */
    sharedWithOtherTeacher(studentId: number, teacherId: number): boolean {
      return (
        db
          .prepare('SELECT 1 FROM class_members m JOIN classes c ON c.id = m.class_id WHERE m.student_id = ? AND c.teacher_id <> ? LIMIT 1')
          .get(studentId, teacherId) !== undefined
      );
    },
    classIdsOfStudent(studentId: number): number[] {
      return (db.prepare('SELECT class_id FROM class_members WHERE student_id = ?').all(studentId) as { class_id: number }[]).map((r) => r.class_id);
    },
  };
  return repo;
}

export type ClassRepo = ReturnType<typeof createClassRepo>;
