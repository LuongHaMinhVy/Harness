// Spike: kiểm chứng trên Gemini thật (1) prompt cache có được báo không,
// (2) prepareStep với toolChoice 'none' + instructions có ép model trả lời ở lượt cuối không.
import 'dotenv/config';
import { generateText, stepCountIs, tool, type ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const MAX_STEPS = 3;
const modelId = process.env.MODEL ?? 'gemini-2.5-flash';

// Phần cố định đủ dài (~1500 token) để vượt ngưỡng implicit cache.
const filler = Array.from({ length: 60 }, (_, i) =>
  `Tiêu chí ${i + 1}: bài làm phải đặt tên biến rõ ràng, xử lý trường hợp biên, không dùng biến toàn cục.`,
).join('\n');
const instructions = `Bạn là trợ lý thử nghiệm. Luôn gọi tool echo trước khi trả lời.\n${filler}`;

const tools = {
  echo: tool({
    description: 'Trả lại đúng chuỗi được gửi vào.',
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => ({ echoed: text }),
  }),
};

const history: ModelMessage[] = [];

for (const question of ['Hãy echo chữ "một".', 'Giờ echo lại chữ vừa rồi, kèm chữ "hai".']) {
  history.push({ role: 'user', content: question });
  const result = await generateText({
    model: google(modelId),
    instructions,
    messages: history,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    prepareStep: ({ stepNumber }) =>
      stepNumber === MAX_STEPS - 1
        ? { toolChoice: 'none', instructions: `${instructions}\nĐây là lượt cuối, không gọi tool.` }
        : {},
  });
  history.push(...result.response.messages);

  console.log(`\n=== ${question}`);
  for (const step of result.steps) {
    console.log(`step ${step.stepNumber}: finish=${step.finishReason} tools=${step.toolCalls.map(c => c.toolName).join(',') || '-'}`);
    console.log('  usage', JSON.stringify(step.usage));
    console.log('  providerMetadata', JSON.stringify(step.providerMetadata));
  }
  console.log(`steps=${result.steps.length} text=${JSON.stringify(result.text)}`);
}
