import type { Assignment, User } from '@harness/shared/api';
import type { Db } from '../db/database.js';

type Row = {
  id: number;
  slug: string;
  title: string;
  description: string;
  rubric: string;
  entry_file: string;
  class_id: number;
  class_name: string;
  teacher_id: number;
  due_at: number | null;
  created_at: number;
  updated_at: number;
};

const toAssignment = (r: Row): Assignment => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  rubric: r.rubric,
  entryFile: r.entry_file,
  classId: r.class_id,
  className: r.class_name,
  dueAt: r.due_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT = `SELECT a.*, c.name AS class_name, c.teacher_id FROM assignments a JOIN classes c ON c.id = a.class_id`;

export type AssignmentInput = { title: string; description: string; rubric: string; entryFile: string; classId: number; dueAt: number | null };

export function createAssignmentRepo(db: Db, now: () => number = Date.now) {
  const repo = {
    create(slug: string, a: AssignmentInput, createdBy: number): Assignment {
      const { id } = db
        .prepare(
          'INSERT INTO assignments (slug, title, description, rubric, entry_file, class_id, created_by, due_at, created_at, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        )
        .get(slug, a.title, a.description, a.rubric, a.entryFile, a.classId, createdBy, a.dueAt, now(), now()) as { id: number };
      return repo.get(id)!;
    },
    update(id: number, a: AssignmentInput): Assignment {
      db.prepare(
        'UPDATE assignments SET title = ?, description = ?, rubric = ?, entry_file = ?, class_id = ?, due_at = ?, updated_at = ? WHERE id = ?',
      ).run(a.title, a.description, a.rubric, a.entryFile, a.classId, a.dueAt, now(), id);
      return repo.get(id)!;
    },
    get(id: number): Assignment | null {
      const r = db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as Row | undefined;
      return r ? toAssignment(r) : null;
    },
    /** Đề chỉ hiện với giảng viên phụ trách lớp hoặc admin; không phải thì null (route trả 404). */
    getForTeacher(id: number, user: User): Assignment | null {
      const r = db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as Row | undefined;
      return r && (user.role === 'admin' || r.teacher_id === user.id) ? toAssignment(r) : null;
    },
    listForTeacher(user: User): Assignment[] {
      const rows = (
        user.role === 'admin'
          ? db.prepare(`${SELECT} ORDER BY a.id DESC`).all()
          : db.prepare(`${SELECT} WHERE c.teacher_id = ? ORDER BY a.id DESC`).all(user.id)
      ) as Row[];
      return rows.map(toAssignment);
    },
    /** Đề được giao cho lớp mà học viên là thành viên. */
    getForStudent(id: number, studentId: number): Assignment | null {
      const r = db
        .prepare(`${SELECT} JOIN class_members m ON m.class_id = a.class_id WHERE a.id = ? AND m.student_id = ?`)
        .get(id, studentId) as Row | undefined;
      return r ? toAssignment(r) : null;
    },
    listForStudent(studentId: number): Assignment[] {
      const rows = db
        .prepare(`${SELECT} JOIN class_members m ON m.class_id = a.class_id WHERE m.student_id = ? ORDER BY COALESCE(a.due_at, a.created_at)`)
        .all(studentId) as Row[];
      return rows.map(toAssignment);
    },
    slugTaken(slug: string): boolean {
      return db.prepare('SELECT 1 FROM assignments WHERE slug = ?').get(slug) !== undefined;
    },
    findBySlug(slug: string): Assignment | null {
      const r = db.prepare(`${SELECT} WHERE a.slug = ?`).get(slug) as Row | undefined;
      return r ? toAssignment(r) : null;
    },
  };
  return repo;
}

export type AssignmentRepo = ReturnType<typeof createAssignmentRepo>;
