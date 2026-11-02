import type { TestSummary } from '@harness/shared/api';

// Câu trong bài nộp nhắm vào AI chấm bài (prompt injection) — chỉ để gắn cờ cho giảng viên xem, không tự đổi điểm.
const INJECTION = [
  /(bỏ qua|bo qua|phớt lờ|ignore|disregard|forget)[^\n]{0,40}(rubric|hướng dẫn|chỉ dẫn|lệnh|yêu cầu|instruction|prompt|rule)/i,
  /(cho|chấm|give|award|grade)[^\n]{0,20}(bài này|this|me|tôi|em)?[^\n]{0,10}\b10\s*(điểm|\/\s*10|points?|marks?)/i,
  /\b(ai|llm|gpt|gemini|claude|model|assistant|grader|giám khảo|người chấm)\b[^\n]{0,30}(score|điểm)\s*[:=]\s*10\b/i,
  /system prompt|you are (now )?(an? |the )?(grader|assistant)/i,
];

export function gradingFlags(input: { aiScore: number | null; tests: TestSummary | null; sources: string[]; hitLimit: boolean }): string[] {
  const flags: string[] = [];
  const { aiScore, tests } = input;
  if (aiScore === null) flags.push('AI chưa đề xuất điểm (có thể do hết lượt hoặc lỗi) — cần chấm tay');
  if (!tests) flags.push('AI chưa chạy test — điểm chức năng chưa được kiểm chứng');
  if (aiScore !== null && tests) {
    if (tests.status === 'ok' && tests.total && tests.total > 0) {
      const expected = ((tests.passed ?? 0) / tests.total) * 10;
      if (aiScore - expected > 2) flags.push(`Điểm AI (${aiScore}) cao hơn nhiều so với tỉ lệ test đạt (${tests.passed}/${tests.total})`);
    } else if (tests.status !== 'ok' && aiScore > 2) {
      flags.push(`Bài không chạy được (${tests.status}) nhưng AI cho ${aiScore} điểm`);
    }
  }
  if (input.sources.some((src) => INJECTION.some((re) => re.test(src)))) {
    flags.push('Bài nộp có câu nhắm vào AI chấm bài — kiểm tra kỹ trước khi duyệt');
  }
  if (input.hitLimit) flags.push('AI dùng hết số lượt cho phép — câu trả lời có thể chưa đầy đủ');
  return flags;
}
