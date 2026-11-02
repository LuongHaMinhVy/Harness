export type GradeRequest = { assignment: string; student: string; score: number; comments: string };
export type Approver = (req: GradeRequest) => Promise<boolean>;

export const autoApprove: Approver = async () => true;

const YES = new Set(['y', 'yes', 'c', 'có']);

// Dừng agent loop và hỏi người dùng trước khi tool ghi điểm.
export function createConsoleApprover(ask: (question: string) => Promise<string>): Approver {
  return async ({ student, score, comments }) => {
    const answer = await ask(`\n⏸  Model muốn lưu: ${student} · ${score}/10 · "${comments}"\n   Duyệt? (y/n) `);
    return YES.has(answer.trim().toLowerCase());
  };
}
