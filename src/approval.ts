export type GradeRequest = { assignment: string; student: string; score: number; comments: string };
export type Approver = (req: GradeRequest) => Promise<boolean>;

export const autoApprove: Approver = async () => true;

const YES = new Set(['y', 'yes', 'c', 'có']);

// Dừng agent loop và hỏi người dùng trước khi tool ghi điểm.
// SDK chạy các tool call trong cùng một lượt song song, còn readline bỏ mất câu hỏi thứ hai nếu câu đầu chưa xong,
// nên các lần hỏi được xếp hàng lần lượt.
export function createConsoleApprover(ask: (question: string) => Promise<string>): Approver {
  let queue: Promise<unknown> = Promise.resolve();
  return ({ student, score, comments }) => {
    const turn = queue.then(async () => {
      const answer = await ask(`\n⏸  Model muốn lưu: ${student} · ${score}/10 · "${comments}"\n   Duyệt? (y/n) `);
      return YES.has(answer.trim().toLowerCase());
    });
    queue = turn.catch(() => {});
    return turn;
  };
}
